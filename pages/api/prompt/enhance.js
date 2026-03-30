import axios from "axios";
import { withAuth } from "../../../lib/auth";
import { MODELS } from "../../../lib/chatModels";
import { getSystemConfig } from "../../../lib/system";
import { enforceRouteRateLimit } from "../../../lib/rateLimit";
import { logSecurityEvent } from "../../../lib/security-log";

const OPENROUTER_API_KEY = String(process.env.OPENROUTER_API_KEY || "").trim();
const DEFAULT_PROMPT_MODEL_KEY = String(
  process.env.IMAGE_PROMPT_MODEL || "deepseek-v3",
).trim();
const MODEL_FALLBACK_KEYS = [
  "qwen-2.5-7b",
  "gemma-2-9b",
  "mistral-7b",
  "phi-3-mini",
];

function normalizeLang(value) {
  const lang = String(value || "").trim();
  return ["fa", "ps", "en"].includes(lang) ? lang : "en";
}

function pickPromptModel(systemConfig) {
  const keys = [DEFAULT_PROMPT_MODEL_KEY, ...MODEL_FALLBACK_KEYS];
  for (const key of keys) {
    if (!MODELS[key]) continue;
    if (systemConfig?.availableModels?.[key] === false) continue;
    return MODELS[key].id;
  }
  return null;
}

function buildFallbackSuggestions(prompt) {
  const base = String(prompt || "").trim();
  if (!base) return [];
  const normalized = base.replace(/\s+/g, " ");
  return [
    `${normalized}, photorealistic, natural lighting, true-to-life colors, ultra detailed, sharp focus`,
    `${normalized}, DSLR photo, 35mm lens, shallow depth of field, soft natural light, high detail`,
    `${normalized}, realistic textures, high dynamic range, professional composition, ultra detailed`,
  ];
}

function extractJsonArray(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

async function callOpenRouter(modelId, messages) {
  if (!OPENROUTER_API_KEY) {
    const err = new Error("OPENROUTER_API_KEY is missing");
    err.status = 503;
    throw err;
  }
  return axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: modelId,
      messages,
      temperature: 0.7,
      max_tokens: 400,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_URL || "http://localhost:3000",
        "X-Title": "TriCode AI",
      },
      timeout: 45000,
    },
  );
}

export default withAuth(
  async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).end();

    const rate = await enforceRouteRateLimit(req, res, {
      route: "prompt:enhance",
      email: req.user?.email || req.user?.userId,
      ipLimit: 20,
      ipWindowSec: 60,
      emailLimit: 20,
      emailWindowSec: 300,
    });
    if (!rate.ok) {
      return res.status(429).json({ message: rate.message });
    }

    const prompt = String(req.body?.prompt || "").trim();
    const lang = normalizeLang(req.body?.language);
    if (!prompt) return res.status(400).json({ message: "Prompt is required." });
    if (prompt.length > 400)
      return res.status(400).json({ message: "Prompt is too long." });

    try {
      const systemConfig = await getSystemConfig();
      const modelId = pickPromptModel(systemConfig);
      if (!modelId) {
        return res.status(503).json({
          message: "No AI models are currently enabled by admin.",
        });
      }

      const system =
        lang === "fa"
          ? "تو یک متخصص نوشتن پرامپت تصویر هستی. سه پرامپت بهتر برای تولید تصویر پیشنهاد بده. فقط یک آرایه JSON از رشته‌ها برگردان."
          : lang === "ps"
            ? "ته د تصوير پرامپټ ليکلو متخصص يې. درې غوره پرامپټونه وړانديز کړه. يوازې د 문자열ونو JSON ارایه ورکړه."
            : "You are an expert image prompt engineer. Suggest three improved prompts. Return only a JSON array of strings.";

      const messages = [
        { role: "system", content: system },
        { role: "user", content: `Base prompt: ${prompt}` },
      ];

      let suggestions = [];
      try {
        const response = await callOpenRouter(modelId, messages);
        const content =
          response.data?.choices?.[0]?.message?.content?.trim() || "";
        const json = extractJsonArray(content);
        if (json) {
          const parsed = JSON.parse(json);
          if (Array.isArray(parsed)) {
            suggestions = parsed
              .map((s) => String(s || "").trim())
              .filter(Boolean);
          }
        }
        if (!suggestions.length && content) {
          suggestions = content
            .split("\n")
            .map((line) => line.replace(/^[\-\d\.\)\s]+/, "").trim())
            .filter(Boolean);
        }
      } catch (error) {
        console.warn("prompt enhance failed:", error?.message || error);
      }

      if (!suggestions.length) {
        suggestions = buildFallbackSuggestions(prompt);
      }

      suggestions = Array.from(new Set(suggestions)).slice(0, 3);

      await logSecurityEvent(req, {
        eventType: "prompt.enhance",
        status: "ok",
        userId: req.user?.userId,
        email: req.user?.email || "",
        metadata: { modelId, count: suggestions.length },
      });

      return res.status(200).json({ suggestions });
    } catch (error) {
      console.error("prompt/enhance error:", error);
      await logSecurityEvent(req, {
        eventType: "prompt.enhance.error",
        status: "error",
        userId: req.user?.userId,
        email: req.user?.email || "",
        metadata: { message: String(error?.message || error || "") },
      });
      return res.status(500).json({ message: "Internal server error." });
    }
  },
  { requireCsrfForMutations: true },
);
