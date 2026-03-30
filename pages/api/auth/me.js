import { connectDB } from "../../../lib/mongodb";
import User from "../../../models/User";
import { withAuth } from "../../../lib/auth";
import mongoose from "mongoose";

export default withAuth(async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const userId = String(req.user?.userId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    await connectDB();

    const user = await User.findById(userId)
      .select(
        "name email role isVerified language preferredModel dailyLimit monthlyLimit usageToday usageMonth creditBalance unlimitedCredits createdAt updatedAt",
      )
      .lean();

    if (!user) {
      return res.status(404).json({ message: "Not found" });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error("auth/me error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
