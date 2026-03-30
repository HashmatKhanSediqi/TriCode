import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  isVerified: { type: Boolean, default: false },

  verifyCodeHash: { type: String, default: null },
  verifyExpiry: { type: Date, default: null, index: true },
  verifyAttempts: { type: Number, default: 0 },
  verifyLastSentAt: { type: Date, default: null },

  adminOtpHash: { type: String, default: null },
  adminOtpExpiry: { type: Date, default: null },
  adminOtpAttempts: { type: Number, default: 0 },
  adminOtpLastSentAt: { type: Date, default: null },

  failedLoginAttempts: { type: Number, default: 0 },
  loginLockUntil: { type: Date, default: null },

  dailyLimit: { type: Number, default: 50 },
  monthlyLimit: { type: Number, default: 500 },
  usageToday: { type: Number, default: 0 },
  usageMonth: { type: Number, default: 0 },
  creditBalance: { type: Number, default: 100 },
  unlimitedCredits: { type: Boolean, default: false },
  lastReset: { type: Date, default: Date.now },

  avatar: { type: String, default: "" },
  language: { type: String, default: "fa", enum: ["fa", "ps", "en"] },
  preferredModel: { type: String, default: "deepseek-v3" },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

UserSchema.index({ role: 1, createdAt: -1 });

UserSchema.pre("save", function updateTimestamp() {
  this.updatedAt = new Date();
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
