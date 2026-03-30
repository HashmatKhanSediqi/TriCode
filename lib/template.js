const TEMPLATE_KEY = "tricode_template";
const SUPPORTED_TEMPLATES = [
  "neo-dark",
  "mind-light",
  "violet-soft",
  "carbon-dark",
];
const DEFAULT_TEMPLATE = "neo-dark";

const TEMPLATE_THEMES = {
  "neo-dark": "dark",
  "mind-light": "light",
  "violet-soft": "light",
  "carbon-dark": "dark",
};

export function normalizeTemplate(value) {
  const raw = String(value || "").trim().toLowerCase();
  return SUPPORTED_TEMPLATES.includes(raw) ? raw : "";
}

export function getTemplateFromCookieHeader(cookieHeader = "") {
  if (typeof cookieHeader !== "string" || !cookieHeader) return "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${TEMPLATE_KEY}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : "";
}

export function getClientTemplate() {
  if (typeof window === "undefined") return DEFAULT_TEMPLATE;
  try {
    const stored = normalizeTemplate(window.localStorage?.getItem(TEMPLATE_KEY));
    if (stored) return stored;
  } catch {}
  const cookieTemplate = normalizeTemplate(
    getTemplateFromCookieHeader(document.cookie || ""),
  );
  return cookieTemplate || DEFAULT_TEMPLATE;
}

export function setClientTemplate(value) {
  const normalized = normalizeTemplate(value) || DEFAULT_TEMPLATE;
  if (typeof window !== "undefined") {
    try {
      window.localStorage?.setItem(TEMPLATE_KEY, normalized);
    } catch {}
    document.cookie = `${TEMPLATE_KEY}=${encodeURIComponent(
      normalized,
    )}; path=/; max-age=31536000; samesite=lax`;
  }
  return normalized;
}

export function getTemplateTheme(value) {
  const key = normalizeTemplate(value) || DEFAULT_TEMPLATE;
  return TEMPLATE_THEMES[key] || "dark";
}

export const TEMPLATE_KEY_NAME = TEMPLATE_KEY;
export const SUPPORTED_TEMPLATES_LIST = SUPPORTED_TEMPLATES;
export const DEFAULT_TEMPLATE_KEY = DEFAULT_TEMPLATE;
