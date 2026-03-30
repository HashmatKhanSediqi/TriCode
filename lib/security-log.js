import mongoose from "mongoose";
import SecurityEvent from "../models/SecurityEvent";

function getClientIp(req) {
  const xff = String(req?.headers?.["x-forwarded-for"] || "").trim();
  if (xff) return xff.split(",")[0].trim();
  return String(req?.socket?.remoteAddress || "").trim();
}

function getUserAgent(req) {
  return String(req?.headers?.["user-agent"] || "").slice(0, 300);
}

export async function logSecurityEvent(
  req,
  {
    eventType,
    status = "info",
    userId = null,
    email = "",
    metadata = {},
  } = {},
) {
  if (!eventType) return;

  const payload = {
    eventType,
    status,
    userId,
    email,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    metadata,
    timestamp: new Date().toISOString(),
  };

  try {
    console.log(JSON.stringify({ type: "security_event", ...payload }));
  } catch {
    // no-op
  }

  const hasMongoUri = Boolean(String(process.env.MONGODB_URI || "").trim());
  if (!hasMongoUri) return;

  // Do not block request latency if DB connection is not ready.
  if (mongoose.connection.readyState < 1) return;

  try {
    await SecurityEvent.create({
      eventType,
      status,
      userId,
      email,
      ip: payload.ip,
      userAgent: payload.userAgent,
      metadata,
    });
  } catch {
    // Logging must never break auth flow.
  }
}

export function requestMeta(req) {
  return {
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  };
}
