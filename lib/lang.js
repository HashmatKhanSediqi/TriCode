const LANG_KEY = "tricode_lang";
const SUPPORTED_LANGS = ["fa", "ps", "en"];
const DEFAULT_LANG = "fa";

export function normalizeLang(value) {
  const raw = String(value || "").trim().toLowerCase();
  return SUPPORTED_LANGS.includes(raw) ? raw : "";
}

export function getLangFromCookieHeader(cookieHeader = "") {
  if (typeof cookieHeader !== "string" || !cookieHeader) return "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${LANG_KEY}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : "";
}

export function getLangFromRequest(req) {
  const header = req?.headers?.cookie || "";
  const normalized = normalizeLang(getLangFromCookieHeader(header));
  return normalized || DEFAULT_LANG;
}

export function getClientLang() {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const stored = normalizeLang(window.localStorage?.getItem(LANG_KEY));
    if (stored) return stored;
  } catch {}
  const cookieLang = normalizeLang(getLangFromCookieHeader(document.cookie || ""));
  return cookieLang || DEFAULT_LANG;
}

export function setClientLang(value) {
  const normalized = normalizeLang(value) || DEFAULT_LANG;
  if (typeof window !== "undefined") {
    try {
      window.localStorage?.setItem(LANG_KEY, normalized);
    } catch {}
    document.cookie = `${LANG_KEY}=${encodeURIComponent(
      normalized,
    )}; path=/; max-age=31536000; samesite=lax`;
  }
  return normalized;
}

export const LANGUAGE_KEY = LANG_KEY;
export const SUPPORTED_LANGUAGES = SUPPORTED_LANGS;
export const DEFAULT_LANGUAGE = DEFAULT_LANG;
