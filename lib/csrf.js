import crypto from "crypto";
import { buildCookie, setCookies } from "./cookies";

export const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_TTL_SECONDS = 2 * 60 * 60;

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function getCsrfCookie(req) {
  return String(req?.cookies?.[CSRF_COOKIE_NAME] || "");
}

export function issueCsrfToken(res) {
  const token = randomToken();
  const cookie = buildCookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: "Lax",
    maxAge: CSRF_TTL_SECONDS,
  });
  setCookies(res, cookie);
  return token;
}

export function ensureCsrfToken(req, res) {
  const existing = getCsrfCookie(req);
  if (existing) return existing;
  return issueCsrfToken(res);
}

export function validateCsrf(req) {
  const header = String(req?.headers?.["x-csrf-token"] || "");
  const cookie = getCsrfCookie(req);
  return safeEqual(header, cookie);
}

export function requireCsrf(req, res) {
  const method = String(req?.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

  if (!validateCsrf(req)) {
    res.status(403).json({ message: "Invalid CSRF token" });
    return false;
  }

  return true;
}
