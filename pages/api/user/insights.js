import mongoose from "mongoose";
import { connectDB } from "../../../lib/mongodb";
import Conversation from "../../../models/Conversation";
import { withAuth } from "../../../lib/auth";
import { enforceRouteRateLimit } from "../../../lib/rateLimit";
import { logSecurityEvent } from "../../../lib/security-log";

const MAX_CONVERSATIONS = Math.max(
  5,
  Number(process.env.MAX_INSIGHTS_CONVS || 20),
);
const MAX_MESSAGES = Math.max(
  20,
  Number(process.env.MAX_INSIGHTS_MESSAGES || 120),
);
const MAX_TEXT_CHARS = Math.max(
  2000,
  Number(process.env.MAX_INSIGHTS_CHARS || 12000),
);
const MAX_MESSAGES_PER_CONV = Math.max(
  10,
  Number(process.env.MAX_INSIGHTS_MESSAGES_PER_CONV || 40),
);

const TOPIC_RULES = [
  {
    id: "mobile",
    keywords: [
      "react native",
      "flutter",
      "android",
      "ios",
      "kotlin",
      "swift",
      "mobile",
    ],
  },
  {
    id: "web",
    keywords: [
      "next.js",
      "react",
      "frontend",
      "css",
      "javascript",
      "typescript",
      "web",
    ],
  },
  {
    id: "backend",
    keywords: ["node", "api", "express", "mongodb", "sql", "backend", "server"],
  },
  {
    id: "ai",
    keywords: ["llm", "prompt", "ai", "openai", "model", "rag", "agent"],
  },
  {
    id: "devops",
    keywords: ["docker", "kubernetes", "ci/cd", "aws", "deploy", "devops"],
  },
];

const SUGGESTIONS = {
  fa: {
    backend: [
      "\u0631\u0648\u06cc \u0628\u06a9\u200c\u0627\u0646\u062f \u062a\u0645\u0631\u06a9\u0632 \u062f\u0627\u0631\u06cc. \u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u06cc \u062a\u0627\u0632\u0647\u200c\u0647\u0627\u06cc Node.js\u060c API\u0647\u0627 \u0648 \u062f\u06cc\u062a\u0627\u0628\u06cc\u0633 \u0631\u0627 \u0628\u0628\u06cc\u0646\u06cc\u061f",
      "\u0628\u0647 \u0646\u0638\u0631 \u0645\u06cc\u200c\u0631\u0633\u062f \u0628\u06cc\u0634\u062a\u0631 \u0628\u06a9\u200c\u0627\u0646\u062f \u0645\u06cc\u200c\u067e\u0631\u0633\u06cc. \u062e\u0644\u0627\u0635\u0647\u200c\u0627\u06cc \u0627\u0632 \u0628\u0647\u062a\u0631\u06cc\u0646 \u0631\u0648\u0634\u200c\u0647\u0627\u06cc API \u0648 \u062f\u06cc\u062a\u0627\u0628\u06cc\u0633 \u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u06cc\u061f",
    ],
    web: [
      "\u0627\u063a\u0644\u0628 \u0648\u0628 \u0645\u06cc\u200c\u067e\u0631\u0633\u06cc. \u0622\u067e\u062f\u06cc\u062a\u200c\u0647\u0627\u06cc Next.js \u0648 React \u0631\u0627 \u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u06cc\u061f",
      "\u0628\u0647 \u0648\u0628 \u0639\u0644\u0627\u0642\u0647 \u062f\u0627\u0631\u06cc. \u0646\u06a9\u0627\u062a \u062c\u062f\u06cc\u062f \u0641\u0631\u0627\u0646\u062a\u200c\u0627\u0646\u062f \u0648 CSS \u0631\u0627 \u0646\u0634\u0627\u0646 \u0628\u062f\u0647\u0645\u061f",
    ],
    ai: [
      "\u062f\u0631 \u062d\u0627\u0644 \u06a9\u0627\u0631 \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06cc \u0647\u0633\u062a\u06cc. \u062a\u0627\u0632\u0647\u200c\u0647\u0627\u06cc \u0645\u062f\u0644\u200c\u0647\u0627 \u0648 \u067e\u0631\u0627\u0645\u067e\u062a\u200c\u0646\u0648\u06cc\u0633\u06cc \u0631\u0627 \u0628\u0628\u06cc\u0646\u06cc\u061f",
      "\u0628\u0647 AI \u0639\u0644\u0627\u0642\u0647 \u062f\u0627\u0631\u06cc. \u067e\u06cc\u0634\u0646\u0647\u0627\u062f\u0647\u0627\u06cc \u062c\u062f\u06cc\u062f \u062f\u0631\u0628\u0627\u0631\u0647 RAG \u0648 \u0627\u06cc\u062c\u0646\u062a\u200c\u0647\u0627 \u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u06cc\u061f",
    ],
    mobile: [
      "\u0631\u0648\u06cc \u0645\u0648\u0628\u0627\u06cc\u0644 \u06a9\u0627\u0631 \u0645\u06cc\u200c\u06a9\u0646\u06cc. \u062e\u0628\u0631\u0647\u0627\u06cc React Native \u0648 Flutter \u0631\u0627 \u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u06cc\u061f",
      "\u0639\u0644\u0627\u0642\u0647\u200c\u0627\u062a \u0628\u0647 \u0645\u0648\u0628\u0627\u06cc\u0644 \u0645\u0634\u062e\u0635 \u0627\u0633\u062a. \u0646\u06a9\u0627\u062a \u062c\u062f\u06cc\u062f iOS \u0648 Android \u0631\u0627 \u0646\u0634\u0627\u0646 \u0628\u062f\u0647\u0645\u061f",
    ],
    devops: [
      "\u0628\u0647 \u062f\u06cc\u067e\u0644\u0648\u06cc \u0648 DevOps \u0645\u06cc\u200c\u067e\u0631\u062f\u0627\u0632\u06cc. \u062a\u0627\u0632\u0647\u200c\u0647\u0627\u06cc Docker \u0648 CI/CD \u0631\u0627 \u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u06cc\u061f",
      "\u0645\u0648\u0636\u0648\u0639\u0627\u062a \u0632\u06cc\u0631\u0633\u0627\u062e\u062a\u06cc \u0645\u06cc\u200c\u067e\u0631\u0633\u06cc. \u062e\u0628\u0631\u0647\u0627\u06cc Cloud \u0648 Kubernetes \u0631\u0627 \u0628\u0628\u06cc\u0646\u06cc\u061f",
    ],
    fallback: [
      "\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u06cc \u062a\u0627\u0632\u0647\u200c\u062a\u0631\u06cc\u0646 \u0646\u06a9\u0627\u062a \u0645\u0631\u062a\u0628\u0637 \u0628\u0627 \u0639\u0644\u0627\u06cc\u0642\u062a \u0631\u0627 \u0628\u0628\u06cc\u0646\u06cc\u061f",
    ],
  },
  ps: {
    backend: [
      "\u062a\u0647 \u0627\u06a9\u062b\u0631 \u062f backend \u067e\u0648\u069a\u062a\u0646\u06d0 \u06a9\u0648\u06d0. \u062f Node.js\u060c API \u0627\u0648 database \u0646\u0648\u064a \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u063a\u0648\u0627\u0693\u06d0\u061f",
      "backend \u062a\u0647 \u0689\u06d0\u0631\u0647 \u0639\u0644\u0627\u0642\u0647 \u0644\u0631\u06d0. \u062f API \u0627\u0648 database \u063a\u0648\u0631\u0647 \u0637\u0631\u06cc\u0642\u06d0 \u062f\u0631 \u0648\u069a\u06cc\u0645\u061f",
    ],
    web: [
      "\u062a\u0647 \u062f web \u067e\u0647 \u0627\u0693\u0647 \u0689\u06d0\u0631\u06d0 \u067e\u0648\u069a\u062a\u0646\u06d0 \u06a9\u0648\u06d0. \u062f Next.js \u0627\u0648 React \u062a\u0627\u0632\u0647 \u062e\u0628\u0631\u0648\u0646\u0647 \u063a\u0648\u0627\u0693\u06d0\u061f",
      "\u062f frontend \u0646\u0648\u06d0 \u0644\u0627\u0631\u06d0 \u062f\u0631 \u0648\u069a\u06cc\u0645\u061f",
    ],
    ai: [
      "\u062a\u0647 \u062f AI \u067e\u0647 \u0627\u0693\u0647 \u06a9\u0627\u0631 \u06a9\u0648\u06d0. \u062f \u0645\u0627\u0689\u0644\u0648\u0646\u0648 \u0627\u0648 prompt \u0646\u0648\u064a \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u063a\u0648\u0627\u0693\u06d0\u061f",
      "\u062f RAG \u0627\u0648 agent \u067e\u0647 \u0627\u0693\u0647 \u062a\u0627\u0632\u0647 \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u062f\u0631\u06a9\u0693\u0645\u061f",
    ],
    mobile: [
      "\u0645\u0648\u0628\u0627\u06cc\u0644 \u067e\u0631\u0627\u062e\u062a\u06cc\u0627 \u062a\u0647 \u0639\u0644\u0627\u0642\u0647 \u0644\u0631\u06d0. \u062f React Native \u0627\u0648 Flutter \u062a\u0627\u0632\u0647 \u062e\u0628\u0631\u0648\u0646\u0647 \u063a\u0648\u0627\u0693\u06d0\u061f",
      "\u062f iOS \u0627\u0648 Android \u0646\u0648\u064a \u0644\u0627\u0631\u069a\u0648\u0648\u0646\u06d0 \u062f\u0631 \u0648\u069a\u06cc\u0645\u061f",
    ],
    devops: [
      "\u062a\u0647 \u062f DevOps \u0627\u0648 deploy \u067e\u0647 \u0627\u0693\u0647 \u067e\u0648\u069a\u062a\u0646\u06d0 \u06a9\u0648\u06d0. \u062f Docker \u0627\u0648 CI/CD \u062a\u0627\u0632\u0647 \u062e\u0628\u0631\u0648\u0646\u0647 \u063a\u0648\u0627\u0693\u06d0\u061f",
      "\u062f Cloud \u0627\u0648 Kubernetes \u067e\u0647 \u0627\u0693\u0647 \u062a\u0627\u0632\u0647 \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u062f\u0631\u06a9\u0693\u0645\u061f",
    ],
    fallback: [
      "\u063a\u0648\u0627\u0693\u06d0 \u062f \u062e\u067e\u0644\u06d0 \u0639\u0644\u0627\u0642\u06d0 \u0627\u0693\u0648\u0646\u062f \u0646\u0648\u06d0 \u062e\u0628\u0631\u06d0 \u0648\u06ab\u0648\u0631\u06d0\u061f",
    ],
  },
  en: {
    backend: [
      "You ask backend topics often. Want updates on Node.js, APIs, and databases?",
      "Backend-focused lately. Want best practices for APIs and databases?",
    ],
    web: [
      "Lots of web questions. Want the latest on Next.js, React, and CSS?",
      "Frontend-focused. Want new tips for modern web tooling?",
    ],
    ai: [
      "Exploring AI. Want updates on models, RAG, and prompt engineering?",
      "AI interest detected. Want practical updates on agents and tools?",
    ],
    mobile: [
      "Working on mobile? Want updates on React Native and Flutter?",
      "Mobile dev focus. Want iOS and Android tips?",
    ],
    devops: [
      "DevOps topics come up a lot. Want updates on Docker and CI/CD?",
      "Infra-focused. Want cloud and Kubernetes updates?",
    ],
    fallback: ["Want updates on the technologies you use most?"],
  },
};

const TOPIC_LABELS = {
  fa: {
    backend: "بک‌اند",
    web: "وب",
    ai: "هوش مصنوعی",
    mobile: "موبایل",
    devops: "دیوآپز",
  },
  ps: {
    backend: "بک‌اند",
    web: "ویب",
    ai: "هوش مصنوعي",
    mobile: "موبایل",
    devops: "ډیواپس",
  },
  en: {
    backend: "backend",
    web: "web",
    ai: "AI",
    mobile: "mobile",
    devops: "devops",
  },
};

function pickSuggestion(topic, lang) {
  const locale = ["fa", "ps", "en"].includes(lang) ? lang : "en";
  const pool = SUGGESTIONS[locale]?.[topic] || SUGGESTIONS[locale]?.fallback;
  const options = Array.isArray(pool) && pool.length ? pool : SUGGESTIONS.en.fallback;
  return options[Math.floor(Math.random() * options.length)];
}

function topicLabel(topic, lang) {
  const locale = ["fa", "ps", "en"].includes(lang) ? lang : "en";
  return TOPIC_LABELS[locale]?.[topic] || TOPIC_LABELS.en[topic] || topic;
}

function buildUpdateQuery(topic, lang, year) {
  const label = topicLabel(topic, lang);
  if (lang === "fa") return `تازه‌ترین به‌روزرسانی‌های ${label} در ${year}`;
  if (lang === "ps") return `د ${year} لپاره د ${label} وروستي تازه معلومات`;
  return `latest ${year} ${label} development updates`;
}

function detectInterests(text) {
  const lower = (text || "").toLowerCase();
  const scored = TOPIC_RULES.map((t) => ({
    id: t.id,
    score: t.keywords.reduce(
      (sum, k) => sum + (keywordMatch(lower, k) ? 1 : 0),
      0,
    ),
  })).filter((t) => t.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((s) => s.id);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatch(text, keyword) {
  const normalized = String(keyword || "").trim().toLowerCase();
  if (!normalized) return false;
  if (/[^a-z0-9]/i.test(normalized)) {
    return text.includes(normalized);
  }
  return new RegExp(`\\b${escapeRegExp(normalized)}\\b`, "i").test(text);
}

function collectUserText(convs = []) {
  let text = "";
  let messageCount = 0;
  for (const conv of convs) {
    if (!conv?.messages?.length) continue;
    for (const msg of conv.messages) {
      if (messageCount >= MAX_MESSAGES) return text.trim();
      if (!msg || msg.role !== "user") continue;
      const content = String(msg.content || "").trim();
      if (!content) continue;
      const remaining = MAX_TEXT_CHARS - text.length;
      if (remaining <= 0) return text.trim();
      const chunk = content.slice(0, remaining);
      text = text ? `${text}\n${chunk}` : chunk;
      messageCount += 1;
    }
  }
  return text.trim();
}

export default withAuth(async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const rate = await enforceRouteRateLimit(req, res, {
    route: "user:insights",
    email: req.user?.email || req.user?.userId,
    ipLimit: 30,
    ipWindowSec: 60,
    emailLimit: 20,
    emailWindowSec: 300,
  });

  if (!rate.ok) {
    return res.status(429).json({ message: rate.message });
  }

  try {
    const userId = req.user?.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user session." });
    }

    await connectDB();

    const convs = await Conversation.find(
      { userId },
      { messages: { $slice: -MAX_MESSAGES_PER_CONV }, updatedAt: 1 },
    )
      .sort({ updatedAt: -1 })
      .limit(MAX_CONVERSATIONS)
      .lean();

    const text = collectUserText(convs);
    const interests = detectInterests(text);
    const primary = interests[0] || "web";
    const year = new Date().getFullYear();
    const lang = ["fa", "ps", "en"].includes(String(req.query?.lang || "")) ? String(req.query?.lang || "") : "en";
    const suggestion = pickSuggestion(primary, lang);
    const updateQuery = buildUpdateQuery(primary, lang, year);

    res.setHeader("Cache-Control", "private, no-store");

    await logSecurityEvent(req, {
      eventType: "user.insights.generated",
      status: "ok",
      userId,
      email: req.user?.email || "",
      metadata: { primary, interests },
    });

    return res.status(200).json({
      interests,
      primary,
      suggestion,
      updateQuery,
    });
  } catch (error) {
    console.error("user/insights error:", error);
    await logSecurityEvent(req, {
      eventType: "user.insights.error",
      status: "error",
      userId: req.user?.userId,
      email: req.user?.email || "",
      metadata: { message: String(error?.message || error || "") },
    });
    return res.status(500).json({ message: "Internal server error." });
  }
});
