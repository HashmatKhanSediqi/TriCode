import { connectDB } from "../../../lib/mongodb";
import User from "../../../models/User";
import { hashPassword } from "../../../lib/auth";
import { enforceRouteRateLimit, getClientIp } from "../../../lib/rateLimit";
import { requireCsrf } from "../../../lib/csrf";
import { logSecurityEvent } from "../../../lib/security-log";
import { verifyCaptcha } from "../../../lib/captcha";
import { deriveNameFromEmail, validateRegisterPayload } from "../../../lib/validation";
import { getSystemConfig } from "../../../lib/system";

const REGISTER_SUCCESS_RESPONSE = {
  message: "Registration successful. Please login.",
};

const REGISTER_DUPLICATE_RESPONSE = {
  message: "This email is already registered. Please login instead.",
};

const REGISTER_INVALID_RESPONSE = {
  message: "Invalid registration details.",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  const email = String(req.body?.email || "").trim().toLowerCase();

  const rate = await enforceRouteRateLimit(req, res, {
    route: "auth:register",
    email,
    ipLimit: 10,
    ipWindowSec: 60,
    emailLimit: 5,
    emailWindowSec: 15 * 60,
  });

  if (!rate.ok) {
    return res.status(429).json({ message: rate.message });
  }

  try {
    const parsed = validateRegisterPayload(req.body);
    if (!parsed.ok) {
      await logSecurityEvent(req, {
        eventType: "auth.register.invalid_input",
        status: "warn",
        email,
      });
      return res.status(400).json(REGISTER_INVALID_RESPONSE);
    }

    const { name, password, captchaToken, email: parsedEmail } = parsed.data;
    const safeEmail = parsedEmail || email;

    await connectDB();
    const systemConfig = await getSystemConfig();
    if (systemConfig?.features?.userSignup === false) {
      await logSecurityEvent(req, {
        eventType: "auth.register.disabled",
        status: "warn",
        email: safeEmail,
      });
      return res.status(403).json({ message: "Signups are disabled by admin." });
    }

    const captcha = await verifyCaptcha({
      token: captchaToken,
      ip: getClientIp(req),
      action: "register",
    });

    if (!captcha.ok) {
      await logSecurityEvent(req, {
        eventType: "auth.register.captcha_failed",
        status: "warn",
        email: safeEmail,
        metadata: { message: captcha.message },
      });
      return res.status(400).json({ message: "Captcha verification failed." });
    }

    const existing = await User.findOne({ email: safeEmail }).select("_id").lean();
    if (existing) {
      await logSecurityEvent(req, {
        eventType: "auth.register.duplicate",
        status: "warn",
        email: safeEmail,
      });
      return res.status(409).json(REGISTER_DUPLICATE_RESPONSE);
    }

    const passwordHash = await hashPassword(password);

    await User.create({
      name: name || deriveNameFromEmail(safeEmail),
      email: safeEmail,
      password: passwordHash,
      role: "user",
      isVerified: false,
    });

    await logSecurityEvent(req, {
      eventType: "auth.register.success",
      status: "ok",
      email: safeEmail,
    });

    return res.status(201).json(REGISTER_SUCCESS_RESPONSE);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json(REGISTER_DUPLICATE_RESPONSE);
    }

    console.error("auth/register error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
