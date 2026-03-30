import { connectDB } from "../../lib/mongodb";
import Conversation from "../../models/Conversation";
import { withAuth } from "../../lib/auth";
import { MODELS } from "../../lib/chatModels";
import { getSystemConfig } from "../../lib/system";
import { enforceRouteRateLimit } from "../../lib/rateLimit";
import { logSecurityEvent } from "../../lib/security-log";
import { requireCsrf } from "../../lib/csrf";
import mongoose from "mongoose";
import { z } from "zod";

const DEFAULT_MODEL_KEY = "deepseek-v3";
const DEFAULT_LANGUAGE = "fa";
const DEFAULT_TITLE = "گفتگوی جدید";

const MAX_LIST_LIMIT = Math.max(10, Number(process.env.MAX_CONVERSATION_LIST_LIMIT || 100));
const DEFAULT_LIST_LIMIT = Math.min(50, MAX_LIST_LIMIT);
const MAX_TITLE_LENGTH = Math.max(40, Number(process.env.MAX_CONVERSATION_TITLE_LENGTH || 80));
const MAX_CONVERSATIONS_PER_USER = Math.max(100, Number(process.env.MAX_CONVERSATIONS_PER_USER || 1000));
const DUP_WINDOW_MS = 60 * 1000;

// Afghan solar month names
const SHAMSI_MONTHS = [
  "حمل",
  "ثور",
  "جوزا",
  "سرطان",
  "اسد",
  "سنبله",
  "میزان",
  "عقرب",
  "قوس",
  "جدی",
  "دلو",
  "حوت",
];

const createSchema = z
  .object({
    title: z.string().trim().max(MAX_TITLE_LENGTH).optional(),
    language: z.enum(["fa", "ps", "en"]).optional(),
    model: z.string().trim().max(80).optional(),
  })
  .strip();

function toShamsi(date) {
  const g = new Date(date);
  if (Number.isNaN(g.getTime())) return null;

  const gy = g.getFullYear();
  const gm = g.getMonth() + 1;
  const gd = g.getDate();
  let jy = gy - 621;
  const jmDay = [0, 31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  let march = new Date(gy, 2, 21);
  let diff = Math.floor((g - march) / 86400000);
  if (diff < 0) {
    jy--;
    diff += 365;
  }
  let jm = 1;
  for (let i = 1; i <= 12; i++) {
    if (diff < jmDay[i]) {
      jm = i;
      break;
    }
    diff -= jmDay[i];
  }
  const jd = diff + 1;
  return { year: jy, month: jm, day: jd, monthName: SHAMSI_MONTHS[jm - 1] || "" };
}

function parseLimit(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.floor(raw), MAX_LIST_LIMIT);
}

function parseCursor(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function handleGet(req, res) {
  const rate = await enforceRouteRateLimit(req, res, {
    route: "conversations:list",
    email: req.user?.email,
    ipLimit: 30,
    ipWindowSec: 60,
    emailLimit: 60,
    emailWindowSec: 60,
  });
  if (!rate.ok) return res.status(429).json({ message: rate.message });

  const userIdRaw = String(req.user?.userId || "");
  if (!mongoose.Types.ObjectId.isValid(userIdRaw)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const limit = parseLimit(req.query?.limit);
  const cursor = parseCursor(req.query?.cursor);
  const match = { userId: new mongoose.Types.ObjectId(userIdRaw) };
  if (cursor) match.updatedAt = { $lt: cursor };

  try {
    await connectDB();

    const convs = await Conversation.aggregate([
      { $match: match },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
      {
        $project: {
          title: 1,
          model: 1,
          language: 1,
          createdAt: 1,
          updatedAt: 1,
          messageCount: { $size: { $ifNull: ["$messages", []] } },
          preview: {
            $let: {
              vars: {
                userMsgs: {
                  $filter: {
                    input: "$messages",
                    as: "m",
                    cond: { $eq: ["$$m.role", "user"] },
                  },
                },
              },
              in: {
                $substrCP: [
                  {
                    $ifNull: [
                      {
                        $arrayElemAt: [
                          {
                            $map: {
                              input: "$$userMsgs",
                              as: "u",
                              in: "$$u.content",
                            },
                          },
                          -1,
                        ],
                      },
                      DEFAULT_TITLE,
                    ],
                  },
                  0,
                  70,
                ],
              },
            },
          },
        },
      },
    ]);

    const result = convs.map((c) => {
      const sh = toShamsi(c.updatedAt);
      return {
        _id: c._id,
        title: c.title || DEFAULT_TITLE,
        model: c.model || DEFAULT_MODEL_KEY,
        language: c.language || DEFAULT_LANGUAGE,
        messageCount: Number(c.messageCount || 0),
        preview: c.preview || DEFAULT_TITLE,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        shamsiDate: sh ? `${sh.day} ${sh.monthName} ${sh.year}` : "",
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("conversations:get error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function handlePost(req, res) {
  if (!requireCsrf(req, res)) return;

  const rate = await enforceRouteRateLimit(req, res, {
    route: "conversations:create",
    email: req.user?.email,
    ipLimit: 12,
    ipWindowSec: 60,
    emailLimit: 10,
    emailWindowSec: 60,
  });
  if (!rate.ok) return res.status(429).json({ message: rate.message });

  const parsed = createSchema.safeParse(req.body || {});
  if (!parsed.success) {
    await logSecurityEvent(req, {
      eventType: "conversations.create.invalid_input",
      status: "warn",
      userId: req.user?.userId,
      email: req.user?.email,
    });
    return res.status(400).json({ message: "Invalid payload" });
  }

  const userIdRaw = String(req.user?.userId || "");
  if (!mongoose.Types.ObjectId.isValid(userIdRaw)) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const userId = new mongoose.Types.ObjectId(userIdRaw);

  try {
    await connectDB();

    const total = await Conversation.countDocuments({ userId });
    if (total >= MAX_CONVERSATIONS_PER_USER) {
      return res.status(429).json({ message: "Conversation limit reached." });
    }

    const systemConfig = await getSystemConfig();
    const title = parsed.data.title || DEFAULT_TITLE;
    const language = parsed.data.language || DEFAULT_LANGUAGE;

    let model = parsed.data.model || DEFAULT_MODEL_KEY;
    if (!MODELS[model] || systemConfig?.availableModels?.[model] === false) {
      model = DEFAULT_MODEL_KEY;
    }

    const cutoff = new Date(Date.now() - DUP_WINDOW_MS);
    const existing = await Conversation.findOne({
      userId,
      title,
      language,
      model,
      createdAt: { $gte: cutoff },
      $expr: { $eq: [{ $size: "$messages" }, 0] },
    })
      .select("title model language createdAt updatedAt")
      .lean();

    if (existing) {
      return res.status(200).json(existing);
    }

    const conv = await Conversation.create({
      userId,
      title,
      language,
      model,
      messages: [],
    });

    await logSecurityEvent(req, {
      eventType: "conversations.create",
      status: "ok",
      userId: req.user?.userId,
      email: req.user?.email,
      metadata: { conversationId: String(conv._id) },
    });

    return res.status(201).json(conv);
  } catch (error) {
    console.error("conversations:create error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function handleDelete(req, res) {
  if (!requireCsrf(req, res)) return;

  const rate = await enforceRouteRateLimit(req, res, {
    route: "conversations:delete",
    email: req.user?.email,
    ipLimit: 20,
    ipWindowSec: 60,
    emailLimit: 20,
    emailWindowSec: 60,
  });
  if (!rate.ok) return res.status(429).json({ message: rate.message });

  const id = String(req.query?.id || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid conversation id." });
  }

  const userIdRaw = String(req.user?.userId || "");
  if (!mongoose.Types.ObjectId.isValid(userIdRaw)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    await connectDB();

    const deleted = await Conversation.findOneAndDelete({
      _id: id,
      userId: new mongoose.Types.ObjectId(userIdRaw),
    });

    if (!deleted) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    await logSecurityEvent(req, {
      eventType: "conversations.delete",
      status: "ok",
      userId: req.user?.userId,
      email: req.user?.email,
      metadata: { conversationId: id },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("conversations:delete error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export default withAuth(async function handler(req, res) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  if (req.method === "DELETE") return handleDelete(req, res);
  return res.status(405).end();
});
