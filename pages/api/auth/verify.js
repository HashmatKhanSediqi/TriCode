import { connectDB } from "../../../lib/mongodb";
import User from "../../../models/User";
import {
  USER_PREAUTH_COOKIE,
  issueUserSession,
  readUserPreauth,
  verifyOtpHash,
} from "../../../lib/auth";
import { clearCookie, setCookies } from "../../../lib/cookies";
import { requireCsrf } from "../../../lib/csrf";
import { enforceRouteRateLimit } from "../../../lib/rateLimit";
import { logSecurityEvent } from "../../../lib/security-log";
import mongoose from "mongoose";
import { getSystemConfig } from "../../../lib/system";

const MAX_VERIFY_ATTEMPTS = 5;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  const code = String(req.body?.code || "").replace(/\D/g, "");
  const preauth = readUserPreauth(req);

  if (!preauth) {
    return res.status(401).json({ message: "Session expired. Please login again." });
  }

  const rate = await enforceRouteRateLimit(req, res, {
    route: "auth:verify",
    email: preauth.email,
    ipLimit: 15,
    ipWindowSec: 60,
    emailLimit: 20,
    emailWindowSec: 15 * 60,
  });

  if (!rate.ok) {
    return res.status(429).json({ message: rate.message });
  }

  try {
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: "OTP must be 6 digits." });
    }

    const userId = String(preauth.userId || "");
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      await logSecurityEvent(req, {
        eventType: "auth.verify.invalid_user_id",
        status: "warn",
        email: preauth.email,
      });
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    await connectDB();
    const systemConfig = await getSystemConfig();
    if (systemConfig?.features?.userLogin === false) {
      await logSecurityEvent(req, {
        eventType: "auth.verify.disabled",
        status: "warn",
        email: preauth.email,
      });
      return res.status(403).json({ message: "User login is disabled by admin." });
    }

    const user = await User.findById(userId);
    if (!user || user.email !== preauth.email) {
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    if (!user.verifyCodeHash || !user.verifyExpiry) {
      return res.status(400).json({ message: "Verification code is not available." });
    }

    if (Date.now() > new Date(user.verifyExpiry).getTime()) {
      user.verifyCodeHash = null;
      user.verifyExpiry = null;
      user.verifyAttempts = 0;
      await user.save();
      return res.status(400).json({ message: "Verification code expired. Please login again." });
    }

    if (Number(user.verifyAttempts || 0) >= MAX_VERIFY_ATTEMPTS) {
      await logSecurityEvent(req, {
        eventType: "auth.verify.locked",
        status: "warn",
        userId: user._id,
        email: user.email,
      });
      return res.status(429).json({ message: "Too many invalid attempts." });
    }

    const matched = verifyOtpHash(user.email, code, user.verifyCodeHash, "user-login");
    if (!matched) {
      user.verifyAttempts = Number(user.verifyAttempts || 0) + 1;
      await user.save();

      await logSecurityEvent(req, {
        eventType: "auth.verify.failure",
        status: "warn",
        userId: user._id,
        email: user.email,
        metadata: { attempts: user.verifyAttempts },
      });

      if (user.verifyAttempts >= MAX_VERIFY_ATTEMPTS) {
        return res.status(429).json({ message: "Too many invalid attempts." });
      }

      return res.status(400).json({ message: "Invalid verification code." });
    }

    user.isVerified = true;
    user.verifyCodeHash = null;
    user.verifyExpiry = null;
    user.verifyAttempts = 0;
    await user.save();

    await issueUserSession(res, user, req);

    setCookies(res, clearCookie(USER_PREAUTH_COOKIE, { path: "/", httpOnly: true, sameSite: "Lax" }));

    await logSecurityEvent(req, {
      eventType: "auth.verify.success",
      status: "ok",
      userId: user._id,
      email: user.email,
    });

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        language: user.language,
      },
    });
  } catch (error) {
    console.error("auth/verify error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
