import { connectDB } from "../../../lib/mongodb";
import UsageLog from "../../../models/UsageLog";
import { withAdminAuth } from "../../../lib/auth";

export default withAdminAuth(async function handler(req, res) {
  try {
    await connectDB();
    if (req.method !== "GET") return res.status(405).end();

    const parsedLimit = Number(req.query?.limit || 50);
    const limit = Math.min(200, Math.max(10, Number.isFinite(parsedLimit) ? parsedLimit : 50));
    const type = String(req.query?.type || "").trim();

    const query = type ? { type } : {};
    const logs = await UsageLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json(logs);
  } catch (error) {
    console.error("admin/logs error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
