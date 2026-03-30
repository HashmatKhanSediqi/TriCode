import { connectDB } from "../../../lib/mongodb";
import Conversation from "../../../models/Conversation";
import { withAuth } from "../../../lib/auth";
import { enforceRouteRateLimit } from "../../../lib/rateLimit";
import { logSecurityEvent } from "../../../lib/security-log";
import mongoose from "mongoose";

export default withAuth(async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const rate = await enforceRouteRateLimit(req, res, {
    route: "conversation:get",
    email: req.user?.email,
    ipLimit: 40,
    ipWindowSec: 60,
    emailLimit: 60,
    emailWindowSec: 60,
  });
  if (!rate.ok) return res.status(429).json({ message: rate.message });

  const id = String(req.query?.id || "").trim();
  if (!id) return res.status(400).json({ message: "conversation id is required" });
  if (!mongoose.Types.ObjectId.isValid(id)) {
    await logSecurityEvent(req, {
      eventType: "conversation.get.invalid_id",
      status: "warn",
      userId: req.user?.userId,
      email: req.user?.email,
    });
    return res.status(400).json({ message: "Invalid conversation id" });
  }

  const userId = String(req.user?.userId || "");
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    await connectDB();
    const conv = await Conversation.findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();

    if (!conv) {
      await logSecurityEvent(req, {
        eventType: "conversation.get.not_found",
        status: "warn",
        userId: req.user?.userId,
        email: req.user?.email,
        metadata: { conversationId: id },
      });
      return res.status(404).json({ message: "Not found" });
    }
    return res.status(200).json(conv);
  } catch (error) {
    console.error("conversation:get error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
