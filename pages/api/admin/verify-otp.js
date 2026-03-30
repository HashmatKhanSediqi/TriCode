import { connectDB } from "../../../lib/mongodb";
import User from "../../../models/User";
import {
  ADMIN_PREAUTH_COOKIE,
  issueAdminSession,
  readAdminPreauth,
  verifyOtpHash,
} from "../../../lib/auth";
import { clearCookie, setCookies } from "../../../lib/cookies";
import { requireCsrf } from "../../../lib/csrf";
import { enforceRouteRateLimit } from "../../../lib/rateLimit";
import { logSecurityEvent } from "../../../lib/security-log";

const OTP_MAX_ATTEMPTS = 5;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  const otp = String(req.body?.otp || "").trim();
  const preauth = readAdminPreauth(req);

  if (!preauth) {
    return res.status(401).json({ message: "OTP session expired. Request a new OTP." });
  }

  const rate = await enforceRouteRateLimit(req, res, {
    route: "admin:verify_otp",
    email: preauth.email,
    ipLimit: 20,
    ipWindowSec: 60,
    emailLimit: 20,
    emailWindowSec: 10 * 60,
  });

  if (!rate.ok) {
    return res.status(429).json({ message: rate.message });
  }

  try {
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "OTP must be 6 digits." });
    }

    await connectDB();

    const user = await User.findById(preauth.userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Access denied." });
    }

    if (String(user.email || "").toLowerCase() !== String(preauth.email || "").toLowerCase()) {
      return res.status(401).json({ message: "OTP session mismatch. Request a new OTP." });
    }

    if (!user.adminOtpHash || !user.adminOtpExpiry) {
      return res.status(400).json({ message: "OTP not requested." });
    }

    if (Date.now() > new Date(user.adminOtpExpiry).getTime()) {
      user.adminOtpHash = null;
      user.adminOtpExpiry = null;
      user.adminOtpAttempts = 0;
      await user.save();
      return res.status(400).json({ message: "OTP expired. Request a new OTP." });
    }

    if (Number(user.adminOtpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
      await logSecurityEvent(req, {
        eventType: "admin.otp.locked",
        status: "warn",
        userId: user._id,
        email: user.email,
      });
      return res.status(429).json({ message: "Too many invalid attempts." });
    }

    const matched = verifyOtpHash(user.email, otp, user.adminOtpHash, "admin-otp");
    if (!matched) {
      user.adminOtpAttempts = Number(user.adminOtpAttempts || 0) + 1;
      await user.save();

      await logSecurityEvent(req, {
        eventType: "admin.otp.failure",
        status: "warn",
        userId: user._id,
        email: user.email,
        metadata: { attempts: user.adminOtpAttempts },
      });

      if (user.adminOtpAttempts >= OTP_MAX_ATTEMPTS) {
        return res.status(429).json({ message: "Too many invalid attempts." });
      }

      return res.status(400).json({ message: "Invalid OTP." });
    }

    user.adminOtpHash = null;
    user.adminOtpExpiry = null;
    user.adminOtpAttempts = 0;
    await user.save();

    await issueAdminSession(res, user, req);

    setCookies(res, clearCookie(ADMIN_PREAUTH_COOKIE, { path: "/", httpOnly: true, sameSite: "Lax" }));

    await logSecurityEvent(req, {
      eventType: "admin.login.success",
      status: "ok",
      userId: user._id,
      email: user.email,
    });

    return res.status(200).json({ message: "Admin authenticated." });
  } catch (error) {
    console.error("admin/verify-otp error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
}
