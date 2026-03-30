import axios from "axios";
import dns from "dns/promises";
import net from "net";
import { enforceRouteRateLimit } from "../../../lib/rateLimit";
import { logSecurityEvent } from "../../../lib/security-log";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_BYTES = Math.max(
  256 * 1024,
  Number(process.env.MAX_MEDIA_PROXY_BYTES || DEFAULT_MAX_BYTES),
);
const TIMEOUT_MS = Math.max(
  3000,
  Number(process.env.MEDIA_PROXY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
);
const MAX_REDIRECTS = 2;
const ALLOWLIST = String(process.env.MEDIA_PROXY_ALLOWLIST || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_PORTS = String(process.env.MEDIA_PROXY_ALLOWED_PORTS || "80,443")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0 && value < 65536);

function isAllowedHost(hostname) {
  if (!ALLOWLIST.length) return true;
  return ALLOWLIST.some((entry) => {
    if (entry.startsWith("*.")) {
      return hostname.endsWith(entry.slice(1));
    }
    return hostname === entry;
  });
}

function isBlockedHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host) return true;
  if (host === "localhost") return true;
  if (host.endsWith(".local")) return true;
  return false;
}

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function parseIPv6(ip) {
  const cleaned = String(ip || "").split("%")[0].toLowerCase();
  if (!cleaned) return null;

  if (cleaned.includes(".")) {
    const last = cleaned.split(":").pop();
    if (net.isIPv4(last)) {
      return { ipv4: last };
    }
  }

  const parts = cleaned.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts[1] ? parts[1].split(":") : [];
  const fill = 8 - (head.length + tail.length);
  if (fill < 0) return null;
  const full = [...head, ...Array(fill).fill("0"), ...tail].map((h) =>
    parseInt(h || "0", 16),
  );
  if (full.length !== 8 || full.some((n) => Number.isNaN(n))) return null;
  return { blocks: full };
}

function isPrivateIPv6(ip) {
  const parsed = parseIPv6(ip);
  if (!parsed) return true;
  if (parsed.ipv4) return isPrivateIPv4(parsed.ipv4);
  const blocks = parsed.blocks;
  if (!blocks) return true;
  if (blocks.every((b) => b === 0)) return true;
  if (blocks[0] === 0 && blocks[7] === 1) return true;
  const first = blocks[0];
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  if (first === 0x2001 && blocks[1] === 0x0db8) return true;
  return false;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

async function resolveSafe(hostname) {
  if (net.isIP(hostname)) {
    return [{ address: hostname }];
  }
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  return addresses || [];
}

function sniffContentType(buffer) {
  if (!buffer || buffer.length < 4) return null;
  const hex = buffer.toString("hex", 0, 12);
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
  if (hex.startsWith("47494638")) return "image/gif";
  if (hex.startsWith("52494646") && buffer.toString("ascii", 8, 12) === "WEBP")
    return "image/webp";
  if (buffer.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (hex.startsWith("1a45dfa3")) return "video/webm";
  if (buffer.toString("ascii", 0, 4) === "OggS") return "video/ogg";
  return null;
}

function isAllowedContentType(type) {
  const lowered = String(type || "").toLowerCase();
  return lowered.startsWith("image/") || lowered.startsWith("video/");
}

async function assertUrlAllowed(url) {
  const hostname = url.hostname.toLowerCase();
  if (isBlockedHostname(hostname)) {
    return { ok: false, reason: "blocked_hostname" };
  }
  if (!isAllowedHost(hostname)) {
    return { ok: false, reason: "host_not_allowed" };
  }

  const addresses = await resolveSafe(hostname);
  if (!addresses.length) return { ok: false, reason: "dns_failed" };
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      return { ok: false, reason: "private_ip" };
    }
  }

  return { ok: true };
}

async function fetchStream(url, depth = 0) {
  const response = await axios.get(url, {
    responseType: "stream",
    timeout: TIMEOUT_MS,
    maxRedirects: 0,
    validateStatus: () => true,
    headers: { Accept: "image/*,video/*" },
  });

  if (response.status >= 300 && response.status < 400 && response.headers?.location) {
    response.data?.destroy?.();
    if (depth >= MAX_REDIRECTS) {
      throw new Error("Too many redirects");
    }
    const nextUrl = new URL(response.headers.location, url);
    if (!["http:", "https:"].includes(nextUrl.protocol)) {
      throw new Error("Unsupported protocol");
    }
    if (!ALLOWED_PORTS.includes(Number(nextUrl.port || (nextUrl.protocol === "https:" ? 443 : 80)))) {
      throw new Error("Blocked port");
    }
    const allowed = await assertUrlAllowed(nextUrl);
    if (!allowed.ok) {
      throw new Error("Blocked redirect target");
    }
    return fetchStream(nextUrl.toString(), depth + 1);
  }

  if (response.status < 200 || response.status >= 300) {
    response.data?.destroy?.();
    throw new Error("Upstream fetch failed");
  }

  return response;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const rate = await enforceRouteRateLimit(req, res, {
    route: "media:proxy",
    ipLimit: 30,
    ipWindowSec: 60,
  });
  if (!rate.ok) {
    return res.status(429).json({ message: rate.message });
  }

  const raw = req.query?.url;
  const target = Array.isArray(raw) ? raw[0] : raw;
  if (!target || typeof target !== "string") {
    return res.status(400).json({ message: "url is required" });
  }
  if (target.length > 2048) {
    return res.status(400).json({ message: "url is too long" });
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return res.status(400).json({ message: "Invalid url" });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ message: "Unsupported protocol" });
  }
  if (parsed.username || parsed.password) {
    return res.status(400).json({ message: "Credentials not allowed in url" });
  }

  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  if (!ALLOWED_PORTS.includes(port)) {
    return res.status(400).json({ message: "Port not allowed" });
  }

  const allowed = await assertUrlAllowed(parsed);
  if (!allowed.ok) {
    await logSecurityEvent(req, {
      eventType: "media.proxy.blocked",
      status: "warn",
      metadata: { reason: allowed.reason, host: parsed.hostname },
    });
    return res.status(403).json({ message: "Blocked target" });
  }

  try {
    const response = await fetchStream(parsed.toString(), 0);
    const contentType =
      response.headers?.["content-type"] || "application/octet-stream";
    const declaredAllowed = isAllowedContentType(contentType);

    const contentLength = Number(response.headers?.["content-length"] || 0);
    if (contentLength && contentLength > MAX_BYTES) {
      response.data?.destroy?.();
      return res.status(413).json({ message: "Media file too large" });
    }

    const stream = response.data;
    const firstChunk = await new Promise((resolve, reject) => {
      const onData = (chunk) => {
        stream.pause();
        cleanup();
        resolve(chunk);
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        stream.off("data", onData);
        stream.off("error", onError);
      };
      stream.once("data", onData);
      stream.once("error", onError);
    });

    if (!firstChunk || !firstChunk.length) {
      stream.destroy();
      return res.status(502).json({ message: "Empty upstream response" });
    }

    const sniffed = sniffContentType(firstChunk);
    const finalType = sniffed || (declaredAllowed ? contentType : null);
    if (!finalType || !isAllowedContentType(finalType)) {
      stream.destroy();
      await logSecurityEvent(req, {
        eventType: "media.proxy.invalid_type",
        status: "warn",
        metadata: { contentType, sniffed },
      });
      return res.status(415).json({ message: "Unsupported media type" });
    }

    res.setHeader("Content-Type", finalType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (contentLength) {
      res.setHeader("Content-Length", String(contentLength));
    }

    let sent = firstChunk.length;
    if (sent > MAX_BYTES) {
      stream.destroy();
      return res.status(413).json({ message: "Media file too large" });
    }

    res.write(firstChunk);

    stream.on("data", (chunk) => {
      sent += chunk.length;
      if (sent > MAX_BYTES) {
        stream.destroy();
        logSecurityEvent(req, {
          eventType: "media.proxy.max_bytes",
          status: "warn",
          metadata: { host: parsed.hostname },
        }).catch(() => {});
        res.end();
        return;
      }
      res.write(chunk);
    });
    stream.on("end", () => res.end());
    stream.on("error", () => {
      res.end();
    });
    stream.resume();
  } catch (error) {
    await logSecurityEvent(req, {
      eventType: "media.proxy.error",
      status: "error",
      metadata: { message: String(error?.message || error || "") },
    });
    return res.status(502).json({ message: "Failed to fetch media" });
  }
}
