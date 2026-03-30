import mongoose from "mongoose";

const UsageLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    type: { type: String, enum: ["chat", "image", "video", "package", "admin"], required: true },
    modelKey: { type: String, default: "" },
    modelId: { type: String, default: "" },
    status: { type: String, enum: ["ok", "error"], default: "ok" },
    promptPreview: { type: String, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

UsageLogSchema.index({ createdAt: -1 });

export default mongoose.models.UsageLog || mongoose.model("UsageLog", UsageLogSchema);

