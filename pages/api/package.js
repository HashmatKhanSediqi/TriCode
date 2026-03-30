import { connectDB } from "../../lib/mongodb";
import Conversation from "../../models/Conversation";
import UsageLog from "../../models/UsageLog";
import { withAuth } from "../../lib/auth";
import { getSystemConfig } from "../../lib/system";
import { enforceRouteRateLimit } from "../../lib/rateLimit";
import { logSecurityEvent } from "../../lib/security-log";
import { requireCsrf } from "../../lib/csrf";
import mongoose from "mongoose";
import { z } from "zod";
import { PACKAGE_LIMITS, createZip, extractCodeFiles } from "../../lib/packager";

const payloadSchema = z.object({
  conversationId: z.string().trim().min(1),
});

const MAX_ZIP_BYTES = PACKAGE_LIMITS.MAX_ZIP_BYTES;

export default withAuth(async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  const rate = await enforceRouteRateLimit(req, res, {
    route: "package",
    email: req.user?.email,
    ipLimit: 10,
    ipWindowSec: 60,
    emailLimit: 8,
    emailWindowSec: 60,
  });

  if (!rate.ok) {
    return res.status(429).json({ message: rate.message });
  }

  const parsed = payloadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    await logSecurityEvent(req, {
      eventType: "package.invalid_input",
      status: "warn",
      userId: req.user?.userId,
      email: req.user?.email,
    });
    return res.status(400).json({ message: "conversationId is required" });
  }

  const conversationId = String(parsed.data.conversationId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return res.status(400).json({ message: "Invalid conversationId" });
  }

  try {
    await connectDB();
    const cfg = await getSystemConfig();
    if (!cfg.features?.packaging) {
      return res.status(403).json({ message: "Packaging is disabled by admin." });
    }

    const conv = await Conversation.findOne({
      _id: new mongoose.Types.ObjectId(conversationId),
      userId: req.user.userId,
    })
      .select("messages updatedAt")
      .lean();

    if (!conv) return res.status(404).json({ message: "Conversation not found" });

    const files = extractCodeFiles(conv.messages || []);
    const zipBuffer = createZip(files);

    if (zipBuffer.length > MAX_ZIP_BYTES) {
      return res.status(413).json({ message: "Package is too large to generate." });
    }

    try {
      await UsageLog.create({
        userId: req.user.userId,
        type: "package",
        modelKey: "zip",
        status: "ok",
        promptPreview: `package ${conversationId}`,
        meta: { fileCount: files.length },
      });
    } catch {}

    return res.status(200).json({
      fileName: `code-package-${conversationId}.zip`,
      zipBase64: zipBuffer.toString("base64"),
      fileCount: files.length,
    });
  } catch (error) {
    console.error("package error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
