import mongoose from "mongoose";

const ChatSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  userMessage: String,
  aiReply: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

ChatSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.Chat || mongoose.model("Chat", ChatSchema);
