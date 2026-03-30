import { connectDB } from "../../lib/mongodb";
import Chat from "../../models/Chat";
import { withAuth } from "../../lib/auth";
import { enforceRouteRateLimit } from "../../lib/rateLimit";
import mongoose from "mongoose";

const DEFAULT_LIMIT = Math.min(50, Math.max(10, Number(process.env.MAX_CHAT_LIST_LIMIT || 100)));
const MAX_LIMIT = Math.max(DEFAULT_LIMIT, Number(process.env.MAX_CHAT_LIST_LIMIT || 100));

function parseLimit(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(raw), MAX_LIMIT);
}

function parseCursor(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseOrder(value) {
  const v = String(value || "").toLowerCase();
  return v === "asc" ? "asc" : "desc";
}

export default withAuth(async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const rate = await enforceRouteRateLimit(req, res, {
    route: "chats:list",
    email: req.user?.email,
    ipLimit: 30,
    ipWindowSec: 60,
    emailLimit: 60,
    emailWindowSec: 60,
  });

  if (!rate.ok) {
    return res.status(429).json({ message: rate.message });
  }

  const userIdRaw = String(req.user?.userId || "");
  if (!mongoose.Types.ObjectId.isValid(userIdRaw)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const limit = parseLimit(req.query?.limit);
  const cursor = parseCursor(req.query?.cursor);
  const order = parseOrder(req.query?.order);

  if (req.query?.cursor && !cursor) {
    return res.status(400).json({ message: "Invalid cursor" });
  }

  try {
    await connectDB();

    const match = { userId: new mongoose.Types.ObjectId(userIdRaw) };
    if (cursor) {
      match.createdAt = order === "desc" ? { $lt: cursor } : { $gt: cursor };
    }

    const sort = { createdAt: order === "desc" ? -1 : 1 };

    const chats = await Chat.find(match)
      .select("userMessage aiReply createdAt")
      .sort(sort)
      .limit(limit)
      .lean();

    return res.status(200).json(chats);
  } catch (error) {
    console.error("chats:get error:", error);
    return res.status(500).json({ message: "Error fetching chats" });
  }
});
