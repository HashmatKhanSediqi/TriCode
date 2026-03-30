import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { csrfFetch } from "../lib/csrf-client";
import { getClientLang } from "../lib/lang";

const DEFAULT_POLICY =
  process.env.NODE_ENV === "production" ? "strong" : "basic";
const PASSWORD_POLICY = String(
  process.env.NEXT_PUBLIC_PASSWORD_POLICY || DEFAULT_POLICY,
)
  .trim()
  .toLowerCase();
const MIN_PASSWORD_LENGTH = Math.max(
  6,
  Number(
    process.env.NEXT_PUBLIC_MIN_PASSWORD_LENGTH ||
      (PASSWORD_POLICY === "strong" ? 10 : 6),
  ),
);
const CAPTCHA_PROVIDER = String(
  process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER || "hcaptcha",
)
  .trim()
  .toLowerCase();
const CAPTCHA_SITE_KEY =
  process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY ||
  process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ||
  process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ||
  "";
const CAPTCHA_ENABLED = Boolean(CAPTCHA_SITE_KEY);

const UI_TEXT = {
  fa: {
    title: "ثبت نام",
    subtitle: "حساب TriCode AI خود را بسازید",
    success: "ثبت نام موفق! در حال انتقال...",
    labels: { name: "نام کامل", email: "ایمیل", password: "رمز عبور" },
    placeholders: { name: "نام کامل", email: "ایمیل", password: "رمز عبور" },
    password: {
      weak: "ضعیف",
      strong: "قوی",
      tooShort: (min) => `حداقل ${min} کاراکتر.`,
      strongHint: "شامل حروف بزرگ، کوچک، عدد و نماد باشد.",
      ok: "خوب است.",
    },
    captchaLabel: "تأیید",
    captchaHint: "برای ثبت نام در حالت تولید CAPTCHA را فعال کنید.",
    submit: "ثبت نام",
    submitting: "در حال ثبت نام...",
    haveAccount: "حساب دارید؟",
    login: "وارد شوید",
    errors: {
      emailPasswordRequired: "ایمیل و رمز عبور ضروری است.",
      invalidEmail: "ایمیل معتبر وارد کنید.",
      passwordPolicy: "رمز عبور شرایط را ندارد.",
      nameTooLong: "نام بسیار طولانی است.",
      captchaRequired: "لطفاً کپچا را کامل کنید.",
      registrationFailed: "ثبت نام ناموفق بود.",
      network: "خطای شبکه. لطفاً دوباره تلاش کنید.",
    },
  },
  ps: {
    title: "نوی حساب جوړول",
    subtitle: "خپل TriCode AI حساب جوړ کړئ",
    success: "ثبت نام بریالی شو! د لېږد په حال کې...",
    labels: { name: "بشپړ نوم", email: "برېښنالیک", password: "پټنوم" },
    placeholders: { name: "بشپړ نوم", email: "برېښنالیک", password: "پټنوم" },
    password: {
      weak: "کمزور",
      strong: "قوي",
      tooShort: (min) => `لږ تر لږه ${min} توري.`,
      strongHint: "لوی او کوچني توري، شمېرې او نښه شامل کړئ.",
      ok: "سمه ده.",
    },
    captchaLabel: "تایید",
    captchaHint: "د تولید لپاره CAPTCHA فعال کړئ.",
    submit: "ثبت نام",
    submitting: "د ثبت نام په حال کې...",
    haveAccount: "حساب لرئ؟",
    login: "ننوتل",
    errors: {
      emailPasswordRequired: "برېښنالیک او پټنوم اړین دي.",
      invalidEmail: "سم برېښنالیک ولیکئ.",
      passwordPolicy: "پټنوم شرطونه نه پوره کوي.",
      nameTooLong: "نوم ډېر اوږد دی.",
      captchaRequired: "مهرباني وکړئ کپچا بشپړه کړئ.",
      registrationFailed: "ثبت نام ناکام شو.",
      network: "د شبکې خطا. بیا هڅه وکړئ.",
    },
  },
  en: {
    title: "Create account",
    subtitle: "Create your TriCode AI account",
    success: "Registration successful! Redirecting...",
    labels: { name: "Full name", email: "Email", password: "Password" },
    placeholders: { name: "Full name", email: "Email", password: "Password" },
    password: {
      weak: "Weak",
      strong: "Strong",
      tooShort: (min) => `At least ${min} characters.`,
      strongHint: "Include uppercase, lowercase, number, and symbol characters.",
      ok: "Looks good.",
    },
    captchaLabel: "Verification",
    captchaHint: "Enable CAPTCHA for production signups.",
    submit: "Register",
    submitting: "Registering...",
    haveAccount: "Already have an account?",
    login: "Login",
    errors: {
      emailPasswordRequired: "Email and password are required.",
      invalidEmail: "Enter a valid email address.",
      passwordPolicy: "Password does not meet requirements.",
      nameTooLong: "Name is too long.",
      captchaRequired: "Please complete the captcha challenge.",
      registrationFailed: "Registration failed.",
      network: "Network error. Please try again.",
    },
  },
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function isStrongPassword(password) {
  return (
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function getPasswordStatus(password, t) {
  const labels = t?.password || UI_TEXT.en.password;
  if (!password) {
    return { ok: false, label: "", message: "" };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      label: labels.weak,
      message: labels.tooShort(MIN_PASSWORD_LENGTH),
    };
  }

  if (PASSWORD_POLICY === "strong" && !isStrongPassword(password)) {
    return {
      ok: false,
      label: labels.weak,
      message: labels.strongHint,
    };
  }

  return { ok: true, label: labels.strong, message: labels.ok };
}

export default function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [captchaToken, setCaptchaToken] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [lang, setLang] = useState("fa");
  const router = useRouter();
  const captchaRef = useRef(null);
  const captchaWidgetRef = useRef(null);

  const t = UI_TEXT[lang] || UI_TEXT.en;
  const rtl = lang !== "en";
  const passwordStatus = getPasswordStatus(form.password, t);
  const fields = [
    {
      label: t.labels.name,
      placeholder: t.placeholders.name,
      type: "text",
      key: "name",
      ltr: false,
    },
    {
      label: t.labels.email,
      placeholder: t.placeholders.email,
      type: "email",
      key: "email",
      ltr: true,
    },
    {
      label: t.labels.password,
      placeholder: t.placeholders.password,
      type: "password",
      key: "password",
      ltr: true,
    },
  ];

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 720);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const stored = getClientLang();
    setLang(stored);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", rtl ? "rtl" : "ltr");
  }, [lang, rtl]);

  useEffect(() => {
    if (!CAPTCHA_ENABLED) return;

    const scriptId =
      CAPTCHA_PROVIDER === "recaptcha"
        ? "recaptcha-script"
        : "hcaptcha-script";

    const renderWidget = () => {
      if (!captchaRef.current || captchaWidgetRef.current !== null) return;

      if (CAPTCHA_PROVIDER === "recaptcha" && window.grecaptcha?.render) {
        captchaWidgetRef.current = window.grecaptcha.render(
          captchaRef.current,
          {
            sitekey: CAPTCHA_SITE_KEY,
            callback: (token) => setCaptchaToken(String(token || "")),
            "expired-callback": () => setCaptchaToken(""),
            "error-callback": () => setCaptchaToken(""),
          },
        );
        return;
      }

      if (window.hcaptcha?.render) {
        captchaWidgetRef.current = window.hcaptcha.render(captchaRef.current, {
          sitekey: CAPTCHA_SITE_KEY,
          callback: (token) => setCaptchaToken(String(token || "")),
          "expired-callback": () => setCaptchaToken(""),
          "error-callback": () => setCaptchaToken(""),
        });
      }
    };

    if (document.getElementById(scriptId)) {
      renderWidget();
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.defer = true;
    script.src =
      CAPTCHA_PROVIDER === "recaptcha"
        ? "https://www.google.com/recaptcha/api.js?render=explicit"
        : "https://js.hcaptcha.com/1/api.js?render=explicit";
    script.onload = renderWidget;
    document.body.appendChild(script);
  }, []);

  const resetCaptcha = () => {
    if (!CAPTCHA_ENABLED || captchaWidgetRef.current === null) return;
    if (CAPTCHA_PROVIDER === "recaptcha" && window.grecaptcha?.reset) {
      window.grecaptcha.reset(captchaWidgetRef.current);
    }
    if (window.hcaptcha?.reset) {
      window.hcaptcha.reset(captchaWidgetRef.current);
    }
    setCaptchaToken("");
  };

  const submit = async () => {
    setErr("");

    const email = String(form.email || "").trim().toLowerCase();
    const password = String(form.password || "");
    const name = String(form.name || "").trim();
    const passwordCheck = getPasswordStatus(password, t);

    if (!email || !password) {
      setErr(t.errors.emailPasswordRequired);
      return;
    }

    if (!isValidEmail(email)) {
      setErr(t.errors.invalidEmail);
      return;
    }

    if (!passwordCheck.ok) {
      setErr(passwordCheck.message || t.errors.passwordPolicy);
      return;
    }

    if (name.length > 80) {
      setErr(t.errors.nameTooLong);
      return;
    }

    if (CAPTCHA_ENABLED && !captchaToken) {
      setErr(t.errors.captchaRequired);
      return;
    }

    setLoading(true);
    try {
      const res = await csrfFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          ...(captchaToken ? { captchaToken } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.message || t.errors.registrationFailed);
        resetCaptcha();
        setLoading(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 1800);
    } catch {
      setErr(t.errors.network);
      resetCaptcha();
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "var(--app-height)",
        background: "var(--bg-base)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--page-pad)",
      }}
    >
      <div
        className="fade-up scale-in"
        dir={rtl ? "rtl" : "ltr"}
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: isMobile ? "16px" : "20px",
          padding: isMobile ? "22px 18px" : "40px",
          boxShadow: "var(--sh3)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <img
            src="/tricode-mark.svg"
            alt="TriCode AI"
            style={{
              width: isMobile ? "46px" : "52px",
              height: isMobile ? "46px" : "52px",
              borderRadius: isMobile ? "14px" : "16px",
              background: "#fff",
              padding: "4px",
              margin: "0 auto 16px",
              boxShadow: "var(--glow)",
            }}
          />
          <h1
            style={{
              fontSize: isMobile ? "20px" : "22px",
              fontWeight: 700,
              letterSpacing: "-0.4px",
              marginBottom: "6px",
            }}
          >
            {t.title}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-2)" }}>
            {t.subtitle}
          </p>
        </div>

        {success ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--green)",
              fontSize: "15px",
              padding: "20px 0",
            }}
          >
            {t.success}
          </div>
        ) : (
          <form
            style={{
              display: "flex",
              flexDirection: "column",
              gap: isMobile ? "12px" : "14px",
            }}
            dir={rtl ? "rtl" : "ltr"}
            autoComplete="on"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {fields.map(({ label, placeholder, type, key, ltr: isLtr }) => (
              <div key={key}>
                <label
                  style={{
                    fontSize: "12px",
                    color: "var(--text-2)",
                    fontWeight: 500,
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  {label}
                </label>
                <input
                  type={type}
                  name={
                    key === "email"
                      ? "signup_email_tricode"
                      : key === "password"
                        ? "signup_password_tricode"
                        : "signup_name_tricode"
                  }
                  className="field"
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, [key]: e.target.value }))
                  }
                  style={{
                    direction: isLtr ? "ltr" : rtl ? "rtl" : "ltr",
                    textAlign: isLtr ? "left" : rtl ? "right" : "left",
                  }}
                  maxLength={key === "name" ? 80 : key === "email" ? 254 : 128}
                  minLength={key === "password" ? MIN_PASSWORD_LENGTH : undefined}
                  required={key !== "name"}
                  aria-invalid={Boolean(err)}
                  autoCapitalize={key === "email" ? "none" : undefined}
                  autoComplete={
                    key === "email"
                      ? "email"
                      : key === "password"
                        ? "new-password"
                        : "name"
                  }
                />
                {key === "password" && (
                  <div
                    style={{
                      marginTop: "6px",
                      fontSize: "11px",
                      color: passwordStatus.ok
                        ? "var(--green)"
                        : "var(--text-3)",
                    }}
                  >
                    {passwordStatus.message ||
                      t.password.tooShort(MIN_PASSWORD_LENGTH)}
                  </div>
                )}
              </div>
            ))}

            {CAPTCHA_ENABLED && (
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-2)",
                    marginBottom: "6px",
                  }}
                >
                  {t.captchaLabel}
                </div>
                <div
                  ref={captchaRef}
                  style={{ minHeight: "78px", display: "flex" }}
                />
              </div>
            )}

            {err && (
              <div
                style={{
                  background: "rgba(248,113,113,.1)",
                  border: "1px solid rgba(248,113,113,.3)",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  fontSize: "13px",
                  color: "var(--danger)",
                  textAlign: "center",
                }}
                role="alert"
                aria-live="polite"
              >
                {err}
              </div>
            )}

            {!CAPTCHA_ENABLED && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: "11px",
                  color: "var(--text-3)",
                }}
              >
                {t.captchaHint}
              </div>
            )}

            <button
              className="btn-primary"
              type="submit"
              disabled={loading}
              style={{
                padding: "12px",
                borderRadius: "10px",
                marginTop: "4px",
              }}
            >
              {loading ? (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      width: "14px",
                      height: "14px",
                      border: "2px solid rgba(255,255,255,.3)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      animation: "spin .7s linear infinite",
                    }}
                  />{" "}
                  {t.submitting}
                </span>
              ) : (
                t.submit
              )}
            </button>

            <div
              style={{
                textAlign: "center",
                fontSize: "13px",
                color: "var(--text-2)",
              }}
            >
              {t.haveAccount}{" "}
              <span
                onClick={() => router.push("/login")}
                style={{
                  color: "var(--accent)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {t.login}
              </span>
            </div>
          </form>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
