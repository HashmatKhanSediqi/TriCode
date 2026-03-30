import {
  ADMIN_TOKEN_COOKIE,
  clearAdminAuthCookies,
  revokeSessionByToken,
} from "../../../lib/auth";
import { requireCsrf } from "../../../lib/csrf";
import { logSecurityEvent } from "../../../lib/security-log";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  try {
    const token = String(req.cookies?.[ADMIN_TOKEN_COOKIE] || "").trim();
    const hadToken = Boolean(token);
    if (token) {
      await revokeSessionByToken(token, "admin");
    }
    clearAdminAuthCookies(res);

    if (hadToken) {
      await logSecurityEvent(req, {
        eventType: "admin.logout",
        status: "ok",
      });
    }
  } catch (error) {
    console.error("admin/logout revoke failure:", error);
    clearAdminAuthCookies(res);
  }

  return res.status(200).json({ message: "Logged out" });
}
