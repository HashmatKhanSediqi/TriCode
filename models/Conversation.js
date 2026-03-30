import mongoose from "mongoose";

const AttachmentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["image", "file", "generated-image", "generated-video"],
    required: true,
  },
  name: { type: String, default: "" },
  url: { type: String, default: "" }, // base64 or path
  downloadUrl: { type: String, default: "" },
  mimeType: { type: String, default: "" },
  size: { type: Number, default: 0 },
});

const MessageSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant", "system"], required: true },
  content: { type: String, required: true },
  model: { type: String, default: "" },
  attachments: [AttachmentSchema],
  tokens: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const ConversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  title: { type: String, default: "گفتگوی جدید" },
  language: { type: String, default: "fa", enum: ["fa", "ps", "en"] },
  model: { type: String, default: "deepseek-v3" },
  messages: [MessageSchema],
  pinned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ConversationSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.models.Conversation ||
  mongoose.model("Conversation", ConversationSchema);
