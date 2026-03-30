import mongoose from "mongoose";
import { connectDB } from "../../../lib/mongodb";
import User from "../../../models/User";
import { withAuth } from "../../../lib/auth";
import { MODELS } from "../../../lib/chatModels";
import { getSystemConfig } from "../../../lib/system";
import { enforceRouteRateLimit } from "../../../lib/rateLimit";
import { logSecurityEvent } from "../../../lib/security-log";

export default withAuth(
  async function handler(req, res) {
    const userId = req.user?.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const rate = await enforceRouteRateLimit(req, res, {
      route: "user:preferences",
      email: req.user?.email || userId,
      ipLimit: 30,
      ipWindowSec: 60,
      emailLimit: 20,
      emailWindowSec: 300,
    });
    if (!rate.ok) {
      return res.status(429).json({ message: rate.message });
    }

    try {
      await connectDB();

      if (req.method === "PATCH") {
        const preferredModelRaw = req.body?.preferredModel;
        const languageRaw = req.body?.language;
        const updates = {};

        if (preferredModelRaw !== undefined) {
          const preferredModel = String(preferredModelRaw || "").trim();
          if (!preferredModel) {
            return res
              .status(400)
              .json({ message: "preferredModel is required" });
          }
          if (!MODELS[preferredModel]) {
            return res.status(400).json({ message: "Unknown model key" });
          }

          const cfg = await getSystemConfig();
          if (cfg?.availableModels?.[preferredModel] === false) {
            return res
              .status(403)
              .json({ message: "This model is disabled by admin" });
          }
          updates.preferredModel = preferredModel;
        }

        if (languageRaw !== undefined) {
          const language = String(languageRaw || "").trim();
          if (!["fa", "ps", "en"].includes(language)) {
            return res.status(400).json({ message: "Unsupported language" });
          }
          updates.language = language;
        }

        if (!Object.keys(updates).length) {
          return res.status(400).json({ message: "No updates provided" });
        }

        const user = await User.findByIdAndUpdate(
          userId,
          { $set: { ...updates, updatedAt: new Date() } },
          { new: true },
        ).select("preferredModel language");

        await logSecurityEvent(req, {
          eventType: "user.preferences.updated",
          status: "ok",
          userId,
          email: req.user?.email || "",
          metadata: { ...updates },
        });

        return res.status(200).json({
          preferredModel: user?.preferredModel || updates.preferredModel,
          language: user?.language || updates.language,
        });
      }

      if (req.method === "GET") {
        const user = await User.findById(userId)
          .select("preferredModel language name")
          .lean();
        if (!user) return res.status(404).json({ message: "Not found" });
        return res.status(200).json(user);
      }

      return res.status(405).end();
    } catch (error) {
      console.error("user/preferences error:", error);
      await logSecurityEvent(req, {
        eventType: "user.preferences.error",
        status: "error",
        userId,
        email: req.user?.email || "",
        metadata: { message: String(error?.message || error || "") },
      });
      return res.status(500).json({ message: "Internal server error" });
    }
  },
  { requireCsrfForMutations: true },
);
