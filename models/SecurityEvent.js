import mongoose from "mongoose";

const SecurityEventSchema = new mongoose.Schema(
  {
    eventType: { type: String, required: true, index: true },
    status: { type: String, default: "info", index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

SecurityEventSchema.index({ eventType: 1, createdAt: -1 });
SecurityEventSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.SecurityEvent ||
  mongoose.model("SecurityEvent", SecurityEventSchema);
