const MAX_FILES = Math.max(10, Number(process.env.MAX_PACKAGE_FILES || 120));
const MAX_FILE_BYTES = Math.max(
  1024,
  Number(process.env.MAX_PACKAGE_FILE_BYTES || 200 * 1024),
);
const MAX_TOTAL_BYTES = Math.max(
  64 * 1024,
  Number(process.env.MAX_PACKAGE_TOTAL_BYTES || 2 * 1024 * 1024),
);
const MAX_MESSAGE_SCAN_CHARS = Math.max(
  2000,
  Number(process.env.MAX_PACKAGE_MESSAGE_CHARS || 20000),
);
const MAX_MESSAGES_SCAN = Math.max(
  10,
  Number(process.env.MAX_PACKAGE_MESSAGES || 120),
);
const MAX_ZIP_BYTES = Math.max(
  256 * 1024,
  Number(process.env.MAX_PACKAGE_ZIP_BYTES || 4 * 1024 * 1024),
);
const MAX_PATH_LEN = Math.max(
  40,
  Number(process.env.MAX_PACKAGE_PATH_LEN || 180),
);
const MAX_PATH_DEPTH = Math.max(
  2,
  Number(process.env.MAX_PACKAGE_PATH_DEPTH || 6),
);

export const PACKAGE_LIMITS = {
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  MAX_MESSAGE_SCAN_CHARS,
  MAX_MESSAGES_SCAN,
  MAX_ZIP_BYTES,
  MAX_PATH_LEN,
  MAX_PATH_DEPTH,
};

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function toDosDateTime(date = new Date()) {
  const d = new Date(date);
  const year = Math.max(1980, d.getFullYear());
  const dosTime =
    (d.getHours() << 11) |
    (d.getMinutes() << 5) |
    Math.floor(d.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { dosTime, dosDate };
}

export function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = toDosDateTime();

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const dataBuf = Buffer.from(f.content, "utf8");
    const crc = crc32(dataBuf);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuf, dataBuf);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + dataBuf.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const localData = Buffer.concat(localParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(localData.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localData, centralDir, end]);
}

function guessExt(lang = "") {
  const l = lang.toLowerCase();
  if (l.includes("javascript") || l === "js") return "js";
  if (l.includes("typescript") || l === "ts") return "ts";
  if (l.includes("python") || l === "py") return "py";
  if (l.includes("html")) return "html";
  if (l.includes("css")) return "css";
  if (l.includes("json")) return "json";
  if (l.includes("bash") || l.includes("shell") || l === "sh") return "sh";
  if (l.includes("dart")) return "dart";
  if (l.includes("yaml") || l.includes("yml")) return "yml";
  return "txt";
}

function sanitizeFilePath(path = "") {
  const raw = String(path || "")
    .replace(/\u0000/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.+\//, "")
    .replace(/^\/+/, "")
    .replace(/^[a-zA-Z]:/g, "")
    .replace(/\.{2,}/g, "")
    .trim();
  if (!raw) return "";

  const parts = raw
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, MAX_PATH_DEPTH)
    .map((p) => p.replace(/[^a-zA-Z0-9._\-\[\]\(\)@]/g, ""))
    .filter(Boolean);

  const joined = parts.join("/").slice(0, MAX_PATH_LEN);
  return joined;
}

function extractPathFromMeta(meta = "") {
  if (!meta) return "";
  const clean = String(meta).trim();
  const patterns = [
    /(?:file|path|filename)\s*[:=]\s*["']?([^"'\s]+)["']?/i,
    /["']([^"']+\.[a-z0-9]{1,8})["']/i,
    /\b([a-z0-9_.-]+(?:\/[a-z0-9_.-]+)+\.[a-z0-9]{1,8})\b/i,
    /\b([a-z0-9_.-]+\.[a-z0-9]{1,8})\b/i,
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (m?.[1]) return sanitizeFilePath(m[1]);
  }
  return "";
}

function findNearestPathHint(text = "", index = 0) {
  const slice = text.slice(Math.max(0, index - 400), index);
  const lines = slice
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-6)
    .reverse();
  for (const line of lines) {
    const found = extractPathFromMeta(line.replace(/^#+\s*/, ""));
    if (found) return found;
  }
  return "";
}

function ensureUniquePath(path, used) {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const base = dot > 0 ? path.slice(0, dot) : path;
  const ext = dot > 0 ? path.slice(dot) : "";
  let i = 2;
  while (used.has(`${base}_${i}${ext}`)) i += 1;
  const next = `${base}_${i}${ext}`;
  used.add(next);
  return next;
}

function clampText(text, maxChars) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

export function extractCodeFiles(messages = []) {
  const files = [];
  let idx = 1;
  const used = new Set();
  let totalBytes = 0;
  const scanned = messages.slice(-MAX_MESSAGES_SCAN);

  for (const m of scanned) {
    if (m.role !== "assistant" || typeof m.content !== "string") continue;
    const content = clampText(m.content, MAX_MESSAGE_SCAN_CHARS);
    const re = /```([\w.+-]+)?([^\n]*)\n([\s\S]*?)```/g;
    let match;
    while ((match = re.exec(content)) !== null) {
      const lang = (match[1] || "txt").trim();
      const meta = (match[2] || "").trim();
      let code = (match[3] || "").trim();
      if (!code) continue;

      if (code.length > MAX_FILE_BYTES) {
        code = code.slice(0, MAX_FILE_BYTES);
      }

      const metaPath = extractPathFromMeta(meta);
      const nearbyPath = findNearestPathHint(content, match.index);
      const extractedPath = sanitizeFilePath(metaPath || nearbyPath);
      const fallbackPath = `generated/file_${String(idx).padStart(2, "0")}.${guessExt(lang)}`;
      const chosenPath = ensureUniquePath(extractedPath || fallbackPath, used);

      const contentWithNewline = code + "\n";
      const fileBytes = Buffer.byteLength(contentWithNewline, "utf8");
      if (files.length >= MAX_FILES || totalBytes + fileBytes > MAX_TOTAL_BYTES) {
        return files;
      }

      files.push({
        name: chosenPath,
        content: contentWithNewline,
      });
      totalBytes += fileBytes;
      idx += 1;
    }
  }

  if (files.length === 0) {
    files.push({
      name: "generated/README.txt",
      content: "No code blocks were found in this conversation.\n",
    });
  } else {
    const manifest = files.map((f, i) => `${i + 1}. ${f.name}`).join("\n");
    files.push({
      name: "generated/manifest.txt",
      content: `Generated files in this package:\n\n${manifest}\n`,
    });

    const hasReadme = files.some((f) =>
      /(^|\/)readme\.(md|txt)$/i.test(f.name),
    );
    if (!hasReadme) {
      files.push({
        name: "README.md",
        content:
          "# Project Package\n\n" +
          "This project was generated by TriCode AI.\n\n" +
          "## Quick start\n" +
          "```bash\n" +
          "npm install\n" +
          "npm run dev\n" +
          "```\n\n" +
          "If this is a Next.js app, open http://localhost:3000 after running `npm run dev`.\n",
      });
    }
  }

  return files;
}
