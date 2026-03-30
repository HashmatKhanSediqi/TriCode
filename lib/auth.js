import argon2 from "argon2";
import crypto from "crypto";
import Session from "../models/Session";
import { requireCsrf } from "./csrf";
import { clearCookie, buildCookie, setCookies } from "./cookies";
import { requireEnv, validateAuthEnv } from "./env";
import { connectDB } from "./mongodb";

validateAuthEnv();

const JWT_SECRET = requireEnv("JWT_SECRET");
const OTP_PEPPER = requireEnv("OTP_PEPPER");

const DEFAULT_PREAUTH_MAX_AGE_SEC = 10 * 60;
const DEFAULT_USER_MAX_AGE_SEC = 7 * 24 * 60 * 60;
const DEFAULT_ADMIN_MAX_AGE_SEC = 8 * 60 * 60;

export const USER_TOKEN_COOKIE = "token";
export const USER_PREAUTH_COOKIE = "preauth_token";
export const ADMIN_TOKEN_COOKIE = "admin_token";
export const ADMIN_PREAUTH_COOKIE = "admin_preauth";

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function toBase64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fromBase64Url(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

function signData(data) {
  return crypto.createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function signToken(payload = {}) {
  const header = toBase64Url({ alg: "HS256", typ: "JWT" });
  const now = nowSec();
  const body = toBase64Url({ iat: now, ...payload });
  const signature = signData(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;

  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;

    const expected = signData(`${header}.${body}`);
    if (!timingSafeEqual(signature, expected)) return null;

    const payload = fromBase64Url(body);
    const now = nowSec();

    if (payload?.nbf && now < Number(payload.nbf)) return null;
    if (payload?.exp && now >= Number(payload.exp)) return null;

    return payload;
  } catch {
    return null;
  }
}

export async function hashPassword(password) {
  const normalized = String(password || "");
  return argon2.hash(normalized, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  });
}

export async function comparePassword(password, hash) {
  const plain = String(password || "");
  const stored = String(hash || "");

  if (!stored) {
    return { valid: false, needsUpgrade: false };
  }

  // Current format: Argon2id
  if (/^\$argon2(id|i|d)\$/i.test(stored)) {
    try {
      const valid = await argon2.verify(stored, plain);
      return { valid, needsUpgrade: false };
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  // Legacy format: sha256(password + secret)
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    const legacyCandidates = Array.from(
      new Set(
        [
          String(process.env.LEGACY_PASSWORD_SECRET || "").trim(),
          String(process.env.JWT_SECRET || "").trim(),
          "afghan-ai-secret-2025",
        ].filter(Boolean),
      ),
    );

    for (const secret of legacyCandidates) {
      const candidate = crypto
        .createHash("sha256")
        .update(`${plain}${secret}`)
        .digest("hex");

      if (timingSafeEqual(candidate, stored)) {
        return { valid: true, needsUpgrade: true };
      }
    }
  }

  return { valid: false, needsUpgrade: false };
}

export function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashOtp(email, code, purpose = "user") {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return crypto
    .createHmac("sha256", OTP_PEPPER)
    .update(`${purpose}|${normalizedEmail}|${String(code || "")}`)
    .digest("hex");
}

export function verifyOtpHash(email, code, expectedHash, purpose = "user") {
  const expected = hashOtp(email, code, purpose);
  return timingSafeEqual(expected, expectedHash);
}

function buildTokenFromRequest(req, cookieName, headerName = "authorization") {
  const cookieToken = String(req?.cookies?.[cookieName] || "").trim();
  if (cookieToken) return cookieToken;

  const headerRaw = String(req?.headers?.[headerName] || "").trim();
  if (!headerRaw) return "";

  if (headerName === "authorization") {
    return headerRaw.replace(/^Bearer\s+/i, "");
  }

  return headerRaw;
}

function makeSessionId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function createAuthCookie(name, token, maxAgeSec) {
  return buildCookie(name, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: maxAgeSec,
  });
}

async function createSession({ userId, scope, ip, userAgent, maxAgeSec }) {
  await connectDB();

  const sessionId = makeSessionId();
  const expiresAt = new Date(Date.now() + maxAgeSec * 1000);

  await Session.create({
    sessionId,
    userId,
    scope,
    ip,
    userAgent,
    expiresAt,
  });

  return { sessionId, expiresAt };
}

async function getActiveSession(payload, scope) {
  await connectDB();

  return Session.findOne({
    sessionId: String(payload?.jti || ""),
    userId: String(payload?.userId || ""),
    scope,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();
}

export function getClientIp(req) {
  const xff = String(req?.headers?.["x-forwarded-for"] || "").trim();
  if (xff) return xff.split(",")[0].trim();
  return String(req?.socket?.remoteAddress || "").trim();
}

export function getUserAgent(req) {
  return String(req?.headers?.["user-agent"] || "").slice(0, 300);
}

export function issueUserPreauthCookie(res, payload = {}, maxAgeSec = DEFAULT_PREAUTH_MAX_AGE_SEC) {
  const exp = nowSec() + maxAgeSec;
  const token = signToken({ scope: "preauth", stage: "verify", exp, ...payload });
  setCookies(res, createAuthCookie(USER_PREAUTH_COOKIE, token, maxAgeSec));
  return token;
}

export function issueAdminPreauthCookie(res, payload = {}, maxAgeSec = DEFAULT_PREAUTH_MAX_AGE_SEC) {
  const exp = nowSec() + maxAgeSec;
  const token = signToken({ scope: "preauth", stage: "admin_otp", exp, ...payload });
  setCookies(res, createAuthCookie(ADMIN_PREAUTH_COOKIE, token, maxAgeSec));
  return token;
}

export async function issueUserSession(res, user, req, maxAgeSec = DEFAULT_USER_MAX_AGE_SEC) {
  const session = await createSession({
    userId: user._id,
    scope: "user",
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    maxAgeSec,
  });

  const token = signToken({
    userId: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    scope: "user",
    jti: session.sessionId,
    exp: Math.floor(session.expiresAt.getTime() / 1000),
  });

  setCookies(res, createAuthCookie(USER_TOKEN_COOKIE, token, maxAgeSec));
  return token;
}

export async function issueAdminSession(res, user, req, maxAgeSec = DEFAULT_ADMIN_MAX_AGE_SEC) {
  const session = await createSession({
    userId: user._id,
    scope: "admin",
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    maxAgeSec,
  });

  const token = signToken({
    userId: String(user._id),
    email: user.email,
    name: user.name,
    role: "admin",
    scope: "admin",
    jti: session.sessionId,
    exp: Math.floor(session.expiresAt.getTime() / 1000),
  });

  setCookies(res, createAuthCookie(ADMIN_TOKEN_COOKIE, token, maxAgeSec));
  return token;
}

export function clearUserAuthCookies(res) {
  setCookies(res, [
    clearCookie(USER_TOKEN_COOKIE, { path: "/", httpOnly: true, sameSite: "Lax" }),
    clearCookie(USER_PREAUTH_COOKIE, { path: "/", httpOnly: true, sameSite: "Lax" }),
  ]);
}

export function clearAdminAuthCookies(res) {
  setCookies(res, [
    clearCookie(ADMIN_TOKEN_COOKIE, { path: "/", httpOnly: true, sameSite: "Lax" }),
    clearCookie(ADMIN_PREAUTH_COOKIE, { path: "/", httpOnly: true, sameSite: "Lax" }),
  ]);
}

export async function revokeSessionByToken(token, scope) {
  const payload = verifyToken(token);
  if (!payload || payload.scope !== scope || !payload.jti) return;

  await connectDB();
  await Session.updateOne(
    { sessionId: payload.jti, scope, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

async function authenticateSession(req, { scope, cookieName, headerName, clearCookies }) {
  const token = buildTokenFromRequest(req, cookieName, headerName);
  const payload = verifyToken(token);

  if (!payload) return null;
  if (payload.scope !== scope) return null;
  if (payload.stage) return null;
  if (!payload.jti || !payload.userId) return null;

  const session = await getActiveSession(payload, scope);
  if (!session) return null;

  return payload;
}

export function withAuth(handler, { adminOnly = false, requireCsrfForMutations = false } = {}) {
  return async (req, res) => {
    const payload = await authenticateSession(req, {
      scope: "user",
      cookieName: USER_TOKEN_COOKIE,
      headerName: "authorization",
    });

    if (!payload) {
      clearUserAuthCookies(res);
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (adminOnly && payload.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (requireCsrfForMutations && !requireCsrf(req, res)) {
      return;
    }

    req.user = payload;
    return handler(req, res);
  };
}

export function withAdminAuth(handler, { requireCsrfForMutations = true } = {}) {
  return async (req, res) => {
    const payload = await authenticateSession(req, {
      scope: "admin",
      cookieName: ADMIN_TOKEN_COOKIE,
      headerName: "x-admin-token",
    });

    if (!payload || payload.role !== "admin") {
      clearAdminAuthCookies(res);
      return res.status(401).json({ message: "Admin unauthorized" });
    }

    if (requireCsrfForMutations && !requireCsrf(req, res)) {
      return;
    }

    req.user = payload;
    return handler(req, res);
  };
}

export function readUserPreauth(req) {
  const token = buildTokenFromRequest(req, USER_PREAUTH_COOKIE, "authorization");
  const payload = verifyToken(token);
  if (!payload || payload.scope !== "preauth" || payload.stage !== "verify") return null;
  return payload;
}

export function readAdminPreauth(req) {
  const token = buildTokenFromRequest(req, ADMIN_PREAUTH_COOKIE, "x-admin-token");
  const payload = verifyToken(token);
  if (!payload || payload.scope !== "preauth" || payload.stage !== "admin_otp") return null;
  return payload;
}
