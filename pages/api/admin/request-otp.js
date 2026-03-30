import { connectDB } from "../../../lib/mongodb";
import User from "../../../models/User";
import {
  generateOtpCode,
  hashOtp,
  issueAdminPreauthCookie,
} from "../../../lib/auth";
import { requireCsrf } from "../../../lib/csrf";
import { enqueueOtpEmail } from "../../../lib/emailQueue";
import { enforceRouteRateLimit } from "../../../lib/rateLimit";
import { logSecurityEvent } from "../../../lib/security-log";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  const email = normalizeEmail(req.body?.email);

  const rate = await enforceRouteRateLimit(req, res, {
    route: "admin:request_otp",
    email,
    ipLimit: 8,
    ipWindowSec: 60,
    emailLimit: 5,
    emailWindowSec: 15 * 60,
  });

  if (!rate.ok) {
    return res.status(429).json({ message: rate.message });
  }

  try {
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    await connectDB();

    const user = await User.findOne({ email, role: "admin" });
    if (!user) {
      await logSecurityEvent(req, {
        eventType: "admin.otp.request_denied",
        status: "warn",
        email,
      });
      return res.status(403).json({ message: "Access denied." });
    }

    const lastSentMs = new Date(user.adminOtpLastSentAt || 0).getTime();
    if (lastSentMs && Date.now() - lastSentMs < RESEND_COOLDOWN_MS) {
      return res.status(429).json({ message: "Please wait before requesting another OTP." });
    }

    const otp = generateOtpCode();
    user.adminOtpHash = hashOtp(user.email, otp, "admin-otp");
    user.adminOtpExpiry = new Date(Date.now() + OTP_TTL_MS);
    user.adminOtpAttempts = 0;
    user.adminOtpLastSentAt = new Date();
    await user.save();

    try {
      await enqueueOtpEmail({
        to: user.email,
        name: user.name || "Admin",
        code: otp,
        purpose: "admin",
      });
    } catch (emailError) {
      await logSecurityEvent(req, {
        eventType: "admin.otp.delivery_failed",
        status: "warn",
        userId: user._id,
        email: user.email,
        metadata: { message: String(emailError?.message || emailError || "") },
      });

      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ message: "Unable to deliver OTP right now." });
      }

      return res.status(503).json({
        message: "Unable to deliver OTP right now. Please check email settings.",
      });
    }

    issueAdminPreauthCookie(res, {
      userId: String(user._id),
      email: user.email,
      role: "admin",
    });

    await logSecurityEvent(req, {
      eventType: "admin.otp.request_success",
      status: "ok",
      userId: user._id,
      email: user.email,
    });

    return res.status(200).json({
      message: "If authorized, OTP instructions have been sent.",
      requiresVerification: true,
    });
  } catch (error) {
    console.error("admin/request-otp error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
}
