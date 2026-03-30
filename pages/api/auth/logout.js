import {
  USER_TOKEN_COOKIE,
  clearUserAuthCookies,
  revokeSessionByToken,
} from "../../../lib/auth";
import { requireCsrf } from "../../../lib/csrf";
import { logSecurityEvent } from "../../../lib/security-log";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  try {
    const token = String(req.cookies?.[USER_TOKEN_COOKIE] || "").trim();
    const hadToken = Boolean(token);
    if (token) {
      await revokeSessionByToken(token, "user");
    }
    clearUserAuthCookies(res);

    if (hadToken) {
      await logSecurityEvent(req, {
        eventType: "auth.logout",
        status: "ok",
      });
    }
  } catch (error) {
    console.error("auth/logout revoke failure:", error);
    clearUserAuthCookies(res);
  }

  return res.status(200).json({ message: "Logged out" });
}
