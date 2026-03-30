import { getRedisClient } from "./redis";

const memoryStore = globalThis.__rateLimitStore || new Map();
if (!globalThis.__rateLimitStore) {
  globalThis.__rateLimitStore = memoryStore;
}

function nowMs() {
  return Date.now();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function getClientIp(req) {
  const xff = String(req?.headers?.["x-forwarded-for"] || "").trim();
  if (xff) return xff.split(",")[0].trim();
  return String(req?.socket?.remoteAddress || "").trim() || "unknown";
}

async function useRedisLimit(key, limit, windowSec) {
  const redis = await getRedisClient();
  if (!redis) return null;

  const redisKey = `rl:${key}`;
  const tx = redis.multi();
  tx.incr(redisKey);
  tx.pttl(redisKey);
  const result = await tx.exec();

  const count = Number(result?.[0]?.[1] || 0);
  let ttlMs = Number(result?.[1]?.[1] || -1);

  if (count === 1 || ttlMs < 0) {
    await redis.pexpire(redisKey, windowSec * 1000);
    ttlMs = windowSec * 1000;
  }

  if (count <= limit) {
    return {
      ok: true,
      remaining: Math.max(0, limit - count),
      retryAfterSec: 0,
    };
  }

  return {
    ok: false,
    remaining: 0,
    retryAfterSec: Math.max(1, Math.ceil(ttlMs / 1000)),
  };
}

function useMemoryLimit(key, limit, windowSec) {
  const current = nowMs();
  const windowMs = windowSec * 1000;
  const existing = memoryStore.get(key);

  if (!existing || existing.resetAt <= current) {
    memoryStore.set(key, { count: 1, resetAt: current + windowMs });
    return { ok: true, remaining: Math.max(0, limit - 1), retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - current) / 1000)),
    };
  }

  existing.count += 1;
  memoryStore.set(key, existing);
  return { ok: true, remaining: Math.max(0, limit - existing.count), retryAfterSec: 0 };
}

export async function consumeRateLimit({ key, limit, windowSec }) {
  if (!key || !limit || !windowSec) {
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER, retryAfterSec: 0 };
  }

  try {
    const redisResult = await useRedisLimit(key, limit, windowSec);
    if (redisResult) return redisResult;
  } catch (error) {
    console.error("rate-limit redis failure:", error?.message || error);
  }

  return useMemoryLimit(key, limit, windowSec);
}

export async function enforceRouteRateLimit(
  req,
  res,
  {
    route,
    email,
    ipLimit = 20,
    ipWindowSec = 60,
    emailLimit = 10,
    emailWindowSec = 300,
  } = {},
) {
  const ip = getClientIp(req);
  const normalizedEmail = normalizeEmail(email);

  const ipResult = await consumeRateLimit({
    key: `${route}:ip:${ip}`,
    limit: ipLimit,
    windowSec: ipWindowSec,
  });

  if (!ipResult.ok) {
    res.setHeader("Retry-After", String(ipResult.retryAfterSec));
    return {
      ok: false,
      message: "Too many requests. Please try again later.",
      retryAfterSec: ipResult.retryAfterSec,
    };
  }

  if (normalizedEmail) {
    const emailResult = await consumeRateLimit({
      key: `${route}:email:${normalizedEmail}`,
      limit: emailLimit,
      windowSec: emailWindowSec,
    });

    if (!emailResult.ok) {
      res.setHeader("Retry-After", String(emailResult.retryAfterSec));
      return {
        ok: false,
        message: "Too many requests. Please try again later.",
        retryAfterSec: emailResult.retryAfterSec,
      };
    }
  }

  return { ok: true, retryAfterSec: 0 };
}
