import { connectDB } from "../../../lib/mongodb";
import User from "../../../models/User";
import Conversation from "../../../models/Conversation";
import UsageLog from "../../../models/UsageLog";
import { withAdminAuth } from "../../../lib/auth";
import { getSystemConfig, saveSystemConfig } from "../../../lib/system";

export default withAdminAuth(async function handler(req, res) {
  try {
    await connectDB();

    if (req.method === "GET") {
      const [config, totalUsers, totalConversations, todayCalls] =
        await Promise.all([
          getSystemConfig(),
          User.countDocuments({}),
          Conversation.countDocuments({}),
          UsageLog.countDocuments({
            createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
          }),
        ]);

      return res.status(200).json({
        config,
        stats: { totalUsers, totalConversations, todayCalls },
      });
    }

    if (req.method === "PATCH") {
      const patch = req.body && typeof req.body === "object" ? req.body : {};
      const current = await getSystemConfig();
      const next = {
        ...current,
        ...patch,
        features: { ...current.features, ...(patch.features || {}) },
        media: { ...current.media, ...(patch.media || {}) },
        availableModels: {
          ...current.availableModels,
          ...(patch.availableModels || {}),
        },
      };

      const value = await saveSystemConfig(next, req.user.userId);

      await UsageLog.create({
        userId: req.user.userId,
        type: "admin",
        modelKey: "admin/system",
        status: "ok",
        promptPreview: "update system config",
        meta: { changedKeys: Object.keys(patch) },
      });

      return res.status(200).json({ config: value });
    }

    return res.status(405).end();
  } catch (error) {
    console.error("admin/system error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
