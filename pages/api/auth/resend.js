import mongoose from "mongoose";
import { connectDB } from "../../../lib/mongodb";
import User from "../../../models/User";
import {
  generateOtpCode,
  hashOtp,
  issueUserPreauthCookie,
  readUserPreauth,
} from "../../../lib/auth";
import { requireCsrf } from "../../../lib/csrf";
import { verifyCaptcha } from "../../../lib/captcha";
import { enqueueOtpEmail } from "../../../lib/emailQueue";
import { enforceRouteRateLimit, getClientIp } from "../../../lib/rateLimit";
import { logSecurityEvent } from "../../../lib/security-log";
import { getSystemConfig } from "../../../lib/system";
import { shouldShowDevCode } from "../../../lib/env";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  const preauth = readUserPreauth(req);
  if (!preauth) {
    await logSecurityEvent(req, {
      eventType: "auth.resend.denied",
      status: "warn",
      metadata: { reason: "missing_preauth" },
    });
    return res.status(401).json({ message: "Session expired. Please login again." });
  }

  const rate = await enforceRouteRateLimit(req, res, {
    route: "auth:resend",
    email: preauth.email,
    ipLimit: 8,
    ipWindowSec: 60,
    emailLimit: 5,
    emailWindowSec: 15 * 60,
  });

  if (!rate.ok) {
    await logSecurityEvent(req, {
      eventType: "auth.resend.rate_limited",
      status: "warn",
      email: preauth.email,
    });
    return res.status(429).json({ message: rate.message });
  }

  try {
    const captcha = await verifyCaptcha({
      token: String(req.body?.captchaToken || "").trim(),
      ip: getClientIp(req),
      action: "resend",
    });

    if (!captcha.ok) {
      await logSecurityEvent(req, {
        eventType: "auth.resend.captcha_failed",
        status: "warn",
        email: preauth.email,
        metadata: { message: captcha.message },
      });
      return res.status(400).json({ message: "Captcha verification failed." });
    }

    await connectDB();
    const systemConfig = await getSystemConfig();
    if (systemConfig?.features?.userLogin === false) {
      await logSecurityEvent(req, {
        eventType: "auth.resend.disabled",
        status: "warn",
        email: preauth.email,
      });
      return res.status(403).json({ message: "User login is disabled by admin." });
    }

    const userId = String(preauth.userId || "");
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      await logSecurityEvent(req, {
        eventType: "auth.resend.invalid_session",
        status: "warn",
        email: preauth.email,
      });
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    const user = await User.findById(userId);
    if (!user || user.email !== preauth.email) {
      await logSecurityEvent(req, {
        eventType: "auth.resend.invalid_session",
        status: "warn",
        email: preauth.email,
      });
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    const lastSentMs = new Date(user.verifyLastSentAt || 0).getTime();
    if (lastSentMs && Date.now() - lastSentMs < RESEND_COOLDOWN_MS) {
      return res.status(429).json({ message: "Please wait before requesting another code." });
    }

    const code = generateOtpCode();
    const showDevCode = shouldShowDevCode();
    if (showDevCode) {
      console.log(`[DEV] OTP resend for ${user.email}: ${code}`);
    }

    user.verifyCodeHash = hashOtp(user.email, code, "user-login");
    user.verifyExpiry = new Date(Date.now() + OTP_TTL_MS);
    user.verifyAttempts = 0;
    user.verifyLastSentAt = new Date();
    await user.save();

    let emailSent = true;
    try {
      await enqueueOtpEmail({
        to: user.email,
        name: user.name,
        code,
        purpose: "user",
      });
    } catch (emailError) {
      emailSent = false;
      await logSecurityEvent(req, {
        eventType: "auth.otp.delivery_failed",
        status: "warn",
        userId: user._id,
        email: user.email,
        metadata: { message: String(emailError?.message || emailError || "") },
      });

      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({
          message: "Unable to deliver verification code right now. Please try again later.",
        });
      }

      if (!showDevCode) {
        return res.status(503).json({
          message: "Unable to deliver verification code right now. Please check email settings.",
        });
      }
    }

    issueUserPreauthCookie(res, {
      userId: String(user._id),
      email: user.email,
      role: user.role,
    });

    await logSecurityEvent(req, {
      eventType: "auth.resend.success",
      status: "ok",
      userId: user._id,
      email: user.email,
    });

    return res.status(200).json({
      message: "If the request is valid, a new code has been sent.",
      emailSent,
      ...(showDevCode ? { devCode: code } : {}),
    });
  } catch (error) {
    console.error("auth/resend error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
