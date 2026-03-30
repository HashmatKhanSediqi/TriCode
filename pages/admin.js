import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { csrfFetch } from "../lib/csrf-client";

export default function AdminEntry() {
  const router = useRouter();
  const initRef = useRef(false);
  const autoVerifyRef = useRef("");
  const [stage, setStage] = useState("email"); // email | otp
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [resendLeft, setResendLeft] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const RESEND_SECONDS = 60;

  const isValidEmail = (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 720);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    // Force fresh OTP on every /admin visit by clearing any previous admin session token.
    csrfFetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    setStage("email");
    setOtp("");
    setMsg("");
    setErr("");
  }, []);

  useEffect(() => {
    if (resendLeft <= 0) return;
    const timer = setTimeout(() => setResendLeft((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendLeft]);

  const requestOtp = async () => {
    setErr("");
    setMsg("");
    const emailValue = email.trim().toLowerCase();
    if (!emailValue) {
      setErr("Admin email is required.");
      return;
    }
    if (!isValidEmail(emailValue)) {
      setErr("Enter a valid email address.");
      return;
    }
    if (resendLeft > 0) {
      setErr(`Please wait ${resendLeft}s before requesting a new OTP.`);
      return;
    }
    setLoading(true);
    try {
      const res = await csrfFetch("/api/admin/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.message || "Failed to send OTP");
        setLoading(false);
        return;
      }
      setMsg("OTP sent. Please check admin email.");
      setStage("otp");
      setResendLeft(RESEND_SECONDS);
    } catch {
      setErr("Network error while requesting OTP.");
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const res = await csrfFetch("/api/admin/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.message || "OTP verification failed");
        setLoading(false);
        return;
      }
      setMsg("Authentication successful. Redirecting...");
      setTimeout(() => router.replace("/admin/dashboard"), 400);
    } catch {
      setErr("Network error while verifying OTP.");
    }
    setLoading(false);
  };

  const resetEmailStage = async () => {
    setLoading(true);
    try {
      await csrfFetch("/api/admin/logout", { method: "POST" });
    } catch {}
    setStage("email");
    setOtp("");
    setErr("");
    setMsg("");
    setLoading(false);
  };

  useEffect(() => {
    if (stage !== "otp") {
      autoVerifyRef.current = "";
      return;
    }
    if (otp.length !== 6) {
      autoVerifyRef.current = "";
      return;
    }
    if (loading) return;
    if (autoVerifyRef.current === otp) return;
    autoVerifyRef.current = otp;
    verifyOtp();
  }, [otp, stage, loading]);

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
        style={{
          width: "100%",
          maxWidth: "440px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: isMobile ? "14px" : "16px",
          padding: isMobile ? "22px 18px" : "30px",
          boxShadow: "var(--sh3)",
        }}
        dir="rtl"
      >
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div
            style={{
              width: "54px",
              height: "54px",
              borderRadius: "16px",
              background: "linear-gradient(135deg,var(--accent),var(--green))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              color: "#fff",
              margin: "0 auto 10px",
            }}
          >
            AD
          </div>
          <h1 style={{ margin: 0, fontSize: "22px" }}>Admin Secure Login</h1>
          <p
            style={{
              marginTop: "8px",
              color: "var(--text-2)",
              fontSize: "13px",
            }}
          >
            OTP access only for the admin email.
          </p>
        </div>

        {stage === "email" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <label style={{ fontSize: "12px", color: "var(--text-2)" }}>
              Admin Email
            </label>
            <input
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ direction: "ltr", textAlign: "left" }}
              placeholder="admin@example.com"
              autoComplete="email"
            />
            <button
              className="btn-primary"
              onClick={requestOtp}
              disabled={loading}
              style={{ padding: "12px", borderRadius: "10px" }}
            >
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </div>
        )}

        {stage === "otp" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-2)" }}>
              Enter OTP sent to:
            </div>
            <div
              style={{
                direction: "ltr",
                textAlign: "left",
                fontWeight: 600,
                fontSize: "13px",
              }}
            >
              {email}
            </div>
            <input
              className="field"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              autoComplete="one-time-code"
              style={{
                direction: "ltr",
                textAlign: "center",
                letterSpacing: isMobile ? "4px" : "6px",
                fontFamily: "var(--font-mono), monospace",
                fontSize: isMobile ? "18px" : "20px",
              }}
              placeholder="123456"
            />
            <button
              className="btn-primary"
              onClick={verifyOtp}
              disabled={loading || otp.length !== 6}
              style={{ padding: "12px", borderRadius: "10px" }}
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
            <button
              className="btn-ghost"
              onClick={requestOtp}
              disabled={loading || resendLeft > 0}
              style={{ padding: "10px" }}
            >
              {resendLeft > 0 ? `Resend in ${resendLeft}s` : "Resend OTP"}
            </button>
            <button
              className="btn-ghost"
              onClick={resetEmailStage}
              disabled={loading}
              style={{ padding: "10px" }}
            >
              Change Email
            </button>
          </div>
        )}

        {msg && (
          <div
            style={{
              marginTop: "14px",
              color: "var(--green)",
              fontSize: "13px",
              textAlign: "center",
            }}
          >
            {msg}
          </div>
        )}
        {err && (
          <div
            style={{
              marginTop: "14px",
              color: "var(--danger)",
              fontSize: "13px",
              textAlign: "center",
            }}
          >
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
