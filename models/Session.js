import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    scope: { type: String, enum: ["user", "admin"], required: true, index: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null, index: true },
  },
  { versionKey: false },
);

SessionSchema.index({ userId: 1, createdAt: -1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.Session || mongoose.model("Session", SessionSchema);
