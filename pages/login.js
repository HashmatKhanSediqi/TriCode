import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { csrfFetch } from "../lib/csrf-client";
import { getClientLang } from "../lib/lang";

const CODE_LENGTH = 6;
const OTP_SECONDS = 10 * 60;
const MIN_PASSWORD_LENGTH = 6;

const UI_TEXT = {
  fa: {
    title: "خوش آمدید",
    subtitle: "برای ادامه به TriCode AI وارد شوید.",
    emailLabel: "ایمیل",
    passwordLabel: "رمز عبور",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "********",
    loginButton: "ادامه",
    loginLoading: "در حال ورود...",
    verifyTitle: "تأیید ورود",
    codeSent: "کد ارسال شد به",
    codeFailed: "ارسال ایمیل ممکن نشد به",
    codeExpires: "کد تا پایان",
    codeExpired: "کد منقضی شد. کد جدید درخواست کنید.",
    enterCode: "کد ۶ رقمی را وارد کنید.",
    invalidCode: "کد نامعتبر است.",
    verifyButton: "تأیید و ورود",
    verifying: "در حال تأیید...",
    didNotReceive: "کد را دریافت نکردید؟",
    resend: "ارسال دوباره",
    resending: "در حال ارسال...",
    resendSent: "کد جدید ارسال شد.",
    resendFailed: "در حال حاضر ارسال دوباره ممکن نیست.",
    resendNetwork: "خطای شبکه هنگام ارسال دوباره.",
    backToLogin: "بازگشت به ورود",
    newHere: "حساب ندارید؟",
    createAccount: "ثبت‌نام",
    emailRequired: "ایمیل ضروری است.",
    passwordRequired: "رمز عبور ضروری است.",
    passwordShort: (min) => `رمز عبور باید حداقل ${min} کاراکتر باشد.`,
    loginFailed: "در حال حاضر ورود ممکن نیست.",
    networkError: "خطای شبکه. لطفاً دوباره تلاش کنید.",
    maskEmail: "ایمیل شما",
    devCodeLabel: "کد توسعه",
  },
  ps: {
    title: "ښه راغلاست",
    subtitle: "د TriCode AI ته د دوام لپاره ننوځئ.",
    emailLabel: "برېښنالیک",
    passwordLabel: "پټنوم",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "********",
    loginButton: "دوام",
    loginLoading: "د ننوتلو په حال کې...",
    verifyTitle: "د ننوتلو تایید",
    codeSent: "کوډ واستول شو",
    codeFailed: "ایمیل ونه شو لېږل",
    codeExpires: "کوډ ختمېږي په",
    codeExpired: "کوډ ختم شو. نوی کوډ وغواړئ.",
    enterCode: "۶ عددي کوډ ولیکئ.",
    invalidCode: "کوډ ناسم دی.",
    verifyButton: "تایید او ننوتل",
    verifying: "د تایید په حال کې...",
    didNotReceive: "کوډ مو ترلاسه نه کړ؟",
    resend: "بیا لېږل",
    resending: "د لېږلو په حال کې...",
    resendSent: "نوی کوډ ولېږل شو.",
    resendFailed: "اوس مهال بیا لېږل ممکن نه دي.",
    resendNetwork: "د بیا لېږلو پر مهال د شبکې خطا.",
    backToLogin: "بېرته ننوتل",
    newHere: "نوی یاست؟",
    createAccount: "حساب جوړ کړئ",
    emailRequired: "برېښنالیک اړین دی.",
    passwordRequired: "پټنوم اړین دی.",
    passwordShort: (min) => `پټنوم لږ تر لږه ${min} توري ولري.`,
    loginFailed: "اوس مهال ننوتل ممکن نه دي.",
    networkError: "د شبکې خطا. بیا هڅه وکړئ.",
    maskEmail: "ستاسو ایمیل",
    devCodeLabel: "د ډیولپ کوډ",
  },
  en: {
    title: "Welcome Back",
    subtitle: "Sign in to continue to TriCode AI.",
    emailLabel: "Email",
    passwordLabel: "Password",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "********",
    loginButton: "Continue",
    loginLoading: "Signing in...",
    verifyTitle: "Verify Login",
    codeSent: "Code sent to",
    codeFailed: "Unable to deliver email to",
    codeExpires: "Code expires in",
    codeExpired: "Code expired. Request a new code.",
    enterCode: "Enter the 6-digit code.",
    invalidCode: "Invalid code.",
    verifyButton: "Verify and Login",
    verifying: "Verifying...",
    didNotReceive: "Did not receive a code?",
    resend: "Resend",
    resending: "Sending...",
    resendSent: "A new code has been sent.",
    resendFailed: "Unable to resend now.",
    resendNetwork: "Network error while resending.",
    backToLogin: "Back to login",
    newHere: "New here?",
    createAccount: "Create account",
    emailRequired: "Email is required.",
    passwordRequired: "Password is required.",
    passwordShort: (min) => `Password must be at least ${min} characters.`,
    loginFailed: "Unable to login right now.",
    networkError: "Network error. Please try again.",
    maskEmail: "your email",
    devCodeLabel: "Dev code",
  },
};


function Spinner({ size = 14 }) {
  return (
    <span
      style={{
        width: `${size}px`,
        height: `${size}px`,
        border: "2px solid rgba(255,255,255,0.35)",
        borderTopColor: "#fff",
        borderRadius: "999px",
        display: "inline-block",
        animation: "spin .75s linear infinite",
      }}
    />
  );
}

function Countdown({ seconds, resetSeed, onExpire }) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    setLeft(seconds);
  }, [seconds, resetSeed]);

  useEffect(() => {
    if (left <= 0) {
      onExpire?.();
      return;
    }

    const timer = setTimeout(() => setLeft((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, onExpire]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        color: left < 60 ? "#ef4444" : "#7c8ab8",
      }}
    >
      {mm}:{ss}
    </span>
  );
}

function maskEmail(email, fallback = "your email") {
  const [name = "", domain = ""] = String(email || "").trim().split("@");
  if (!name || !domain) return fallback;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(0, name.length - 2))}@${domain}`;
}

function normalizeDigits(value = "") {
  return String(value)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/\D/g, "");
}

export default function LoginPage() {
  const router = useRouter();
  const initRef = useRef(false);
  const digitRefs = useRef([]);
  const autoVerifyRef = useRef("");

  const [isMobile, setIsMobile] = useState(false);
  const [lang, setLang] = useState("fa");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [stage, setStage] = useState("login");
  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(""));
  const [verifyError, setVerifyError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendIsError, setResendIsError] = useState(false);
  const [expired, setExpired] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [devCode, setDevCode] = useState("");
  const [verifySeed, setVerifySeed] = useState(0);

  const t = UI_TEXT[lang] || UI_TEXT.en;
  const rtl = lang !== "en";

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    csrfFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
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
    const onResize = () => setIsMobile(window.innerWidth <= 720);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const otpCode = useMemo(() => digits.join(""), [digits]);

  const resetVerifyState = () => {
    setDigits(Array(CODE_LENGTH).fill(""));
    setVerifyError("");
    setExpired(false);
    setVerifySeed((seed) => seed + 1);
  };

  useEffect(() => {
    if (stage !== "verify") {
      autoVerifyRef.current = "";
      return;
    }
    if (expired) {
      autoVerifyRef.current = "";
      return;
    }
    if (otpCode.length !== CODE_LENGTH) {
      autoVerifyRef.current = "";
      return;
    }
    if (isVerifying) return;
    if (autoVerifyRef.current === otpCode) return;
    autoVerifyRef.current = otpCode;
    submitVerify();
  }, [otpCode, stage, expired, isVerifying]);


  const submitLogin = async () => {
    if (isLoggingIn) return;
    setLoginError("");

    if (!email.trim()) {
      setLoginError(t.emailRequired);
      return;
    }
    if (!password.trim()) {
      setLoginError(t.passwordRequired);
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setLoginError(t.passwordShort(MIN_PASSWORD_LENGTH));
      return;
    }

    setIsLoggingIn(true);

    try {
      const res = await csrfFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLoginError(data?.message || t.loginFailed);
        return;
      }

      setMaskedEmail(maskEmail(email, t.maskEmail));
      setEmailSent(data?.emailSent !== false);
      setDevCode(String(data?.devCode || ""));
      resetVerifyState();
      setStage("verify");

      setTimeout(() => digitRefs.current[0]?.focus(), 100);
    } catch {
      setLoginError(t.networkError);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const submitVerify = async () => {
    if (isVerifying) return;
    if (otpCode.length !== CODE_LENGTH) {
      setVerifyError(t.enterCode);
      return;
    }

    setVerifyError("");
    setIsVerifying(true);

    try {
      const res = await csrfFetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpCode }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVerifyError(data?.message || t.invalidCode);
        return;
      }

      router.replace("/chat");
    } catch {
      setVerifyError(t.networkError);
    } finally {
      setIsVerifying(false);
    }
  };

  const resendCode = async () => {
    setResendMessage("");
    setResendIsError(false);
    setVerifyError("");
    setIsResending(true);

    try {
      const res = await csrfFetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResendIsError(true);
        setResendMessage(data?.message || t.resendFailed);
        return;
      }

      setEmailSent(data?.emailSent !== false);
      setDevCode(String(data?.devCode || ""));
      resetVerifyState();
      setResendIsError(false);
      setResendMessage(t.resendSent);
      setTimeout(() => digitRefs.current[0]?.focus(), 100);
    } catch {
      setResendIsError(true);
      setResendMessage(t.resendNetwork);
    } finally {
      setIsResending(false);
      setTimeout(() => {
        setResendMessage("");
        setResendIsError(false);
      }, 3500);
    }
  };

  const handleDigitChange = (index, rawValue) => {
    const clean = normalizeDigits(rawValue).slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = clean;
      return next;
    });
    setVerifyError("");

    if (clean && index < CODE_LENGTH - 1) {
      setTimeout(() => digitRefs.current[index + 1]?.focus(), 0);
    }
  };

  const handleDigitKeyDown = (index, event) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      digitRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      digitRefs.current[index + 1]?.focus();
      return;
    }

    if (event.key === "Enter") {
      submitVerify();
    }
  };

  const handleOtpPaste = (event) => {
    event.preventDefault();
    const pasted = normalizeDigits(event.clipboardData?.getData("text") || "").slice(0, CODE_LENGTH);
    if (!pasted) return;

    const next = Array(CODE_LENGTH)
      .fill("")
      .map((_, i) => pasted[i] || "");

    setDigits(next);
    if (pasted.length >= CODE_LENGTH) {
      setTimeout(() => digitRefs.current[CODE_LENGTH - 1]?.focus(), 0);
    }
  };

  return (
    <div
      style={{
        minHeight: "var(--app-height)",
        display: "grid",
        placeItems: "center",
        padding: "var(--page-pad)",
          background:
            "radial-gradient(1200px 500px at 0% -10%, var(--hero-glow-2), transparent 60%), radial-gradient(900px 500px at 100% 0%, var(--hero-glow-1), transparent 65%), linear-gradient(180deg, var(--bg-base), var(--bg-surface) 55%, var(--bg-base))",
      }}
    >
      <div
        className="fade-up scale-in"
        style={{
          width: "100%",
          maxWidth: stage === "login" ? "430px" : "470px",
          border: "1px solid rgba(148,163,184,.22)",
          borderRadius: isMobile ? "18px" : "22px",
          background: "linear-gradient(180deg, var(--bg-elevated), var(--bg-overlay))",
          boxShadow: "0 28px 80px rgba(0,0,0,.45)",
          backdropFilter: "blur(8px)",
          padding: isMobile ? "22px 16px" : "34px 32px",
          color: "#e5ecff",
        }}
        dir={rtl ? "rtl" : "ltr"}
      >
        <div style={{ textAlign: "center", marginBottom: stage === "login" ? 24 : 18 }}>
          <img
            src="/tricode-mark.svg"
            alt="TriCode AI"
            style={{
              width: isMobile ? 54 : 62,
              height: isMobile ? 54 : 62,
              borderRadius: 18,
              background: "#ffffff",
              padding: 4,
              boxShadow: "0 10px 22px rgba(16,185,129,.22)",
            }}
          />

          {stage === "login" ? (
            <>
              <h1 style={{ margin: "14px 0 6px", fontSize: isMobile ? 22 : 24 }}>
                {t.title}
              </h1>
              <p style={{ margin: 0, color: "#9fb0df", fontSize: 13 }}>
                {t.subtitle}
              </p>
            </>
          ) : (
            <>
              <h2 style={{ margin: "14px 0 6px", fontSize: isMobile ? 21 : 23 }}>
                {t.verifyTitle}
              </h2>
              <p style={{ margin: 0, color: "#9fb0df", fontSize: 13, lineHeight: 1.6 }}>
                {emailSent ? t.codeSent : t.codeFailed}
                <br />
                <strong style={{ direction: "ltr", display: "inline-block", color: "#f8fbff" }}>
                  {maskedEmail}
                </strong>
              </p>
            </>
          )}
        </div>

        {stage === "login" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitLogin();
            }}
            style={{ display: "grid", gap: 12 }}
          >
            <label style={{ fontSize: 12, color: "#8fa1d2" }}>{t.emailLabel}</label>
            <input
              className="field"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setLoginError("");
              }}
              placeholder={t.emailPlaceholder}
              autoComplete="off"
              style={{ direction: "ltr", textAlign: "left" }}
            />

            <label style={{ fontSize: 12, color: "#8fa1d2", marginTop: 6 }}>
              {t.passwordLabel}
            </label>
            <input
              className="field"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setLoginError("");
              }}
              placeholder={t.passwordPlaceholder}
              autoComplete="new-password"
              style={{ direction: "ltr", textAlign: "left" }}
            />

            {loginError && (
              <div
                style={{
                  marginTop: 2,
                  borderRadius: 10,
                  border: "1px solid rgba(248,113,113,.4)",
                  background: "rgba(127,29,29,.25)",
                  color: "#fca5a5",
                  padding: "10px 12px",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                {loginError}
              </div>
            )}

            <button
              className="btn-primary"
              type="submit"
              disabled={isLoggingIn}
              style={{ marginTop: 4, padding: "12px 14px", borderRadius: 12 }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {isLoggingIn ? (
                  <>
                    <Spinner /> {t.loginLoading}
                  </>
                ) : (
                  t.loginButton
                )}
              </span>
            </button>

            <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "#95a5cf" }}>
              {t.newHere}{" "}
              <span
                onClick={() => router.push("/register")}
                style={{ color: "#8ea2ff", fontWeight: 600, cursor: "pointer" }}
              >
                {t.createAccount}
              </span>
            </div>
          </form>
        )}

        {stage === "verify" && (
          <div style={{ display: "grid", gap: 14 }}>
            {!expired && (
              <div style={{ textAlign: "center", fontSize: 12, color: "#8ea1cf" }}>
                {t.codeExpires}{" "}
                <Countdown
                  seconds={OTP_SECONDS}
                  resetSeed={verifySeed}
                  onExpire={() => setExpired(true)}
                />
              </div>
            )}

            {devCode && !expired && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  color: "#86efac",
                  direction: "ltr",
                }}
              >
                <span style={{ opacity: 0.85 }}>{t.devCodeLabel}:</span>{" "}
                <strong style={{ letterSpacing: 2 }}>{devCode}</strong>
              </div>
            )}

            {expired && (
              <div
                style={{
                  borderRadius: 10,
                  border: "1px solid rgba(248,113,113,.4)",
                  background: "rgba(127,29,29,.25)",
                  color: "#fca5a5",
                  padding: "10px 12px",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                {t.codeExpired}
              </div>
            )}

            {!expired && (
              <div
                className="code-row"
                dir="ltr"
                onPaste={handleOtpPaste}
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: isMobile ? 6 : 8,
                }}
              >
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      digitRefs.current[index] = el;
                    }}
                    value={digit}
                    inputMode="numeric"
                    maxLength={1}
                    onChange={(event) => handleDigitChange(index, event.target.value)}
                    onKeyDown={(event) => handleDigitKeyDown(index, event)}
                    style={{
                      width: isMobile ? 42 : 50,
                      height: isMobile ? 52 : 58,
                      borderRadius: 12,
                      border: `1px solid ${digit ? "rgba(34,197,94,.7)" : "rgba(148,163,184,.35)"}`,
                      background: "rgba(11,18,34,.9)",
                      color: "#f8fbff",
                      textAlign: "center",
                      fontSize: isMobile ? 22 : 24,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono), monospace",
                      outline: "none",
                    }}
                  />
                ))}
              </div>
            )}

            {verifyError && (
              <div
                style={{
                  borderRadius: 10,
                  border: "1px solid rgba(248,113,113,.4)",
                  background: "rgba(127,29,29,.25)",
                  color: "#fca5a5",
                  padding: "10px 12px",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                {verifyError}
              </div>
            )}

            {!expired && (
              <button
                className="btn-primary"
                onClick={submitVerify}
                disabled={isVerifying || otpCode.length !== CODE_LENGTH}
                style={{ padding: "12px 14px", borderRadius: 12 }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {isVerifying ? (
                    <>
                      <Spinner /> {t.verifying}
                    </>
                  ) : (
                    t.verifyButton
                  )}
                </span>
              </button>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                flexWrap: "wrap",
                fontSize: 13,
                color: "#95a5cf",
              }}
            >
              <span>{t.didNotReceive}</span>
              <button
                onClick={resendCode}
                disabled={isResending}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#8ea2ff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  padding: 0,
                }}
              >
                {isResending ? t.resending : t.resend}
              </button>
            </div>

            {resendMessage && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  color: resendIsError ? "#fca5a5" : "#86efac",
                }}
              >
                {resendMessage}
              </div>
            )}

            <div style={{ textAlign: "center", marginTop: 2 }}>
              <button
                onClick={() => {
                  setStage("login");
                  setVerifyError("");
                  setDevCode("");
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#8ea1cf",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
              >
                {t.backToLogin}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
