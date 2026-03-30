const DEFAULT_SAME_SITE = "Lax";

export function isSecureCookiesEnabled() {
  return process.env.NODE_ENV === "production";
}

export function buildCookie(name, value, options = {}) {
  const {
    path = "/",
    httpOnly = true,
    secure = isSecureCookiesEnabled(),
    sameSite = DEFAULT_SAME_SITE,
    maxAge,
    expires,
  } = options;

  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`];

  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (typeof maxAge === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (expires instanceof Date) parts.push(`Expires=${expires.toUTCString()}`);

  return parts.join("; ");
}

export function clearCookie(name, options = {}) {
  return buildCookie(name, "", {
    ...options,
    maxAge: 0,
    expires: new Date(0),
  });
}

export function setCookies(res, cookies) {
  const list = (Array.isArray(cookies) ? cookies : [cookies]).filter(Boolean);
  if (list.length === 0) return;
  const existing = res.getHeader("Set-Cookie");
  const existingList = Array.isArray(existing)
    ? existing
    : existing
      ? [String(existing)]
      : [];
  res.setHeader("Set-Cookie", [...existingList, ...list]);
}
