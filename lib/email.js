import nodemailer from "nodemailer";
import { requireEnv } from "./env";

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = requireEnv("SMTP_USER");
  const pass = requireEnv("SMTP_PASS");

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    requireTLS: true,
    tls: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return cachedTransporter;
}

function renderOtpHtml({ name, code, purpose }) {
  const safeName = String(name || "User");
  const action = purpose === "admin" ? "admin sign-in" : "sign-in";
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
      <h2 style="margin:0 0 12px;color:#111827;">Verification Code</h2>
      <p style="color:#374151;line-height:1.5;">Hello ${safeName}, use this code to continue your ${action}:</p>
      <div style="margin:20px 0;padding:16px;text-align:center;font-size:34px;letter-spacing:8px;font-weight:700;color:#0f766e;background:#f0fdfa;border-radius:10px;">
        ${code}
      </div>
      <p style="color:#6b7280;line-height:1.5;margin:0;">This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
    </div>
  `;
}

function renderOtpText({ code, purpose }) {
  const action = purpose === "admin" ? "admin sign-in" : "sign-in";
  return `Your verification code for ${action}: ${code}\nThis code expires in 10 minutes.`;
}

export async function sendOtpEmail({ to, name, code, purpose = "user" }) {
  const transporter = getTransporter();
  const from = String(process.env.SMTP_FROM || process.env.SMTP_USER || "").trim();

  if (!from) {
    throw new Error("Missing SMTP_FROM or SMTP_USER");
  }

  const info = await transporter.sendMail({
    from,
    to,
    subject: purpose === "admin" ? "Admin verification code" : "Verification code",
    text: renderOtpText({ code, purpose }),
    html: renderOtpHtml({ name, code, purpose }),
  });

  return {
    success: true,
    messageId: info?.messageId || "",
  };
}
