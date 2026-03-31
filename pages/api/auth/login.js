import { connectDB } from "../../../lib/mongodb";
import User from "../../../models/User";
import {
  clearUserAuthCookies,
  hashPassword,
  comparePassword,
  generateOtpCode,
  hashOtp,
  issueUserPreauthCookie,
} from "../../../lib/auth";
import { requireCsrf } from "../../../lib/csrf";
import { enqueueOtpEmail } from "../../../lib/emailQueue";
import { enforceRouteRateLimit } from "../../../lib/rateLimit";
import { logSecurityEvent } from "../../../lib/security-log";
import { normalizeEmail } from "../../../lib/validation";
import { getSystemConfig } from "../../../lib/system";
import { isSmtpConfigured, shouldShowDevCode } from "../../../lib/env";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
function safeUserResponse() {
  return {
    message: "If credentials are valid, verification instructions have been sent.",
    requiresVerification: true,
    emailSent: true,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  const rate = await enforceRouteRateLimit(req, res, {
    route: "auth:login",
    email,
    ipLimit: 12,
    ipWindowSec: 60,
    emailLimit: 10,
    emailWindowSec: 10 * 60,
  });

  if (!rate.ok) {
    await logSecurityEvent(req, {
      eventType: "auth.login.rate_limited",
      status: "warn",
      email,
    });
    return res.status(429).json({ message: rate.message });
  }

  try {
    if (!email || !password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    await connectDB();
    const systemConfig = await getSystemConfig();
    if (systemConfig?.features?.userLogin === false) {
      await logSecurityEvent(req, {
        eventType: "auth.login.disabled",
        status: "warn",
        email,
      });
      return res.status(403).json({ message: "User login is disabled by admin." });
    }

    const candidates = await User.find({ email }).sort({ createdAt: -1 }).limit(5);
    let user = candidates[0] || null;

    if (!user) {
      await logSecurityEvent(req, {
        eventType: "auth.login.failure",
        status: "warn",
        email,
        metadata: { reason: "email_not_registered" },
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (candidates.length > 1) {
      await logSecurityEvent(req, {
        eventType: "auth.login.duplicate_email",
        status: "warn",
        email,
        metadata: { count: candidates.length },
      });
    }

    const lockNow = Date.now();
    const lockedUser = candidates.find(
      (candidate) =>
        candidate.loginLockUntil &&
        new Date(candidate.loginLockUntil).getTime() > lockNow,
    );
    if (lockedUser) {
      await logSecurityEvent(req, {
        eventType: "auth.login.locked",
        status: "warn",
        userId: lockedUser._id,
        email: lockedUser.email,
      });
      return res.status(429).json({ message: "Too many attempts. Please try again later." });
    }

    let authResult = await comparePassword(password, user.password);
    if (!authResult.valid && candidates.length > 1) {
      for (const candidate of candidates.slice(1)) {
        const candidateAuth = await comparePassword(password, candidate.password);
        if (candidateAuth.valid) {
          user = candidate;
          authResult = candidateAuth;
          break;
        }
      }
    }
    if (!authResult.valid) {
      const attempts = Number(user.failedLoginAttempts || 0) + 1;
      const updates = { failedLoginAttempts: attempts };

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        updates.loginLockUntil = new Date(Date.now() + LOCKOUT_MS);
      }

      await User.updateOne({ _id: user._id }, { $set: updates });

      await logSecurityEvent(req, {
        eventType: "auth.login.failure",
        status: "warn",
        userId: user._id,
        email: user.email,
        metadata: { reason: "invalid_credentials", attempts },
      });

      return res.status(401).json({ message: "Invalid credentials" });
    }

    const now = Date.now();
    const hasActiveOtp =
      Boolean(user.verifyCodeHash) &&
      user.verifyExpiry &&
      new Date(user.verifyExpiry).getTime() > now;
    const lastSentMs = new Date(user.verifyLastSentAt || 0).getTime();

    if (hasActiveOtp && lastSentMs && now - lastSentMs < 60 * 1000) {
      clearUserAuthCookies(res);
      issueUserPreauthCookie(res, {
        userId: String(user._id),
        email: user.email,
        role: user.role,
      });

      await logSecurityEvent(req, {
        eventType: "auth.login.reuse_otp",
        status: "ok",
        userId: user._id,
        email: user.email,
      });

      return res.status(200).json({
        ...safeUserResponse(),
        emailSent: true,
      });
    }

    const otpCode = generateOtpCode();
    const verifyCodeHash = hashOtp(user.email, otpCode, "user-login");
    const smtpConfigured = isSmtpConfigured();
    const showDevCode = shouldShowDevCode() || !smtpConfigured;

    if (showDevCode) {
      console.log(`[DEV] OTP for ${user.email}: ${otpCode}`);
    }

    if (authResult.needsUpgrade) {
      user.password = await hashPassword(password);
    }

    user.verifyCodeHash = verifyCodeHash;
    user.verifyExpiry = new Date(Date.now() + OTP_TTL_MS);
    user.verifyAttempts = 0;
    user.verifyLastSentAt = new Date();
    user.failedLoginAttempts = 0;
    user.loginLockUntil = null;
    await user.save();

    let emailSent = false;
    if (smtpConfigured) {
      emailSent = true;
      try {
        await enqueueOtpEmail({
          to: user.email,
          name: user.name,
          code: otpCode,
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

        if (!showDevCode) {
          return res.status(503).json({
            message:
              "Unable to deliver verification code right now. Please check email settings.",
          });
        }
      }
    }

    clearUserAuthCookies(res);
    issueUserPreauthCookie(res, {
      userId: String(user._id),
      email: user.email,
      role: user.role,
    });

    await logSecurityEvent(req, {
      eventType: "auth.login.success",
      status: "ok",
      userId: user._id,
      email: user.email,
    });

    return res.status(200).json({
      ...safeUserResponse(),
      emailSent,
      ...(showDevCode ? { devCode: otpCode } : {}),
    });
  } catch (error) {
    console.error("auth/login error:", error);

    if (/MONGODB_URI is missing/i.test(String(error?.message || ""))) {
      return res.status(503).json({
        message: "Server setup is incomplete. MONGODB_URI is missing in environment config.",
      });
    }

    if (/Missing required environment variable/i.test(String(error?.message || ""))) {
      return res.status(503).json({
        message: "Server setup is incomplete. Required auth environment variables are missing.",
      });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
}
