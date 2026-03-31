import { connectDB } from "../../lib/mongodb";
import Conversation from "../../models/Conversation";
import User from "../../models/User";
import UsageLog from "../../models/UsageLog";
import { withAuth } from "../../lib/auth";
import { MODELS } from "../../lib/chatModels";
import { getSystemConfig } from "../../lib/system";
import { enforceRouteRateLimit } from "../../lib/rateLimit";
import { logSecurityEvent } from "../../lib/security-log";
import { requireCsrf } from "../../lib/csrf";
import {
  PACKAGE_LIMITS,
  createZip,
  extractCodeFiles,
} from "../../lib/packager";
import axios from "axios";
import mongoose from "mongoose";
import { z } from "zod";

export const config = {
  api: { bodyParser: { sizeLimit: "64mb" } },
};

let admZipPromise = null;
async function getAdmZip() {
  if (!admZipPromise) {
    admZipPromise = import("adm-zip").then((m) => m.default || m);
  }
  return admZipPromise;
}

let pdfParsePromise = null;
async function getPdfParse() {
  if (!pdfParsePromise) {
    pdfParsePromise = import("pdf-parse").then((m) => m.default || m);
  }
  return pdfParsePromise;
}

const SYSTEM_PROMPTS = {
  fa: "You are an expert AI programming assistant. Always answer in Dari (Persian Dari). Use markdown and give practical code. When modifying files, include filename hints in code fences (e.g. ```js path=src/app.js).",
  ps: "You are an expert AI programming assistant. Always answer in Pashto. Use markdown and give practical code. When modifying files, include filename hints in code fences (e.g. ```js path=src/app.js).",
  en: "You are an expert AI programming assistant. Be clear, concise, and provide production-ready code examples. When modifying files, include filename hints in code fences (e.g. ```js path=src/app.js).",
};

const EXPERT_SYSTEM_HINTS = {
  fa: "Expert coding mode requirements: start with a brief plan before edits (skip the plan when generating a full project and follow the required project output order). Make minimal, focused changes and follow existing patterns. Use attachments as the source of truth; do not invent files or APIs. When creating or modifying files, output complete file contents with path hints in code fences (e.g. ```js path=src/app.js). No placeholders. If touching backend/api/auth, include tests or validation steps, or explicitly say why not. Explain tradeoffs briefly and ask a concise clarifying question if critical details are missing.",
  ps: "Expert coding mode requirements: start with a brief plan before edits (skip the plan when generating a full project and follow the required project output order). Make minimal, focused changes and follow existing patterns. Use attachments as the source of truth; do not invent files or APIs. When creating or modifying files, output complete file contents with path hints in code fences (e.g. ```js path=src/app.js). No placeholders. If touching backend/api/auth, include tests or validation steps, or explicitly say why not. Explain tradeoffs briefly and ask a concise clarifying question if critical details are missing.",
  en: "Expert coding mode requirements: start with a brief plan before edits (skip the plan when generating a full project and follow the required project output order). Make minimal, focused changes and follow existing patterns. Use attachments as the source of truth; do not invent files or APIs. When creating or modifying files, output complete file contents with path hints in code fences (e.g. ```js path=src/app.js). No placeholders. If touching backend/api/auth, include tests or validation steps, or explicitly say why not. Explain tradeoffs briefly and ask a concise clarifying question if critical details are missing.",
};

const PROJECT_INSTRUCTIONS = {
  fa: "If the user asks for a full website/app, generate a complete runnable project. Default to a static HTML/CSS/JS site unless the user explicitly requests a framework or backend. If Next.js is requested, use Next.js 15.1.x with React 18.2.0 and JavaScript (not TypeScript). Avoid deprecated packages and keep dependencies minimal. Output only in this order: 1) a short overview (3-6 bullet points) describing the website, 2) a short folder tree, 3) every file in code blocks with a path hint (e.g. ```js path=src/index.js). No extra prose beyond the overview. Include README.md with install/build/dev steps (or clear run steps if no build tooling). Files must be complete and runnable.",
  ps: "If the user asks for a full website/app, generate a complete runnable project. Default to a static HTML/CSS/JS site unless the user explicitly requests a framework or backend. If Next.js is requested, use Next.js 15.1.x with React 18.2.0 and JavaScript (not TypeScript). Avoid deprecated packages and keep dependencies minimal. Output only in this order: 1) a short overview (3-6 bullet points) describing the website, 2) a short folder tree, 3) every file in code blocks with a path hint (e.g. ```js path=src/index.js). No extra prose beyond the overview. Include README.md with install/build/dev steps (or clear run steps if no build tooling). Files must be complete and runnable.",
  en: "If the user asks for a full website/app, generate a complete runnable project. Default to a static HTML/CSS/JS site unless the user explicitly requests a framework or backend. If Next.js is requested, use Next.js 15.1.x with React 18.2.0 and JavaScript (not TypeScript). Avoid deprecated packages and keep dependencies minimal. Output only in this order: 1) a short overview (3-6 bullet points) describing the website, 2) a short folder tree, 3) every file in code blocks with a path hint (e.g. ```js path=src/index.js). No extra prose beyond the overview. Include README.md with install/build/dev steps (or clear run steps if no build tooling). Files must be complete and runnable.",
};

const WEB_SEARCH_SYSTEM_HINTS = {
  fa: "نتایج جستجوی وب ممکن است در پیام کاربر آمده باشد. از همان نتایج استفاده کن و URLها را ذکر کن. تاریخ روز پاسخ را برای «تازه‌ترین/به‌روز» صریح بنویس. اگر نتایج مرتبط نبودند، شفاف بگو پیدا نشد و درخواست شفاف‌سازی کن. از اشاره به knowledge cutoff یا نبود دسترسی فعلی خودداری کن.",
  ps: "د ویب لټون پایلې ښايي د کارن په پیغام کې وي. له هماغو پایلو کار واخله او URLونه یاد کړه. د «تازه/اوسني» لپاره د نن نېټه روښانه ولیکه. که پایلې اړوند نه وې، روښانه ووایه چې ونه موندل شوې او د وضاحت غوښتنه وکړه. د knowledge cutoff یادونه مه کوه.",
  en: "Web search results may be provided in the user message. Use them to answer and cite URLs. For 'latest/current' questions, state today's date explicitly. If results are not relevant, say so and ask for clarification. Do not mention knowledge cutoffs or lack of access to current information.",
};

const DEFAULT_MODEL_KEY = "deepseek-v3";
const EXPERT_MODEL_KEY = "qwen-2.5-coder";
const VISION_MODEL_KEY = "llama-3.2-11b";
const DEFAULT_IMAGE_MODEL = "pollinations";
const DEFAULT_VIDEO_MODEL = "minimax-video";
const OPENROUTER_API_KEY = String(process.env.OPENROUTER_API_KEY || "").trim();
const JSON2VIDEO_API_KEY = String(process.env.JSON2VIDEO_API_KEY || "").trim();
const JSON2VIDEO_API_BASE = String(
  process.env.JSON2VIDEO_API_BASE || "https://api.json2video.com/v2",
)
  .trim()
  .replace(/\/+$/, "");
const RAW_BRAVE_SEARCH_API_KEY = String(
  process.env.BRAVE_SEARCH_API_KEY || "",
).trim();
const TAVILY_API_KEY = String(process.env.TAVILY_API_KEY || "").trim();
const BRAVE_SEARCH_API_KEY = RAW_BRAVE_SEARCH_API_KEY;
const TAVILY_SEARCH_API_KEY =
  TAVILY_API_KEY ||
  (/^tvly-/i.test(RAW_BRAVE_SEARCH_API_KEY) ? RAW_BRAVE_SEARCH_API_KEY : "");
const BRAVE_SEARCH_COUNTRY = String(
  process.env.BRAVE_SEARCH_COUNTRY || "us",
).trim();
const BRAVE_SEARCH_LANG = String(process.env.BRAVE_SEARCH_LANG || "en").trim();

const MAX_MESSAGE_LENGTH = Math.max(
  200,
  Number(process.env.MAX_CHAT_MESSAGE_LENGTH || 4000),
);
const MAX_ATTACHMENTS = Math.max(
  0,
  Number(process.env.MAX_CHAT_ATTACHMENTS || 200),
);
const MAX_ATTACHMENT_BYTES = Math.max(
  256 * 1024,
  Number(process.env.MAX_CHAT_ATTACHMENT_BYTES || 8 * 1024 * 1024),
);
const MAX_STORED_IMAGE_BYTES = Math.max(
  256 * 1024,
  Number(process.env.MAX_STORED_IMAGE_BYTES || MAX_ATTACHMENT_BYTES),
);
const STORED_IMAGE_TIMEOUT_MS = Math.max(
  3000,
  Number(process.env.STORED_IMAGE_TIMEOUT_MS || 15000),
);
const STORE_GENERATED_IMAGES =
  String(process.env.STORE_GENERATED_IMAGES || "true").toLowerCase() !==
  "false";
const MAX_FILE_CHARS = Math.max(
  1000,
  Number(process.env.MAX_CHAT_FILE_CHARS || 12000),
);
const MAX_CONVERSATION_MESSAGES = Math.max(
  50,
  Number(process.env.MAX_CONVERSATION_MESSAGES || 200),
);

const MODEL_FALLBACK_KEYS = [
  DEFAULT_MODEL_KEY,
  "qwen-2.5-7b",
  "gemma-2-9b",
  "mistral-7b",
  "phi-3-mini",
];

const TEXT_MIME_ALLOWLIST = [
  "text/",
  "application/json",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/xml",
];
const PDF_MIME_ALLOWLIST = ["application/pdf"];
const ZIP_MIME_ALLOWLIST = ["application/zip", "application/x-zip-compressed"];
const ZIP_EXT_ALLOWLIST = [".zip"];

const MAX_ZIP_FILES = Math.max(5, Number(process.env.MAX_ZIP_FILES || 30));
const MAX_ZIP_TOTAL_BYTES = Math.max(
  512 * 1024,
  Number(process.env.MAX_ZIP_TOTAL_BYTES || 4 * 1024 * 1024),
);
const MAX_ZIP_ENTRY_BYTES = Math.max(
  128 * 1024,
  Number(process.env.MAX_ZIP_ENTRY_BYTES || 512 * 1024),
);

const ATTACHMENT_EDIT_GUIDANCE = {
  fa: "اگر کاربر خواست تغییر بدهد، محتوای فایل‌های به‌روزشده را با نام فایل و درون کدبلاک ارائه بده. ?????? ??? ?? ???? ??????? ?? ????? ????? (? ?? ? ????) ?????? ??????? ?????.",
  ps: "که کاروونکی بدلون وغواړي، نو د فایلونو تازه محتوا د فایل نوم سره په کډبلاک کې ورکړه. ???????? ? ????? ??? ??? ???? ? ???????? ???? ????? (?-? ???) ?????.",
  en: "If the user asks to modify attached files, return the complete updated file contents with file names inside code blocks. Do not provide partial diffs or snippets.",
};

const ATTACHMENT_LABELS = {
  fa: {
    header: "محتوای فایل‌های پیوست (به عنوان زمینه):",
    skipped: (names) => `نوع فایل پشتیبانی نشد و نادیده گرفته شد: ${names}.`,
  },
  ps: {
    header: "د ضمیمه شوو فایلونو منځپانګه (د سرچینې په توګه):",
    skipped: (names) => `د ځینو فایلونو ډول نه ملاتړ کېږي: ${names}.`,
  },
  en: {
    header: "Attached file contents (use this as source context):",
    skipped: (names) => `Unsupported file types skipped: ${names}.`,
  },
};

const TEXT_EXT_ALLOWLIST = [
  ".txt",
  ".md",
  ".json",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".csv",
  ".html",
  ".css",
  ".xml",
  ".yml",
  ".yaml",
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
];

const MAX_ATTACHMENT_URL_LENGTH = Math.max(
  2048,
  MAX_ATTACHMENT_BYTES * 2 + 512,
);

const chatAttachmentSchema = z.object({
  type: z.enum(["image", "file"]),
  url: z.string().trim().max(MAX_ATTACHMENT_URL_LENGTH).optional().default(""),
  name: z.string().trim().max(140).optional().default(""),
  mimeType: z.string().trim().max(140).optional().default(""),
  size: z.coerce
    .number()
    .int()
    .nonnegative()
    .max(MAX_ATTACHMENT_BYTES)
    .optional()
    .default(0),
});

const chatPayloadSchema = z.object({
  message: z
    .preprocess(
      (val) => (val == null ? "" : val),
      z.string().trim().max(MAX_MESSAGE_LENGTH),
    )
    .optional()
    .default(""),
  conversationId: z
    .preprocess((val) => (val == null ? "" : val), z.string().trim().max(64))
    .optional()
    .default(""),
  language: z.enum(["fa", "ps", "en"]).optional().default("fa"),
  modelKey: z
    .preprocess((val) => (val == null ? "" : val), z.string().trim().max(80))
    .optional()
    .default(DEFAULT_MODEL_KEY),
  attachments: z
    .preprocess(
      (val) => (Array.isArray(val) ? val : []),
      z.array(chatAttachmentSchema).max(MAX_ATTACHMENTS),
    )
    .optional()
    .default([]),
  autoOptimize: z.boolean().optional().default(true),
  stream: z.boolean().optional().default(false),
  taskType: z
    .enum(["normal", "image", "video", "web", "deep", "think", "expert"])
    .optional()
    .default("normal"),
});

function getDataUrlSizeBytes(dataUrl) {
  const match = String(dataUrl || "").match(/^data:[^;]+;base64,(.*)$/i);
  if (!match) return 0;
  const b64 = match[1] || "";
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

function isSafeAttachmentUrl(url) {
  if (!url) return true;
  if (url.startsWith("data:")) return true;
  return /^https?:\/\//i.test(url);
}

function normalizeAttachments(attachments = []) {
  const normalized = [];

  for (const item of attachments) {
    const url = String(item?.url || "");
    if (!isSafeAttachmentUrl(url)) {
      return { ok: false, error: "Unsupported attachment URL scheme." };
    }

    if (url.startsWith("data:")) {
      const sizeBytes = getDataUrlSizeBytes(url);
      if (sizeBytes > MAX_ATTACHMENT_BYTES) {
        return { ok: false, error: "Attachment is too large." };
      }
    }

    if (item.type === "image" && !url) {
      return { ok: false, error: "Image attachment must include a URL." };
    }

    normalized.push({
      type: item.type,
      url,
      name: String(item?.name || ""),
      mimeType: String(item?.mimeType || ""),
      size: Number(item?.size || 0),
    });
  }

  return { ok: true, attachments: normalized };
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

async function resetDailyUsageIfNeeded(user, today) {
  if (!user?.lastReset || user.lastReset < today) {
    await User.updateOne(
      { _id: user._id },
      { $set: { usageToday: 0, lastReset: today } },
    );
    user.usageToday = 0;
    user.lastReset = today;
  }
}

async function reserveUsage(user) {
  const update = { $inc: { usageToday: 1, usageMonth: 1 } };
  const filter = { _id: user._id };

  if (!user.unlimitedCredits) {
    update.$inc.creditBalance = -1;
    if (user.dailyLimit > 0) filter.usageToday = { $lt: user.dailyLimit };
    if (user.monthlyLimit > 0) filter.usageMonth = { $lt: user.monthlyLimit };
    filter.creditBalance = { $gt: 0 };
  }

  const result = await User.updateOne(filter, update);
  return result.modifiedCount === 1;
}

async function rollbackUsage(user) {
  const update = { $inc: { usageToday: -1, usageMonth: -1 } };
  if (!user.unlimitedCredits) update.$inc.creditBalance = 1;
  await User.updateOne({ _id: user._id }, update);
}

function getErrorMessage(err) {
  return err?.response?.data?.error?.message || err?.message || "Unknown error";
}

function getDetailedErrorMessage(err) {
  const base = getErrorMessage(err);
  const detail =
    err?.response?.data?.detail ||
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    "";
  if (!detail) return base;
  if (typeof detail === "string") return `${base} | ${detail}`;
  try {
    return `${base} | ${JSON.stringify(detail)}`;
  } catch {
    return base;
  }
}

function isNoEndpointError(err) {
  return getErrorMessage(err).toLowerCase().includes("no endpoints found");
}

function isRetryableModelError(err) {
  if (isNoEndpointError(err)) return true;
  const status = err?.status || err?.response?.status;
  if (status) return status === 429 || status >= 500;
  const msg = getErrorMessage(err).toLowerCase();
  return /timeout|timed out|aborted|overloaded|temporar|connection|network/.test(
    msg,
  );
}

const VISION_ID_HINTS = [
  "vision",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gemini",
  "claude-3",
];

function isVisionModel(modelInfo) {
  const id = modelInfo?.id?.toLowerCase() || "";
  return VISION_ID_HINTS.some((hint) => id.includes(hint));
}

function getVisionCandidates(systemConfig) {
  return Object.keys(MODELS).filter((key) => {
    if (!MODELS[key]) return false;
    if (!isVisionModel(MODELS[key])) return false;
    return systemConfig?.availableModels?.[key] !== false;
  });
}

function buildModelTryOrder(requestedKey, needVision = false) {
  const first = MODELS[requestedKey] ? requestedKey : DEFAULT_MODEL_KEY;
  const keys = needVision
    ? [VISION_MODEL_KEY, first, ...MODEL_FALLBACK_KEYS]
    : [first, ...MODEL_FALLBACK_KEYS];
  return keys.filter((key, idx) => keys.indexOf(key) === idx && MODELS[key]);
}

function parseCommand(rawMessage, forcedMode = "normal") {
  const text = (rawMessage || "").trim();
  const lower = text.toLowerCase();

  if (lower.startsWith("/image ")) {
    const payload = text.slice(7).trim();
    const modelMatch = payload.match(/^model\s*:\s*([a-z0-9._-]+)\s+(.*)$/i);
    if (modelMatch) {
      return {
        mode: "image",
        model: modelMatch[1].toLowerCase(),
        prompt: modelMatch[2].trim(),
      };
    }
    return { mode: "image", prompt: payload };
  }
  if (lower.startsWith("/video ")) {
    const payload = text.slice(7).trim();
    const modelMatch = payload.match(/^model\s*:\s*([a-z0-9._-]+)\s+(.*)$/i);
    if (modelMatch) {
      return {
        mode: "video",
        model: modelMatch[1].toLowerCase(),
        prompt: modelMatch[2].trim(),
      };
    }
    return { mode: "video", prompt: payload };
  }
  if (lower.startsWith("/web ")) {
    return { mode: "web", prompt: text.slice(5).trim() };
  }
  if (lower.startsWith("/deep ")) {
    return { mode: "deep", prompt: text.slice(6).trim() };
  }
  if (lower.startsWith("/think ")) {
    return { mode: "think", prompt: text.slice(7).trim() };
  }

  if (forcedMode === "image") return { mode: "image", prompt: text };
  if (forcedMode === "video") return { mode: "video", prompt: text };
  if (forcedMode === "web") return { mode: "web", prompt: text };
  if (forcedMode === "deep") return { mode: "deep", prompt: text };
  if (forcedMode === "think") return { mode: "think", prompt: text };

  // Natural-language image intent (without /image command).
  const imageTriggers = [
    "generate image",
    "generate a photo",
    "generate a phote",
    "genrate a photo",
    "genrate image",
    "generate photo",
    "create image",
    "create a photo",
    "make image",
    "make a photo",
    "draw image",
    "draw a photo",
    "تصویر بساز",
    "عکس بساز",
    "تصویر تولید کن",
    "عکس تولید کن",
    "انځور جوړ کړه",
    "انځور جوړ",
    "photo of",
    "image of",
  ];
  const videoTriggers = [
    "generate video",
    "create video",
    "make video",
    "text to video",
    "video of",
    "انیمیشن بساز",
    "ویدیو بساز",
    "ویدیو تولید کن",
  ];

  if (imageTriggers.some((trigger) => lower.includes(trigger))) {
    let prompt = text
      .replace(/^\/?image\s*/i, "")
      .replace(
        /^(generate|create|make|draw)\s+(an?\s+)?(image|photo|phote|pic|picture)\s+(of\s+)?/i,
        "",
      )
      .replace(/^(تصویر|عکس)\s+(بساز|تولید کن)\s*/i, "")
      .trim();
    if (!prompt) prompt = text;
    return { mode: "image", prompt };
  }

  if (videoTriggers.some((trigger) => lower.includes(trigger))) {
    let prompt = text
      .replace(/^(generate|create|make)\s+(an?\s+)?video\s+(of\s+)?/i, "")
      .replace(/^text\s+to\s+video\s*/i, "")
      .trim();
    if (!prompt) prompt = text;
    return { mode: "video", prompt };
  }

  return { mode: "normal", prompt: text };
}

function isProjectBuildRequest(text = "") {
  const raw = String(text || "");
  const t = raw.toLowerCase();
  if (!t.trim()) return false;

  const explicitFullProject =
    /(?:full|complete|entire|whole)\s+(?:project|app|application|website|site)/i.test(
      raw,
    );
  if (
    explicitFullProject ||
    /پروژه\s*کامل|وب\s*سایت\s*کامل|وبسایت\s*کامل|اپلیکیشن\s*کامل|برنامه\s*کامل|پروژ(?:ه|ې)\s*بشپړ|وېب\s*سایټ\s*بشپړ|اپ\s*بشپړ|بشپړ\s*پروژ(?:ه|ې)/i.test(
      raw,
    )
  ) {
    return true;
  }

  const hasFramework =
    t.includes("next.js") ||
    t.includes("nextjs") ||
    t.includes("react") ||
    t.includes("frontend") ||
    t.includes("flutter") ||
    t.includes("dart") ||
    t.includes("android") ||
    t.includes("ios") ||
    t.includes("mobile app");

  const hasProjectKeyword =
    /(project|website|site|web\s*app|webapp|landing|dashboard|app|application|portfolio|saas|full\s*stack|boilerplate|template|starter|پروژه|پروژې|وبسایت|وب\s*سایت|وېب\s*سایټ|ویب\s*سایټ|سایت|اپلیکیشن|اپ|برنامه|داشبورد|لندینگ|صفحه\s*فرود)/i.test(
      raw,
    );

  const hasIntent =
    /(build|create|generate|make|scaffold|start|starter|bootstrap|develop|implement|produce|design|launch|setup|set\s*up|init|initialize|code|write|need|want|require|looking\s*for|please|help\s*me|can\s*you|could\s*you|build\s+me|create\s+me|make\s+me|design\s+me|i\s*need|i\s*want)/i.test(
      t,
    ) || /(بساز|ساخت|ایجاد|تولید|طراحی|جوړ|جوړول|جوړه|راجوړ)/i.test(raw);

  return (hasFramework || hasProjectKeyword) && hasIntent;
}

function wantsDeepSearch(text = "") {
  const t = String(text || "").toLowerCase();
  return /(deep|in[-\s]?depth|detailed|research|analysis|compare|comparison|survey|evidence|sources|citations)/i.test(
    t,
  );
}

function isFreshnessQuery(text = "") {
  const raw = String(text || "");
  const t = raw.toLowerCase();
  if (!t.trim()) return false;

  const yearMatches = raw.match(/\b(19|20)\d{2}\b/g) || [];
  for (const y of yearMatches) {
    const n = Number(y);
    if (Number.isFinite(n) && n >= 2024) return true;
  }

  const keywords = [
    "latest",
    "recent",
    "current",
    "today",
    "yesterday",
    "tomorrow",
    "this week",
    "this month",
    "this year",
    "right now",
    "now",
    "update",
    "updated",
    "news",
    "release",
    "version",
    "breaking",
    "trend",
    "trending",
    "new",
    "newest",
    "up-to-date",
    "up to date",
  ];

  const localKeywords = [
    "آخرین",
    "جدید",
    "جدیدترین",
    "تازه",
    "امروز",
    "دیروز",
    "فردا",
    "این هفته",
    "این ماه",
    "این سال",
    "به\u200cروز",
    "بروزرسانی",
    "آپدیت",
    "خبر",
    "اخبار",
    "اوس",
    "نن",
    "پرون",
    "سبا",
    "دا اونۍ",
    "دا میاشت",
    "دا کال",
    "تازه",
    "نوی",
    "خبرونه",
  ];

  return (
    keywords.some((k) => t.includes(k)) ||
    localKeywords.some((k) => raw.includes(k))
  );
}

function stripCutoffDisclaimers(text = "", enabled = false) {
  if (!enabled || !text) return text;
  const denyRe =
    /(knowledge cutoff|cutoff|cannot access|can't access|do not have access|no access to current|not able to access|I don't have access|I do not have access|اکتبر\s*2023|نمی‌توانم.*اطلاعات|نمی\u200cتوانم.*اطلاعات|د لاسرسي نه لرم|نشم کولی.*معلومات)/i;
  const lines = String(text).split("\n");
  const filtered = lines.filter((line) => !denyRe.test(line));
  return filtered.join("\n").trim();
}

function searchUnavailableMessage(uiLang = "en") {
  if (uiLang === "fa") {
    return "نتیجه‌ای از جستجوی وب دریافت نشد. لطفاً پرسش را مشخص‌تر کنید یا بعداً دوباره تلاش کنید. اگر این مشکل ادامه داشت، مدیر باید کلید API جستجو را تنظیم کند.";
  }
  if (uiLang === "ps") {
    return "د وېب لټون لپاره پایلې ونه موندل شوې. مهرباني وکړئ پوښتنه مشخصه کړئ یا بیا هڅه وکړئ. که دا ستونزه دوام وکړي، مدیر باید د لټون API کلي تنظیم کړي.";
  }
  return "Live web search returned no results. Please refine your query or try again.";
}

function isNextProject(files = []) {
  return files.some((f) =>
    /(^|\/)pages\/|(^|\/)app\/|next\.config\.(js|mjs|ts)$/i.test(f?.name || ""),
  );
}

function rebuildManifest(files = []) {
  const manifestIdx = files.findIndex((f) =>
    /(^|\/)generated\/manifest\.txt$/i.test(f?.name || ""),
  );
  if (manifestIdx === -1) return files;
  const list = files
    .filter((f) => !/(^|\/)generated\/manifest\.txt$/i.test(f?.name || ""))
    .map((f, i) => `${i + 1}. ${f.name}`)
    .join("\n");
  files[manifestIdx] = {
    ...files[manifestIdx],
    content: `Generated files in this package:\n\n${list}\n`,
  };
  return files;
}

function normalizeNextPackageJson(files = []) {
  const pkgIdx = files.findIndex((f) =>
    /(^|\/)package\.json$/i.test(f?.name || ""),
  );
  const defaults = {
    name: "generated-next-app",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start" },
    dependencies: {
      next: "15.1.6",
      react: "18.2.0",
      "react-dom": "18.2.0",
    },
  };

  if (pkgIdx === -1) {
    files.push({
      name: "package.json",
      content: `${JSON.stringify(defaults, null, 2)}\n`,
    });
    return rebuildManifest(files);
  }

  try {
    const pkg = JSON.parse(files[pkgIdx].content || "{}");
    pkg.name = pkg.name || defaults.name;
    pkg.private = typeof pkg.private === "boolean" ? pkg.private : true;
    pkg.scripts = { ...defaults.scripts, ...(pkg.scripts || {}) };
    pkg.dependencies = { ...(pkg.dependencies || {}) };
    pkg.dependencies.next = defaults.dependencies.next;
    pkg.dependencies.react =
      pkg.dependencies.react || defaults.dependencies.react;
    pkg.dependencies["react-dom"] =
      pkg.dependencies["react-dom"] || defaults.dependencies["react-dom"];
    files[pkgIdx] = {
      ...files[pkgIdx],
      content: `${JSON.stringify(pkg, null, 2)}\n`,
    };
  } catch {}

  return rebuildManifest(files);
}

function hasConfigFile(files = []) {
  return files.some((f) => /(^|\/)(js|ts)config\.json$/i.test(f?.name || ""));
}

function needsAliasConfig(files = []) {
  if (hasConfigFile(files)) return false;
  return files.some((f) => {
    const name = String(f?.name || "");
    if (!/\.(js|jsx|ts|tsx|mjs)$/i.test(name)) return false;
    return /from\s+['"]@\/|require\(['"]@\//.test(String(f?.content || ""));
  });
}

function ensureAliasConfig(files = []) {
  if (!needsAliasConfig(files)) return files;
  const config = {
    compilerOptions: {
      baseUrl: ".",
      paths: {
        "@/*": ["./*"],
      },
    },
  };
  files.push({
    name: "jsconfig.json",
    content: `${JSON.stringify(config, null, 2)}\n`,
  });
  return rebuildManifest(files);
}

function ensureNextEntryFiles(files = []) {
  const hasAppPage = files.some((f) =>
    /(^|\/)app\/page\.(js|jsx|ts|tsx)$/i.test(f?.name || ""),
  );
  const hasLayout = files.some((f) =>
    /(^|\/)app\/layout\.(js|jsx|ts|tsx)$/i.test(f?.name || ""),
  );
  const hasPagesIndex = files.some((f) =>
    /(^|\/)pages\/index\.(js|jsx|ts|tsx)$/i.test(f?.name || ""),
  );

  if (!hasAppPage && !hasPagesIndex) {
    files.push({
      name: "app/page.js",
      content:
        "export default function Home() {\n" +
        "  return (\n" +
        "    <main style={{ padding: '32px', fontFamily: 'sans-serif' }}>\n" +
        "      <h1>Welcome</h1>\n" +
        "      <p>Your project files are ready.</p>\n" +
        "    </main>\n" +
        "  )\n" +
        "}\n",
    });
  }

  if (!hasLayout) {
    files.push({
      name: "app/layout.js",
      content:
        "export const metadata = {\n" +
        "  title: 'Generated App',\n" +
        "  description: 'Auto-generated project',\n" +
        "}\n\n" +
        "export default function RootLayout({ children }) {\n" +
        "  return (\n" +
        '    <html lang="en">\n' +
        "      <body>{children}</body>\n" +
        "    </html>\n" +
        "  )\n" +
        "}\n",
    });
  }

  return rebuildManifest(files);
}

function normalizeProjectFiles(files = []) {
  if (!Array.isArray(files) || files.length === 0) return files;
  if (!isNextProject(files)) return files;
  let out = normalizeNextPackageJson(files);
  out = ensureAliasConfig(out);
  out = ensureNextEntryFiles(out);
  return out;
}

const UNSUPPORTED_SCRIPT_REGEX =
  /[\u0400-\u052F\u0590-\u05FF\u0900-\u0D7F\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;

function isSupportedTriCodeLanguage(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (UNSUPPORTED_SCRIPT_REGEX.test(t)) return false;
  if (/[\u0600-\u06FF]/.test(t)) return true; // Dari / Pashto script
  if (/[A-Za-z]/.test(t)) return true; // English (Latin letters)
  return true;
}

function unsupportedLanguageMessage(uiLang = "en") {
  if (uiLang === "fa")
    return "این زبان پشتیبانی نمی‌شود. لطفاً فقط به دری، پشتو یا انگلیسی بنویسید.";
  if (uiLang === "ps")
    return "دا ژبه نه ملاتړ کیږي. مهرباني وکړئ یوازې په دري، پښتو یا انګلیسي ولیکئ.";
  return "Language is not supported. Please use only Dari, Pashto, or English.";
}

function visionUnavailableMessage(uiLang = "en") {
  if (uiLang === "fa") {
    return "مدلِ مناسبِ تحلیل تصویر در دسترس نیست. لطفاً بعداً دوباره تلاش کنید یا با مدیر سیستم تماس بگیرید.";
  }
  if (uiLang === "ps") {
    return "د انځور د شننې لپاره مناسب موډل شته نه دی. وروسته بیا هڅه وکړئ یا له مدیر سره اړیکه ونیسئ.";
  }
  return "No vision-capable model is available right now. Please try again later or contact the admin.";
}

function attachmentOnlyMessage(uiLang = "en") {
  if (uiLang === "fa") return "فایل‌های پیوست‌شده را بررسی کن.";
  if (uiLang === "ps") return "ضمیمه شوي فایلونه وګوره.";
  return "Please review the attached files.";
}

function detectTaskModel(
  message,
  attachments = [],
  projectMode = false,
  expertMode = false,
) {
  const text = (message || "").toLowerCase();
  const hasFiles =
    Array.isArray(attachments) && attachments.some((a) => a?.type === "file");
  const codingIntent =
    expertMode ||
    projectMode ||
    /(code|bug|refactor|function|class|api|backend|frontend|python|javascript|typescript|react|next\.js|node|sql|file)/i.test(
      text,
    ) ||
    hasFiles;
  if (codingIntent && MODELS[EXPERT_MODEL_KEY]) return EXPERT_MODEL_KEY;
  return null;
}

function getTaskOptimizedModel(
  parsedMode,
  selectedModelKey,
  autoOptimize,
  systemConfig,
) {
  if (!autoOptimize) return selectedModelKey;
  if (parsedMode === "web" || parsedMode === "deep") {
    if (
      systemConfig?.availableModels?.["gpt-4o-mini"] !== false &&
      MODELS["gpt-4o-mini"]
    )
      return "gpt-4o-mini";
    return selectedModelKey;
  }
  return selectedModelKey;
}

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function isLikelyTextFile(attachment) {
  const mime = (attachment?.mimeType || "").toLowerCase();
  const name = (attachment?.name || "").toLowerCase();

  if (TEXT_MIME_ALLOWLIST.some((m) => mime.startsWith(m))) return true;
  return TEXT_EXT_ALLOWLIST.some((ext) => name.endsWith(ext));
}

function isPdfAttachment(attachment, parsedMime) {
  const mime = (attachment?.mimeType || parsedMime || "").toLowerCase();
  const name = (attachment?.name || "").toLowerCase();
  return PDF_MIME_ALLOWLIST.includes(mime) || name.endsWith(".pdf");
}

function isZipAttachment(attachment, parsedMime) {
  const mime = (attachment?.mimeType || parsedMime || "").toLowerCase();
  const name = (attachment?.name || "").toLowerCase();
  return (
    ZIP_MIME_ALLOWLIST.includes(mime) ||
    ZIP_EXT_ALLOWLIST.some((ext) => name.endsWith(ext))
  );
}

async function extractTextFromZip(buffer, maxChars = MAX_FILE_CHARS) {
  try {
    const AdmZip = await getAdmZip();
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries().filter((e) => !e.isDirectory);
    let totalBytes = 0;
    let usedFiles = 0;
    const blocks = [];

    for (const entry of entries) {
      if (usedFiles >= MAX_ZIP_FILES || totalBytes >= MAX_ZIP_TOTAL_BYTES)
        break;
      const entryName = entry.entryName || "unnamed";
      const lower = entryName.toLowerCase();
      if (!TEXT_EXT_ALLOWLIST.some((ext) => lower.endsWith(ext))) continue;

      const data = entry.getData();
      if (!data || data.length === 0) continue;
      if (data.length > MAX_ZIP_ENTRY_BYTES) continue;

      totalBytes += data.length;
      usedFiles += 1;

      const text = data.toString("utf8").slice(0, maxChars);
      if (!text.trim()) continue;
      blocks.push(`File: ${entryName}\n---\n${text}\n---`);
    }

    if (!blocks.length) return null;
    return `ZIP contents:\n${blocks.join("\n\n")}`;
  } catch {
    return null;
  }
}

async function extractTextFromAttachment(
  attachment,
  maxChars = MAX_FILE_CHARS,
) {
  if (!attachment?.url) return null;

  const parsed = dataUrlToBuffer(attachment.url);
  if (!parsed) return null;

  if (isPdfAttachment(attachment, parsed.mimeType)) {
    try {
      const pdfParse = await getPdfParse();
      const pdf = await pdfParse(parsed.buffer);
      const text = String(pdf?.text || "")
        .trim()
        .slice(0, maxChars);
      return text || null;
    } catch {
      return null;
    }
  }

  if (isZipAttachment(attachment, parsed.mimeType)) {
    return await extractTextFromZip(parsed.buffer, maxChars);
  }

  if (!isLikelyTextFile(attachment)) return null;

  try {
    const decoded = parsed.buffer.toString("utf8").slice(0, maxChars);
    if (!decoded.trim()) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function buildAttachmentContext(attachments, uiLang = "en") {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { textContext: "", imageAttachments: [], ignoredAttachments: [] };
  }

  const imageAttachments = attachments.filter(
    (a) => a?.type === "image" && a?.url,
  );
  const fileAttachments = attachments.filter((a) => a?.type !== "image");

  const blocks = [];
  const ignoredAttachments = [];

  for (const file of fileAttachments) {
    const extracted = await extractTextFromAttachment(file);
    if (extracted) {
      blocks.push(`File: ${file.name || "unnamed"}\n---\n${extracted}\n---`);
    } else {
      ignoredAttachments.push(file.name || "unnamed");
    }
  }

  let textContext = "";
  if (blocks.length > 0) {
    const labels = ATTACHMENT_LABELS[uiLang] || ATTACHMENT_LABELS.en;
    textContext += `\n\n${labels.header}\n` + blocks.join("\n\n");
    const guide =
      ATTACHMENT_EDIT_GUIDANCE[uiLang] || ATTACHMENT_EDIT_GUIDANCE.en;
    textContext += `\n\n${guide}`;
  }
  if (ignoredAttachments.length > 0) {
    const labels = ATTACHMENT_LABELS[uiLang] || ATTACHMENT_LABELS.en;
    textContext += `\n\n${labels.skipped(ignoredAttachments.join(", "))}`;
  }

  return { textContext, imageAttachments, ignoredAttachments };
}

function flattenRelatedTopics(items, out = []) {
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    if (item?.Text && item?.FirstURL) {
      out.push({ title: item.Text, url: item.FirstURL });
    }
    if (Array.isArray(item?.Topics)) flattenRelatedTopics(item.Topics, out);
  }
  return out;
}

function buildFallbackSearchQueries(query) {
  const raw = String(query || "").trim();
  if (!raw) return [];
  const hasNextJs = /next\.?js|nextjs/i.test(raw);
  const isVersionQuery =
    /version|latest|release|changelog|update|vers\.|نسخه|ورژن|آپدیت|به‌روزرسانی|بروزرسانی|تازه/i.test(
      raw,
    );
  if (hasNextJs && isVersionQuery) {
    return [
      "Next.js latest version",
      "Next.js npm latest",
      "Next.js release notes",
      "Next.js changelog",
    ];
  }
  const yearMatch = raw.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : "";
  const suffix = year ? ` ${year}` : "";
  return [
    `web platform updates${suffix}`,
    `web standards updates${suffix}`,
    `browser updates${suffix}`,
    `HTML CSS JavaScript updates${suffix}`,
  ];
}

function isNextJsVersionQuery(raw = "") {
  if (!raw) return false;
  const hasNextJs = /next\.?js|nextjs/i.test(raw);
  const wantsVersion =
    /version|latest|release|changelog|update|vers\.|نسخه|ورژن|آپدیت|به‌روزرسانی|بروزرسانی|تازه/i.test(
      raw,
    );
  return hasNextJs && wantsVersion;
}

async function fetchNpmLatestVersion(packageName) {
  if (!packageName) return null;
  const response = await axios.get(
    `https://registry.npmjs.org/-/package/${encodeURIComponent(
      packageName,
    )}/dist-tags`,
    {
      timeout: 12000,
      headers: { Accept: "application/json" },
    },
  );
  const latest = response.data?.latest;
  if (!latest) return null;
  return { latest };
}

function buildNpmVersionResult(packageName, latestVersion) {
  const fetchedAt = new Date().toISOString().slice(0, 10);
  return {
    title: `${packageName} npm latest version`,
    url: `https://www.npmjs.com/package/${packageName}`,
    snippet: `Latest npm version: ${latestVersion} (retrieved ${fetchedAt}).`,
  };
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatDateForLang(dateInput, uiLang = "en") {
  const date = dateInput ? new Date(dateInput) : new Date();
  const fallback = new Date().toISOString().slice(0, 10);
  if (Number.isNaN(date.getTime())) return fallback;
  const iso = date.toISOString().slice(0, 10);
  const locale = uiLang === "fa" ? "fa-IR" : uiLang === "ps" ? "ps-AF" : "en-US";
  try {
    const formatted = date.toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (formatted && formatted !== "Invalid Date") return formatted;
  } catch {}
  return iso;
}

function extractNpmVersionResult(results = [], packageName = "next") {
  const target = `npmjs.com/package/${String(packageName).toLowerCase()}`;
  for (const item of results) {
    const url = String(item?.url || "");
    if (!url.includes(target)) continue;
    const snippet = String(item?.snippet || "");
    const match = snippet.match(
      /Latest npm version:\s*([0-9]+\.[0-9]+\.[0-9]+)(?:\s*\(retrieved\s*([0-9-]+)\))?/i,
    );
    if (match) {
      return { version: match[1], fetchedAt: match[2] || "", url };
    }
  }
  return null;
}

function buildNextJsVersionNote(versionData, uiLang = "en") {
  if (!versionData?.version) return "";
  const dateLabel = formatDateForLang(versionData.fetchedAt, uiLang);
  if (uiLang === "fa") {
    return `به‌روزرسانی نسخه: بر اساس رجیستری npm، آخرین نسخهٔ Next.js تا تاریخ ${dateLabel} برابر است با ${versionData.version}.`;
  }
  if (uiLang === "ps") {
    return `د npm رجسټري له مخې، د ${dateLabel} تر نېټې د Next.js وروستۍ نسخه ${versionData.version} ده.`;
  }
  return `Version update: Based on the npm registry, the latest Next.js version as of ${dateLabel} is ${versionData.version}.`;
}

function appendNextJsVersionNote(reply = "", versionData, uiLang = "en") {
  const note = buildNextJsVersionNote(versionData, uiLang);
  if (!note) return reply;
  const hasVersion = new RegExp(`\\b${escapeRegExp(versionData.version)}\\b`).test(
    reply,
  );
  const hasNpm = /npm/i.test(reply);
  if (hasVersion && hasNpm) return reply;
  return `${String(reply || "").trim()}\n\n${note}`.trim();
}

function localizeWikipediaHeading(reply = "", uiLang = "en") {
  const re = /^Wikipedia on (.+)$/gim;
  if (uiLang === "fa") return reply.replace(re, "ویکی‌پدیا: $1");
  if (uiLang === "ps") return reply.replace(re, "ويکیپېډیا: $1");
  return reply;
}

function postProcessReply({ reply = "", uiLang = "en", prompt = "", results = [] }) {
  let output = String(reply || "");
  if (!output) return output;
  output = localizeWikipediaHeading(output, uiLang);
  if (isNextJsVersionQuery(prompt)) {
    const npmInfo = extractNpmVersionResult(results, "next");
    if (npmInfo) {
      output = appendNextJsVersionNote(output, npmInfo, uiLang);
    }
  }
  return output.trim();
}

function appendSearchResults(target, incoming, seen) {
  const list = Array.isArray(incoming) ? incoming : [];
  for (const item of list) {
    if (!item?.url) continue;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    target.push(item);
  }
}

function normalizeSearchQuery(raw = "") {
  if (isNextJsVersionQuery(raw)) return "Next.js latest version";
  return raw;
}

function stripHtml(html = "") {
  return String(html || "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unescapeJsString(value = "") {
  return String(value || "")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}

function decodeDuckUrl(url = "") {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("duckduckgo.com") && u.pathname === "/l/") {
      const uddg = u.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
  } catch {}
  return url;
}

function extractDuckHtmlResults(html = "", limit = 8) {
  const results = [];
  const re =
    /<a[^>]+class=\"result__a\"[^>]+href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && results.length < limit) {
    const url = decodeDuckUrl(match[1] || "");
    const title = stripHtml(match[2] || "");
    const slice = html.slice(match.index, match.index + 1400);
    const snippetMatch = slice.match(
      /class=\"result__snippet\"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const snippet = stripHtml(snippetMatch?.[1] || "");
    if (url && title) {
      results.push({ title, url, snippet: snippet || title });
    }
  }
  return results;
}

async function duckSearchHtml(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const response = await axios.get(
    `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    {
      timeout: 20000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html",
      },
    },
  );
  return extractDuckHtmlResults(response.data || "");
}

function extractBraveHtmlResults(html = "", limit = 8) {
  const results = [];
  const marker = 'type:"search_result"';
  let idx = 0;
  while (results.length < limit) {
    const start = html.indexOf(marker, idx);
    if (start < 0) break;
    const slice = html.slice(start, start + 4000);
    const titleMatch = slice.match(/title:\"([^\"]+)\"/);
    const urlMatch = slice.match(/url:\"(https?:\/\/[^\"]+)\"/);
    const descMatch = slice.match(/description:\"([^\"]*)\"/);
    if (titleMatch && urlMatch) {
      results.push({
        title: unescapeJsString(titleMatch[1]),
        url: unescapeJsString(urlMatch[1]),
        snippet: unescapeJsString(descMatch?.[1] || titleMatch[1]),
      });
    }
    idx = start + marker.length;
  }
  return results;
}

async function braveSearchHtml(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const response = await axios.get(
    `https://search.brave.com/search?q=${encodeURIComponent(q)}`,
    {
      timeout: 20000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html",
      },
    },
  );
  return extractBraveHtmlResults(response.data || "");
}

async function tavilySearch(query, deep = false) {
  const key = TAVILY_SEARCH_API_KEY;
  if (!key) return [];
  const q = String(query || "").trim();
  if (!q) return [];

  const response = await axios.post(
    "https://api.tavily.com/search",
    {
      query: q,
      search_depth: deep ? "advanced" : "basic",
      max_results: deep ? 12 : 6,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      timeout: 20000,
    },
  );

  const results = response.data?.results || [];
  return results
    .filter((r) => r?.url && r?.title)
    .map((r) => ({
      title: String(r.title || ""),
      url: String(r.url || ""),
      snippet: String(r.content || r.title || ""),
    }));
}

async function braveApiSearch(query, deep = false) {
  if (!BRAVE_SEARCH_API_KEY || /^tvly-/i.test(BRAVE_SEARCH_API_KEY)) return [];
  const q = String(query || "").trim();
  if (!q) return [];

  const count = deep ? 12 : 6;
  const response = await axios.get(
    "https://api.search.brave.com/res/v1/web/search",
    {
      params: {
        q,
        count,
        search_lang: BRAVE_SEARCH_LANG || "en",
        country: BRAVE_SEARCH_COUNTRY || "us",
        safesearch: "moderate",
      },
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
      },
      timeout: 20000,
    },
  );

  const web = response.data?.web?.results || [];
  return web
    .filter((r) => r?.url && r?.title)
    .map((r) => ({
      title: String(r.title || ""),
      url: String(r.url || ""),
      snippet: String(r.description || r.title || ""),
    }));
}

async function duckSearch(query, deep = false) {
  const baseParams = {
    format: "json",
    no_redirect: 1,
    no_html: 1,
    skip_disambig: 0,
  };

  const queries = deep
    ? [query, `${query} tutorial`, `${query} latest`]
    : [query];

  const all = [];
  for (const q of queries) {
    try {
      const response = await axios.get("https://api.duckduckgo.com/", {
        params: { q, ...baseParams },
        timeout: 20000,
      });

      const data = response.data || {};
      const results = [];

      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || q,
          url: data.AbstractURL,
          snippet: data.AbstractText,
        });
      }

      const related = flattenRelatedTopics(data.RelatedTopics || []);
      for (const item of related) {
        results.push({ title: item.title, url: item.url, snippet: item.title });
      }

      for (const r of results) all.push(r);
    } catch {
      // ignore search errors and try fallbacks
    }
  }

  if (all.length === 0) {
    const fallbacks = buildFallbackSearchQueries(query);
    for (const q of fallbacks) {
      try {
        const response = await axios.get("https://api.duckduckgo.com/", {
          params: { q, ...baseParams },
          timeout: 20000,
        });

        const data = response.data || {};
        const results = [];

        if (data.AbstractText && data.AbstractURL) {
          results.push({
            title: data.Heading || q,
            url: data.AbstractURL,
            snippet: data.AbstractText,
          });
        }

        const related = flattenRelatedTopics(data.RelatedTopics || []);
        for (const item of related) {
          results.push({
            title: item.title,
            url: item.url,
            snippet: item.title,
          });
        }

        for (const r of results) all.push(r);
      } catch {
        // keep trying
      }
    }
  }

  if (all.length === 0) {
    try {
      const htmlResults = await duckSearchHtml(query);
      for (const r of htmlResults) all.push(r);
    } catch {}
    if (all.length === 0) {
      const fallbacks = buildFallbackSearchQueries(query);
      for (const q of fallbacks) {
        try {
          const htmlFallback = await duckSearchHtml(q);
          for (const r of htmlFallback) all.push(r);
        } catch {}
      }
    }
  }

  if (all.length === 0) {
    try {
      const braveResults = await braveSearchHtml(query);
      for (const r of braveResults) all.push(r);
    } catch {}
    if (all.length === 0) {
      const fallbacks = buildFallbackSearchQueries(query);
      for (const q of fallbacks) {
        try {
          const braveFallback = await braveSearchHtml(q);
          for (const r of braveFallback) all.push(r);
        } catch {}
      }
    }
  }

  const dedup = [];
  const seen = new Set();
  for (const r of all) {
    if (!r?.url || seen.has(r.url)) continue;
    seen.add(r.url);
    dedup.push(r);
  }

  return dedup.slice(0, deep ? 12 : 6);
}

function buildSearchContext(query, results) {
  if (!results || results.length === 0) {
    return `\n\nWeb search for "${query}" returned no structured results.`;
  }

  const fetchedAt = new Date().toISOString().slice(0, 10);
  const list = results
    .map(
      (r, idx) =>
        `${idx + 1}. ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet || ""}`,
    )
    .join("\n\n");

  return `\n\nWeb search results for "${query}" (retrieved ${fetchedAt}):\n${list}\n\nUse these results and cite URLs in your answer.`;
}

async function buildMessagesForModel({
  systemPrompt,
  history,
  message,
  attachments,
  modelInfo,
  searchContext,
  thinkMode,
  uiLang,
  projectMode,
  expertMode,
}) {
  const { textContext, imageAttachments } = await buildAttachmentContext(
    attachments,
    uiLang,
  );

  const projectHint = projectMode
    ? PROJECT_INSTRUCTIONS[uiLang] || PROJECT_INSTRUCTIONS.en
    : "";
  const webHint = searchContext
    ? WEB_SEARCH_SYSTEM_HINTS[uiLang] || WEB_SEARCH_SYSTEM_HINTS.en
    : "";
  const expertHint = expertMode
    ? EXPERT_SYSTEM_HINTS[uiLang] || EXPERT_SYSTEM_HINTS.en
    : "";
  let userText = message;
  if (searchContext) userText += searchContext;
  if (textContext) userText += textContext;
  if (projectHint) userText += `\n\n${projectHint}`;

  if (thinkMode) {
    userText +=
      "\n\nThink step-by-step carefully before final answer. Prioritize correctness over speed.";
  }

  let userContent = userText;
  if (imageAttachments.length > 0 && isVisionModel(modelInfo)) {
    userContent = [
      { type: "text", text: userText },
      ...imageAttachments.map((img) => ({
        type: "image_url",
        image_url: { url: img.url },
      })),
    ];
  } else if (imageAttachments.length > 0) {
    userContent = `${userText}\n\nNote: ${imageAttachments.length} image(s) were attached, but the active model is not vision-capable.`;
  }

  const systemContent = [systemPrompt, projectHint, webHint, expertHint]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: systemContent },
    ...history,
    { role: "user", content: userContent },
  ];
}

async function callOpenRouter(modelId, messages, options = {}) {
  if (!OPENROUTER_API_KEY) {
    const error = new Error("OPENROUTER_API_KEY is missing");
    error.status = 503;
    throw error;
  }
  return axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: modelId,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 3000,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_URL || "http://localhost:3000",
        "X-Title": "TriCode AI",
      },
      timeout: 60000,
    },
  );
}

async function callOpenRouterStream(modelId, messages, options = {}, onDelta) {
  if (!OPENROUTER_API_KEY) {
    const error = new Error("OPENROUTER_API_KEY is missing");
    error.status = 503;
    throw error;
  }
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_URL || "http://localhost:3000",
        "X-Title": "TriCode AI",
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 3000,
        stream: true,
      }),
      signal: options.signal,
    },
  );

  if (!response.ok) {
    let text = "";
    try {
      text = await response.text();
    } catch {}
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {}
    const err = new Error(
      parsed?.error?.message || text || `HTTP ${response.status}`,
    );
    err.status = response.status;
    throw err;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Streaming reader unavailable");
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    if (options.signal?.aborted) {
      throw new Error("Client disconnected");
    }
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta = parsed?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) onDelta(delta);
    }
  }
}

function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function toProxyMediaUrl(url) {
  return `/api/media/proxy?url=${encodeURIComponent(url)}`;
}

function mdUrl(url) {
  return `<${String(url).replace(/>/g, "%3E")}>`;
}

function normalizeMediaPrompt(prompt) {
  const p = String(prompt || "").trim();
  return p || "photorealistic scene, natural lighting, high detail";
}

function resolvePollinationsImageBase() {
  const configured = String(process.env.POLLINATIONS_BASE_URL || "").trim();
  const pollinationsKey = String(process.env.POLLINATIONS_API_KEY || "").trim();
  // Default to the free, unauthenticated endpoint.
  // `gen.pollinations.ai` requires a key (401 otherwise) which commonly breaks
  // fresh Vercel deployments where env vars are not configured yet.
  let base = configured || "https://image.pollinations.ai";
  base = base.replace(/\/+$/, "");

  if (/^https?:\/\/enter\.pollinations\.ai$/i.test(base)) {
    base = "https://image.pollinations.ai";
  }
  if (!pollinationsKey && /^https?:\/\/gen\.pollinations\.ai(\/|$)/i.test(base)) {
    base = "https://image.pollinations.ai";
  }

  try {
    const parsed = new URL(base);
    const path = parsed.pathname.replace(/\/+$/, "");
    const host = parsed.hostname.toLowerCase();
    if (/\/(image|prompt)$/i.test(path)) return base;
    if (host === "image.pollinations.ai") return `${base}/prompt`;
    return `${base}/image`;
  } catch {
    return "https://image.pollinations.ai/prompt";
  }
}

function getPollinationsImageModel() {
  const configured = String(process.env.POLLINATIONS_IMAGE_MODEL || "").trim();
  return configured || "flux";
}

function sniffImageMime(buffer) {
  if (!buffer || buffer.length < 4) return "";
  const hex = buffer.toString("hex", 0, 12);
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
  if (hex.startsWith("47494638")) return "image/gif";
  if (
    hex.startsWith("52494646") &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return "";
}

async function fetchImageAsDataUrl(url) {
  if (!/^https?:\/\//i.test(url || "")) return null;
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: STORED_IMAGE_TIMEOUT_MS,
    maxContentLength: MAX_STORED_IMAGE_BYTES,
    validateStatus: (status) => status >= 200 && status < 300,
    headers: { Accept: "image/*" },
  });
  const buffer = Buffer.from(res.data || []);
  if (!buffer.length || buffer.length > MAX_STORED_IMAGE_BYTES) return null;
  let mime = String(res.headers?.["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!mime.startsWith("image/")) {
    const sniffed = sniffImageMime(buffer);
    if (!sniffed) return null;
    mime = sniffed;
  }
  return {
    dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
    bytes: buffer.length,
    mimeType: mime,
  };
}

async function storeGeneratedImages(attachments = []) {
  if (!STORE_GENERATED_IMAGES) return attachments;
  const stored = [];
  for (const attachment of attachments) {
    if (attachment?.type !== "generated-image" || !attachment?.url) {
      stored.push(attachment);
      continue;
    }
    const sourceUrl = attachment.downloadUrl || attachment.url;
    try {
      const data = await fetchImageAsDataUrl(sourceUrl);
      if (data?.dataUrl) {
        stored.push({
          ...attachment,
          url: data.dataUrl,
          downloadUrl: sourceUrl,
          mimeType: data.mimeType || attachment.mimeType,
          size: data.bytes || attachment.size || 0,
        });
        continue;
      }
    } catch (err) {
      console.warn("storeGeneratedImages failed:", err?.message || err);
    }
    stored.push(attachment);
  }
  return stored;
}

function collectHttpUrls(value, out = []) {
  if (!value) return out;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value.trim())) out.push(value.trim());
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectHttpUrls(item, out);
    return out;
  }
  if (typeof value === "object") {
    // Prefer explicit url-like fields first.
    for (const key of ["url", "uri", "image", "video", "output"]) {
      if (key in value) collectHttpUrls(value[key], out);
    }
    // Then scan remaining fields.
    for (const v of Object.values(value)) collectHttpUrls(v, out);
    return out;
  }
  return out;
}

function toArrayOutput(output) {
  const all = collectHttpUrls(output, []);
  const unique = [];
  const seen = new Set();
  for (const u of all) {
    if (seen.has(u)) continue;
    seen.add(u);
    unique.push(u);
  }
  return unique;
}

async function runReplicatePrediction({ model, input, timeoutMs = 240000 }) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not configured");

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const normalizedModel = String(model || "").trim();
  if (!normalizedModel) throw new Error("Replicate model is not configured");

  let create;
  try {
    if (normalizedModel.includes("/")) {
      // Preferred API shape for model slug: owner/name
      const [owner, name] = normalizedModel.split("/", 2);
      create = await axios.post(
        `https://api.replicate.com/v1/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/predictions`,
        { input },
        { headers, timeout: 30000 },
      );
    } else {
      // Backward-compatible fallback when a version id is provided directly.
      create = await axios.post(
        "https://api.replicate.com/v1/predictions",
        { version: normalizedModel, input },
        { headers, timeout: 30000 },
      );
    }
  } catch (err) {
    const e = new Error(getDetailedErrorMessage(err));
    e.status = err?.response?.status || 500;
    throw e;
  }

  const id = create.data?.id;
  if (!id) throw new Error("Replicate prediction did not return id");

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const statusRes = await axios.get(
      `https://api.replicate.com/v1/predictions/${id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
      },
    );

    const pred = statusRes.data || {};
    if (pred.status === "succeeded") return toArrayOutput(pred.output);
    if (pred.status === "failed" || pred.status === "canceled") {
      throw new Error(pred.error || `Prediction ${pred.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("Prediction timed out");
}

function isReplicateValidationError(err) {
  const status = err?.status || err?.response?.status;
  return (
    status === 422 ||
    /422|validation|unprocessable|invalid input/i.test(
      getDetailedErrorMessage(err),
    )
  );
}

function isReplicateRateLimitError(err) {
  const status = err?.status || err?.response?.status;
  return (
    status === 429 ||
    /rate limit|throttled|too many requests/i.test(getDetailedErrorMessage(err))
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMediaModelFromSelection(
  selectedModelKey,
  parsedModel,
  autoOptimize,
  type,
  systemConfig,
) {
  const imageDefault = "pollinations"; // Always use pollinations (free, no API key needed)
  const videoDefault = systemConfig?.media?.videoDefault || DEFAULT_VIDEO_MODEL;
  const hasJson2Video = Boolean(JSON2VIDEO_API_KEY);
  const hasReplicate = Boolean(process.env.REPLICATE_API_TOKEN);
  const fromCommand = parsedModel || "";
  if (fromCommand) return fromCommand;

  if (!autoOptimize && selectedModelKey) {
    if (type === "image" && selectedModelKey === "gpt-4o") return "gpt-image";
    if (type === "image" && selectedModelKey.includes("qwen"))
      return "pollinations";
    if (type === "video" && selectedModelKey.includes("gemini"))
      return "minimax-video";
  }
  if (type === "video" && !hasReplicate && hasJson2Video) return "json2video";
  return type === "image" ? imageDefault : videoDefault;
}

function buildGeneratedVideosMarkdown(prompt, urls) {
  const lines = urls
    .map((url, i) => `${i + 1}. [Download Video ${i + 1}](${mdUrl(url)})`)
    .join("\n");
  return `Generated videos for: **${prompt}**\n\n${lines}`;
}

function buildMediaAttachments(type, urls) {
  return urls.map((url, i) => ({
    type,
    name: `${type === "generated-image" ? "image" : "video"}-${i + 1}`,
    url,
    downloadUrl: url,
    mimeType: type === "generated-image" ? "image/jpeg" : "video/mp4",
    size: 0,
  }));
}

function buildJson2VideoMovieFromPrompt(prompt = "") {
  const text = String(prompt || "").trim().slice(0, 500);
  const len = text.length;
  const fontSize =
    len > 160 ? "36px" : len > 100 ? "48px" : len > 60 ? "56px" : "64px";

  return {
    resolution: "full-hd",
    quality: "high",
    draft: false,
    scenes: [
      {
        "background-color": "#0b1020",
        duration: 6,
        elements: [
          {
            type: "text",
            text: text || "Video",
            settings: {
              "font-family": "Inter",
              "font-size": fontSize,
              "font-weight": "700",
              "font-color": "#FFFFFF",
              "text-align": "center",
            },
          },
        ],
      },
    ],
  };
}

async function runJson2VideoMovie({ movie, timeoutMs = 420000 }) {
  if (!JSON2VIDEO_API_KEY) {
    const err = new Error("JSON2VIDEO_API_KEY is not configured");
    err.status = 503;
    throw err;
  }

  let project = "";
  try {
    const create = await axios.post(`${JSON2VIDEO_API_BASE}/movies`, movie, {
      headers: {
        "x-api-key": JSON2VIDEO_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
    project = create.data?.project || create.data?.movie?.project || "";
  } catch (err) {
    const e = new Error(getDetailedErrorMessage(err));
    e.status = err?.response?.status || 500;
    e.provider = "json2video";
    throw e;
  }

  if (!project) throw new Error("JSON2Video did not return project id");

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const statusRes = await axios.get(`${JSON2VIDEO_API_BASE}/movies`, {
        headers: { "x-api-key": JSON2VIDEO_API_KEY },
        params: { project },
        timeout: 30000,
      });
      const movie = statusRes.data?.movie || {};
      if (movie.status === "done" && movie.url) return movie.url;
      if (movie.status === "error") {
        throw new Error(movie.message || "JSON2Video render failed");
      }
    } catch (err) {
      const e = new Error(getDetailedErrorMessage(err));
      e.status = err?.response?.status || 500;
      e.provider = "json2video";
      throw e;
    }
    await sleep(1500);
  }

  throw new Error("JSON2Video rendering timed out");
}

async function generateImageSet(prompt, selectedModel, count = 4) {
  const mediaModel = selectedModel || DEFAULT_IMAGE_MODEL;
  const normalized = normalizeMediaPrompt(prompt);

  if (mediaModel === "pollinations") {
    const out = buildGeneratedImagesMarkdown(normalized, count);
    return {
      ...out,
      attachments: buildMediaAttachments("generated-image", out.urls),
      mediaModel: "pollinations",
    };
  }

  if (mediaModel === "flux-schnell") {
    // Fallback to pollinations if no Replicate API token
    if (!process.env.REPLICATE_API_TOKEN) {
      const out = buildGeneratedImagesMarkdown(normalized, count);
      return {
        ...out,
        attachments: buildMediaAttachments("generated-image", out.urls),
        mediaModel: "pollinations",
      };
    }
    const model =
      process.env.REPLICATE_IMAGE_MODEL || "black-forest-labs/flux-schnell";
    const enhancedPrompt = `${normalized}, photorealistic, natural lighting, true-to-life colors, ultra detailed, sharp focus, DSLR, 35mm`;
    const input = { prompt: enhancedPrompt };

    let urls = [];
    let lastErr = null;
    try {
      urls = await runReplicatePrediction({ model, input, timeoutMs: 180000 });
    } catch (err) {
      lastErr = err;
      if (isReplicateRateLimitError(err)) {
        await sleep(12000);
        try {
          urls = await runReplicatePrediction({
            model,
            input,
            timeoutMs: 180000,
          });
          lastErr = null;
        } catch (retryErr) {
          lastErr = retryErr;
        }
      }
    }

    urls = (urls || []).slice(0, Math.max(1, count));

    if (urls.length === 0 && lastErr && isReplicateValidationError(lastErr)) {
      throw new Error(
        `Replicate validation failed: ${getDetailedErrorMessage(lastErr)}`,
      );
    }
    if (urls.length === 0 && lastErr && isReplicateRateLimitError(lastErr)) {
      const e = new Error(
        `Replicate rate limit reached. Please wait ~30-60 seconds and try again. Details: ${getDetailedErrorMessage(lastErr)}`,
      );
      e.status = 429;
      throw e;
    }
    if (urls.length === 0)
      throw new Error(
        lastErr
          ? getDetailedErrorMessage(lastErr)
          : "Image generation returned no files",
      );
    const markdown = `Generated ${urls.length} image(s) for: **${normalized}**`;
    return {
      markdown,
      urls,
      attachments: buildMediaAttachments("generated-image", urls),
      mediaModel,
    };
  }

  throw new Error(`Unknown image model: ${mediaModel}`);
}

async function generateVideoSet(prompt, selectedModel, count = 1) {
  let mediaModel = selectedModel || DEFAULT_VIDEO_MODEL;
  const normalized = normalizeMediaPrompt(prompt);

  if (mediaModel === "minimax-video") {
    if (!process.env.REPLICATE_API_TOKEN) {
      if (JSON2VIDEO_API_KEY) mediaModel = "json2video";
      else {
        const err = new Error(
          "Video generation requires REPLICATE_API_TOKEN and REPLICATE_VIDEO_MODEL",
        );
        err.status = 503;
        throw err;
      }
    }
  }

  if (mediaModel === "json2video") {
    const urls = [];
    for (let i = 0; i < count; i++) {
      const movie = buildJson2VideoMovieFromPrompt(normalized);
      const url = await runJson2VideoMovie({
        movie,
        timeoutMs: 420000,
      });
      urls.push(url);
    }
    if (urls.length === 0)
      throw new Error("Video generation returned no files");
    return {
      markdown: buildGeneratedVideosMarkdown(normalized, urls),
      urls,
      attachments: buildMediaAttachments("generated-video", urls),
      mediaModel,
    };
  }

  if (mediaModel === "minimax-video") {
    const model = process.env.REPLICATE_VIDEO_MODEL || "minimax/video-01";
    const urls = [];
    for (let i = 0; i < count; i++) {
      try {
        const out = await runReplicatePrediction({
          model,
          input: {
            prompt: normalized,
            quality: "high",
            aspect_ratio: "16:9",
            duration: 5,
          },
          timeoutMs: 420000,
        });
        urls.push(...out);
      } catch (err) {
        if (err?.status === 401 && JSON2VIDEO_API_KEY) {
          return generateVideoSet(prompt, "json2video", count);
        }
        throw err;
      }
    }
    if (urls.length === 0)
      throw new Error("Video generation returned no files");
    return {
      markdown: buildGeneratedVideosMarkdown(normalized, urls),
      urls,
      attachments: buildMediaAttachments("generated-video", urls),
      mediaModel,
    };
  }

  throw new Error(`Unknown video model: ${mediaModel}`);
}

function buildGeneratedImagesMarkdown(prompt, count = 4) {
  const enhancedPrompt = `${prompt}, photorealistic, natural lighting, true-to-life colors, ultra detailed, sharp focus, DSLR, 35mm`;
  const safePrompt = encodeURIComponent(enhancedPrompt);
  // Pollinations seed must fit signed 32-bit int (<= 2147483647)
  const seedBase = Math.floor(Date.now() / 1000);

  // Use Pollinations API with the configured URL and API key
  const pollinationsKey = (process.env.POLLINATIONS_API_KEY || "").trim();
  const pollinationsBase = resolvePollinationsImageBase();
  const pollinationsModel = getPollinationsImageModel();

  const urls = Array.from({ length: count }).map((_, i) => {
    const params = new URLSearchParams({
      width: "1024",
      height: "1024",
      seed: String(seedBase + i),
      nologo: "true",
      enhance: "true",
      model: pollinationsModel,
    });
    if (pollinationsKey) params.set("key", pollinationsKey);
    return `${pollinationsBase}/${safePrompt}?${params.toString()}`;
  });

  const markdown = `Generated ${urls.length} image(s) for: **${prompt}**`;

  return { markdown, urls };
}

export default withAuth(async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;
  const modelKeyProvided =
    typeof req.body?.modelKey === "string" && req.body.modelKey.trim() !== "";
  const bodyResult = chatPayloadSchema.safeParse(req.body || {});
  if (!bodyResult.success) {
    const firstIssue = bodyResult.error?.issues?.[0];
    let message = "Invalid request payload.";
    if (firstIssue?.path?.[0] === "attachments") {
      if (
        firstIssue.code === "too_big" &&
        firstIssue.maximum === MAX_ATTACHMENTS
      ) {
        message = `Too many attachments (max ${MAX_ATTACHMENTS}).`;
      } else if (String(firstIssue.path?.[1] || "") === "url") {
        message = "Attachment data is too large.";
      } else if (String(firstIssue.path?.[1] || "") === "name") {
        message = "Attachment name is too long.";
      } else if (String(firstIssue.path?.[1] || "") === "size") {
        message = "Attachment is too large.";
      }
    }
    console.warn("chat.invalid_input", firstIssue);
    await logSecurityEvent(req, {
      eventType: "chat.invalid_input",
      status: "warn",
      userId: req.user?.userId,
      email: req.user?.email,
      metadata: { issue: firstIssue?.code, path: firstIssue?.path },
    });
    return res.status(400).json({ message });
  }

  const {
    message,
    conversationId,
    language,
    modelKey,
    attachments,
    autoOptimize,
    stream,
    taskType,
  } = bodyResult.data;

  const normalizedAttachments = normalizeAttachments(attachments);
  if (!normalizedAttachments.ok) {
    return res.status(400).json({ message: normalizedAttachments.error });
  }

  const rate = await enforceRouteRateLimit(req, res, {
    route: "chat",
    email: req.user?.email,
    ipLimit: 30,
    ipWindowSec: 60,
    emailLimit: 50,
    emailWindowSec: 60,
  });

  if (!rate.ok) {
    await logSecurityEvent(req, {
      eventType: "chat.rate_limited",
      status: "warn",
      userId: req.user?.userId,
      email: req.user?.email,
    });
    return res.status(429).json({ message: rate.message });
  }

  const cleanedAttachments = normalizedAttachments.attachments;

  const normalizedTaskType = [
    "normal",
    "image",
    "video",
    "web",
    "deep",
    "think",
    "expert",
  ].includes(taskType)
    ? taskType
    : "normal";
  const expertMode = normalizedTaskType === "expert";
  let parsed = parseCommand(
    message,
    normalizedTaskType === "normal" ? "normal" : normalizedTaskType,
  );
  const freshnessQuery = isFreshnessQuery(parsed.prompt || message);
  if (parsed.mode === "normal" && freshnessQuery) {
    parsed = {
      ...parsed,
      mode: "deep",
    };
  }
  const projectMode = isProjectBuildRequest(parsed.prompt || message);
  const wantsStream = Boolean(stream) && !projectMode;
  if (!parsed.prompt && cleanedAttachments.length === 0) {
    return res.status(400).json({ message: "Message is empty" });
  }

  const msgAttachments = cleanedAttachments.map((a) => ({
    type: a.type,
    name: a.name || "",
    url: a.url || "",
    mimeType: a.mimeType || "",
    size: a.size || 0,
  }));

  let safeConversationId = "";
  if (conversationId) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id." });
    }
    safeConversationId = conversationId;
  }

  if (!isSupportedTriCodeLanguage(parsed.prompt || message)) {
    const reply = unsupportedLanguageMessage(language);
    if (stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      sseWrite(res, "start", {
        conversationId: safeConversationId || null,
        model: "system/tricode-language-guard",
        modelKey: "system/tricode-language-guard",
      });
      sseWrite(res, "delta", { text: reply });
      sseWrite(res, "done", {
        reply,
        conversationId: safeConversationId || null,
        model: "system/tricode-language-guard",
        modelKey: "system/tricode-language-guard",
        fallbackUsed: false,
      });
      res.end();
      return;
    }
    return res.status(200).json({
      reply,
      conversationId: safeConversationId || null,
      model: "system/tricode-language-guard",
      modelKey: "system/tricode-language-guard",
      fallbackUsed: false,
    });
  }

  const userId = req.user.userId;
  let abortController = null;
  let usageReserved = false;

  try {
    await connectDB();

    const dbUser = await User.findById(userId);
    if (!dbUser) return res.status(404).json({ message: "User not found" });
    const systemConfig = await getSystemConfig();

    await resetDailyUsageIfNeeded(dbUser, startOfToday());

    if (
      modelKeyProvided &&
      (!MODELS[modelKey] || systemConfig.availableModels?.[modelKey] === false)
    ) {
      return res
        .status(400)
        .json({ message: "Selected model is not available." });
    }

    if (!systemConfig.features?.chat && parsed.mode === "normal") {
      return res
        .status(403)
        .json({ message: "Chat is currently disabled by admin." });
    }
    if (
      (parsed.mode === "web" || parsed.mode === "deep") &&
      !systemConfig.features?.webSearch
    ) {
      console.warn(
        "webSearch disabled in system config; proceeding with search anyway",
      );
    }
    if (parsed.mode === "image" && !systemConfig.features?.imageGeneration) {
      return res
        .status(403)
        .json({ message: "Image generation is disabled by admin." });
    }
    if (parsed.mode === "video" && !systemConfig.features?.videoGeneration) {
      return res
        .status(403)
        .json({ message: "Video generation is disabled by admin." });
    }
    if (
      parsed.mode !== "image" &&
      parsed.mode !== "video" &&
      !OPENROUTER_API_KEY
    ) {
      await logSecurityEvent(req, {
        eventType: "chat.provider_missing",
        status: "warn",
        userId,
        email: req.user?.email,
      });
      return res.status(503).json({
        message: "AI provider is not configured. Set OPENROUTER_API_KEY.",
      });
    }

    let conv;
    if (safeConversationId)
      conv = await Conversation.findOne({ _id: safeConversationId, userId });
    if (!conv) {
      conv = await Conversation.create({
        userId,
        title: (
          parsed.prompt ||
          message ||
          attachmentOnlyMessage(language)
        ).slice(0, 50),
        language,
        model: modelKey,
        messages: [],
      });
    }

    const history = conv.messages
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
    const systemPrompt = SYSTEM_PROMPTS[language] || SYSTEM_PROMPTS.fa;

    abortController = new AbortController();
    const handleClose = () => abortController.abort();
    if (wantsStream) {
      req.on("close", handleClose);
      res.on("close", handleClose);
    }

    // /image and /video commands: use media generation providers.
    if (parsed.mode === "image" || parsed.mode === "video") {
      if (!parsed.prompt) {
        return res
          .status(400)
          .json({ message: `Use /${parsed.mode} <prompt>` });
      }

      usageReserved = await reserveUsage(dbUser);
      if (!usageReserved) {
        return res
          .status(429)
          .json({ message: "Usage limit reached. Please try again later." });
      }

      const selectedMediaModel = buildMediaModelFromSelection(
        modelKey,
        parsed.model,
        autoOptimize,
        parsed.mode,
        systemConfig,
      );

      const mediaResult =
        parsed.mode === "image"
          ? await generateImageSet(parsed.prompt, selectedMediaModel, 1)
          : await generateVideoSet(parsed.prompt, selectedMediaModel, 1);

      const markdown = mediaResult.markdown;
      let mediaAttachments = mediaResult.attachments || [];
      if (parsed.mode === "image") {
        mediaAttachments = await storeGeneratedImages(mediaAttachments);
      }
      const modelLabel = `media/${parsed.mode}/${mediaResult.mediaModel || selectedMediaModel}`;

      conv.messages.push({ role: "user", content: message, attachments: [] });
      conv.messages.push({
        role: "assistant",
        content: markdown,
        model: modelLabel,
        attachments: mediaAttachments,
      });
      if (conv.messages.length > MAX_CONVERSATION_MESSAGES) {
        conv.messages = conv.messages.slice(-MAX_CONVERSATION_MESSAGES);
      }
      conv.model = modelLabel;
      conv.updatedAt = new Date();
      if (conv.messages.length === 2) conv.title = parsed.prompt.slice(0, 60);
      await conv.save();

      await UsageLog.create({
        userId,
        type: parsed.mode,
        modelKey: modelLabel,
        modelId: modelLabel,
        status: "ok",
        promptPreview: parsed.prompt.slice(0, 120),
      });

      if (wantsStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        sseWrite(res, "start", {
          conversationId: conv._id.toString(),
          model: modelLabel,
          modelKey: modelLabel,
        });
        sseWrite(res, "delta", { text: markdown });
        sseWrite(res, "done", {
          reply: markdown,
          attachments: mediaAttachments,
          conversationId: conv._id.toString(),
          model: modelLabel,
          modelKey: modelLabel,
          fallbackUsed: false,
          autoOptimized: Boolean(autoOptimize && !parsed.model),
        });
        res.end();
        return;
      }

      return res.status(200).json({
        reply: markdown,
        attachments: mediaAttachments,
        conversationId: conv._id.toString(),
        model: modelLabel,
        modelKey: modelLabel,
        fallbackUsed: false,
        autoOptimized: Boolean(autoOptimize && !parsed.model),
      });
    }

    let searchContext = "";
    let searchResultsForUI = [];
    const shouldSearch = parsed.mode === "web" || parsed.mode === "deep";
    if (shouldSearch) {
      const searchQuery = (parsed.prompt || message || "").trim();
      const effectiveQuery = normalizeSearchQuery(searchQuery);
      const deepSearch = parsed.mode === "deep";
      if (searchQuery) {
        const seen = new Set();
        if (isNextJsVersionQuery(searchQuery)) {
          try {
            const npm = await fetchNpmLatestVersion("next");
            if (npm?.latest) {
              appendSearchResults(
                searchResultsForUI,
                [buildNpmVersionResult("next", npm.latest)],
                seen,
              );
            }
          } catch (err) {
            console.warn("npm version lookup failed:", err?.message || err);
          }
        }
        if (TAVILY_SEARCH_API_KEY) {
          try {
            const tavilyResults = await tavilySearch(effectiveQuery, deepSearch);
            appendSearchResults(searchResultsForUI, tavilyResults, seen);
          } catch (err) {
            console.warn("tavily search failed:", err?.message || err);
          }
        }
        if (searchResultsForUI.length === 0) {
          try {
            const braveResults = await braveApiSearch(effectiveQuery, deepSearch);
            appendSearchResults(searchResultsForUI, braveResults, seen);
          } catch (err) {
            console.warn("brave api search failed:", err?.message || err);
          }
        }
        if (searchResultsForUI.length === 0) {
          const duckResults = await duckSearch(effectiveQuery, deepSearch);
          appendSearchResults(searchResultsForUI, duckResults, seen);
        }
        searchContext = buildSearchContext(effectiveQuery, searchResultsForUI);
      }
    }

    if (shouldSearch && searchResultsForUI.length === 0) {
      const reply = searchUnavailableMessage(language);
      const userContentForDb =
        String(message || "").trim() ||
        String(parsed.prompt || "").trim() ||
        attachmentOnlyMessage(language);

      conv.messages.push({
        role: "user",
        content: userContentForDb,
        attachments: msgAttachments,
      });
      conv.messages.push({
        role: "assistant",
        content: reply,
        model: "system/web-search",
      });
      if (conv.messages.length > MAX_CONVERSATION_MESSAGES) {
        conv.messages = conv.messages.slice(-MAX_CONVERSATION_MESSAGES);
      }
      conv.updatedAt = new Date();
      await conv.save();

      return res.status(200).json({
        reply,
        conversationId: conv._id.toString(),
        model: "system/web-search",
        modelKey: "system/web-search",
        fallbackUsed: false,
      });
    }

    const needsVision = cleanedAttachments.some((a) => a?.type === "image");
    const intelligentTaskKey = getTaskOptimizedModel(
      parsed.mode,
      modelKey,
      autoOptimize,
      systemConfig,
    );
    const optimizedKey = autoOptimize
      ? detectTaskModel(
          parsed.prompt || message,
          cleanedAttachments,
          projectMode,
          expertMode,
        )
      : null;
    const chosenModelKey = optimizedKey || intelligentTaskKey || modelKey;
    let modelTryOrder = buildModelTryOrder(chosenModelKey, needsVision).filter(
      (k) => systemConfig.availableModels?.[k] !== false,
    );
    if (needsVision && !modelTryOrder.some((k) => isVisionModel(MODELS[k]))) {
      const visionCandidates = getVisionCandidates(systemConfig);
      if (visionCandidates.length > 0) {
        modelTryOrder = [...visionCandidates, ...modelTryOrder].filter(
          (k, idx, arr) => arr.indexOf(k) === idx,
        );
      }
    }
    if (needsVision && !modelTryOrder.some((k) => isVisionModel(MODELS[k]))) {
      return res
        .status(503)
        .json({ message: visionUnavailableMessage(language) });
    }
    if (modelTryOrder.length === 0) {
      return res
        .status(503)
        .json({ message: "No AI models are currently enabled by admin." });
    }

    usageReserved = await reserveUsage(dbUser);
    if (!usageReserved) {
      return res
        .status(429)
        .json({ message: "Usage limit reached. Please try again later." });
    }

    const requestedModelKey = modelTryOrder[0];
    let usedModelKey = requestedModelKey;
    let usedModelInfo = MODELS[requestedModelKey];

    const callOptions =
      parsed.mode === "think"
        ? { temperature: 0.2, maxTokens: 6000 }
        : projectMode
          ? {
              temperature: expertMode ? 0.35 : 0.4,
              maxTokens: expertMode ? 8000 : 8000,
            }
          : expertMode
            ? { temperature: 0.25, maxTokens: 6000 }
            : { temperature: 0.7, maxTokens: 3000 };

    let lastErr;
    let reply = "";

    if (wantsStream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
    }

    for (const key of modelTryOrder) {
      reply = "";
      let streamedAny = false;
      try {
        if (systemConfig.availableModels?.[key] === false) continue;
        usedModelKey = key;
        usedModelInfo = MODELS[key];

        const messagesForAI = await buildMessagesForModel({
          systemPrompt,
          history,
          message: parsed.prompt || "Please analyze attached files and answer.",
          attachments: cleanedAttachments,
          modelInfo: usedModelInfo,
          searchContext,
          thinkMode: parsed.mode === "think",
          uiLang: language,
          projectMode,
          expertMode,
        });

        if (wantsStream) {
          sseWrite(res, "start", {
            conversationId: conv._id.toString(),
            model: usedModelInfo.id,
            modelKey: usedModelKey,
          });
          await callOpenRouterStream(
            usedModelInfo.id,
            messagesForAI,
            { ...callOptions, signal: abortController.signal },
            (chunk) => {
              if (!chunk) return;
              streamedAny = true;
              reply += chunk;
              sseWrite(res, "delta", { text: chunk });
            },
          );
        } else {
          const response = await callOpenRouter(
            usedModelInfo.id,
            messagesForAI,
            callOptions,
          );
          reply = response.data?.choices?.[0]?.message?.content?.trim() || "";
        }

        if (!reply) {
          const emptyErr = new Error("Empty model response");
          emptyErr.code = "EMPTY_MODEL_RESPONSE";
          throw emptyErr;
        }

        break;
      } catch (err) {
        lastErr = err;
        if (wantsStream && streamedAny) {
          throw err;
        }
        if (isRetryableModelError(err)) continue;
        throw err;
      }
    }

    if (!reply) throw lastErr || new Error("No model response");
    reply = stripCutoffDisclaimers(
      reply,
      Boolean(searchContext || freshnessQuery),
    );
    reply = postProcessReply({
      reply,
      uiLang: language,
      prompt: parsed.prompt || message,
      results: searchResultsForUI,
    });

    const codeBlockCount = (reply.match(/```/g) || []).length / 2;
    const shouldAutoPackage = Boolean(projectMode && codeBlockCount >= 2);
    if (
      !shouldAutoPackage &&
      codeBlockCount >= 2 &&
      !/package|zip/i.test(reply)
    ) {
      const suffix =
        "\n\nDo you want me to package all generated code into a ZIP file so it is ready to run?";
      reply += suffix;
      if (wantsStream) sseWrite(res, "delta", { text: suffix });
    }

    if (projectMode) {
      let files = extractCodeFiles([{ role: "assistant", content: reply }]);
      files = normalizeProjectFiles(files);
      const zipBuffer = createZip(files);

      if (zipBuffer.length > PACKAGE_LIMITS.MAX_ZIP_BYTES) {
        return res
          .status(413)
          .json({ message: "Project ZIP is too large to generate." });
      }

      const userContentForDb =
        String(message || "").trim() ||
        String(parsed.prompt || "").trim() ||
        attachmentOnlyMessage(language);

      conv.messages.push({
        role: "user",
        content: userContentForDb,
        attachments: msgAttachments,
      });
      conv.messages.push({
        role: "assistant",
        content: reply,
        model: usedModelInfo.id,
      });
      if (conv.messages.length > MAX_CONVERSATION_MESSAGES) {
        conv.messages = conv.messages.slice(-MAX_CONVERSATION_MESSAGES);
      }
      conv.model = usedModelKey;
      conv.updatedAt = new Date();
      if (conv.messages.length === 2)
        conv.title = (parsed.prompt || message).slice(0, 60);
      await conv.save();

      try {
        await UsageLog.create({
          userId,
          type: "package",
          modelKey: usedModelKey,
          modelId: usedModelInfo.id,
          status: "ok",
          promptPreview: (parsed.prompt || message || "").slice(0, 120),
          meta: { fileCount: files.length, projectMode: true },
        });
      } catch {}

      return res.status(200).json({
        reply:
          language === "fa"
            ? "پروژه آماده شد. فایل ZIP را دانلود کنید و سپس `npm install` و `npm run dev` را اجرا کنید."
            : language === "ps"
              ? "پروژه چمتو ده. ZIP ډاونلوډ کړئ او بیا `npm install` او `npm run dev` وچلوئ."
              : "Project is ready. Download the ZIP and run `npm install` then `npm run dev`.",
        fullReply: reply,
        zipBase64: zipBuffer.toString("base64"),
        fileName: `project-${conv._id.toString()}.zip`,
        fileCount: files.length,
        conversationId: conv._id.toString(),
        model: usedModelInfo.id,
        modelKey: usedModelKey,
        fallbackUsed: usedModelKey !== requestedModelKey,
        autoOptimized: Boolean(optimizedKey),
      });
    }

    if (
      (parsed.mode === "web" || parsed.mode === "deep") &&
      searchResultsForUI.length > 0
    ) {
      const sources = `\n\nSources:\n${searchResultsForUI
        .slice(0, 8)
        .map((r, i) => `${i + 1}. ${r.url}`)
        .join("\n")}`;
      reply += sources;
      if (wantsStream) sseWrite(res, "delta", { text: sources });
    }

    const userContentForDb =
      String(message || "").trim() ||
      String(parsed.prompt || "").trim() ||
      attachmentOnlyMessage(language);

    conv.messages.push({
      role: "user",
      content: userContentForDb,
      attachments: msgAttachments,
    });
    conv.messages.push({
      role: "assistant",
      content: reply,
      model: usedModelInfo.id,
    });
    if (conv.messages.length > MAX_CONVERSATION_MESSAGES) {
      conv.messages = conv.messages.slice(-MAX_CONVERSATION_MESSAGES);
    }
    conv.model = usedModelKey;
    conv.updatedAt = new Date();
    if (conv.messages.length === 2)
      conv.title = (parsed.prompt || message).slice(0, 60);
    await conv.save();

    await UsageLog.create({
      userId,
      type: "chat",
      modelKey: usedModelKey,
      modelId: usedModelInfo.id,
      status: "ok",
      promptPreview: (
        parsed.prompt ||
        message ||
        attachmentOnlyMessage(language)
      ).slice(0, 120),
    });

    if (wantsStream) {
      sseWrite(res, "done", {
        reply,
        conversationId: conv._id.toString(),
        model: usedModelInfo.id,
        modelKey: usedModelKey,
        fallbackUsed: usedModelKey !== requestedModelKey,
        autoOptimized: Boolean(optimizedKey),
        autoPackage: shouldAutoPackage,
      });
      res.end();
      return;
    }

    return res.status(200).json({
      reply,
      conversationId: conv._id.toString(),
      model: usedModelInfo.id,
      modelKey: usedModelKey,
      fallbackUsed: usedModelKey !== requestedModelKey,
      autoOptimized: Boolean(optimizedKey),
      autoPackage: shouldAutoPackage,
    });
  } catch (err) {
    if (abortController?.signal?.aborted) {
      return;
    }

    if (usageReserved) {
      try {
        await rollbackUsage(dbUser);
      } catch {}
    }

    const status = err?.status || err?.response?.status || 500;
    const messageText = getErrorMessage(err);

    console.error("Chat error:", status, messageText);
    try {
      await UsageLog.create({
        userId,
        type:
          parsed.mode === "image"
            ? "image"
            : parsed.mode === "video"
              ? "video"
              : "chat",
        modelKey: modelKey || "",
        status: "error",
        promptPreview: (parsed.prompt || message || "").slice(0, 120),
        meta: { error: messageText, status },
      });
    } catch {}

    if (wantsStream && res.headersSent) {
      sseWrite(res, "error", { message: messageText, status });
      res.end();
      return;
    }

    if (status === 401) {
      if (parsed.mode === "image" || parsed.mode === "video") {
        const hint =
          err?.provider === "json2video"
            ? "JSON2VIDEO_API_KEY"
            : "JSON2VIDEO_API_KEY or REPLICATE_API_TOKEN";
        return res.status(502).json({
          message: `Media provider authentication failed. Check ${hint}.`,
        });
      }
      return res.status(502).json({
        message: "AI provider authentication failed. Check OPENROUTER_API_KEY.",
      });
    }
    if (status === 429)
      return res
        .status(429)
        .json({ message: "Rate limit exceeded. Please wait and retry." });

    if (isNoEndpointError(err)) {
      return res.status(503).json({
        message:
          "Selected model is currently unavailable. Please choose another model.",
      });
    }

    return res
      .status(500)
      .json({ message: "AI request failed: " + messageText });
  }
});
