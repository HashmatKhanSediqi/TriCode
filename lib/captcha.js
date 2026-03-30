const DEFAULT_PROVIDER = "hcaptcha";
const DEFAULT_MIN_SCORE = 0.5;

function getConfig() {
  return {
    provider: String(process.env.CAPTCHA_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase(),
    secret: String(process.env.CAPTCHA_SECRET || "").trim(),
    minScore: Number(process.env.CAPTCHA_MIN_SCORE || DEFAULT_MIN_SCORE),
  };
}

async function postForm(url, body, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyCaptcha({ token, ip, action } = {}) {
  const { provider, secret, minScore } = getConfig();

  if (!secret) {
    return { ok: true, skipped: true };
  }

  if (!token) {
    return { ok: false, message: "Captcha is required." };
  }

  const endpoint =
    provider === "recaptcha"
      ? "https://www.google.com/recaptcha/api/siteverify"
      : "https://hcaptcha.com/siteverify";

  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", token);
  if (ip) params.set("remoteip", ip);

  let data = null;
  try {
    data = await postForm(endpoint, params);
  } catch (error) {
    return { ok: false, message: "Captcha verification failed." };
  }

  if (!data || data.success !== true) {
    return { ok: false, message: "Captcha verification failed." };
  }

  if (provider === "recaptcha") {
    if (typeof data.score === "number" && data.score < minScore) {
      return { ok: false, message: "Captcha score too low." };
    }
    if (action && data.action && data.action !== action) {
      return { ok: false, message: "Captcha action mismatch." };
    }
  }

  return { ok: true };
}
