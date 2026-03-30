import mongoose from "mongoose";
import { connectDB } from "../../../lib/mongodb";
import { hashPassword, withAdminAuth } from "../../../lib/auth";
import Conversation from "../../../models/Conversation";
import User from "../../../models/User";
import UsageLog from "../../../models/UsageLog";

const MAX_SEARCH_LEN = 50;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ALLOWED_ROLES = new Set(["user", "admin"]);

const SAFE_USER_FIELDS = [
  "_id",
  "name",
  "email",
  "role",
  "isVerified",
  "dailyLimit",
  "monthlyLimit",
  "usageToday",
  "usageMonth",
  "creditBalance",
  "unlimitedCredits",
  "avatar",
  "language",
  "preferredModel",
  "createdAt",
  "updatedAt",
].join(" ");

function firstValue(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeRole(value, fallback = "user") {
  const role = String(value || "").trim().toLowerCase();
  return ALLOWED_ROLES.has(role) ? role : fallback;
}

function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseOptionalNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedNumber(value, fallback, { min = 0, max = 1_000_000 } = {}) {
  if (value === null) return fallback;
  return Math.max(min, Math.min(max, value));
}

export default withAdminAuth(async function handler(req, res) {
  try {
    await connectDB();
    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();

    if (req.method === "GET") {
      const q = String(firstValue(req.query?.q)).trim().slice(0, MAX_SEARCH_LEN);
      const safeQ = escapeRegex(q);

      const hasPagination =
        typeof req.query?.page !== "undefined" ||
        typeof req.query?.limit !== "undefined";

      const page = Math.max(
        1,
        parseInt(String(firstValue(req.query?.page) || DEFAULT_PAGE), 10) || DEFAULT_PAGE,
      );

      const limit = Math.min(
        MAX_LIMIT,
        Math.max(
          1,
          parseInt(String(firstValue(req.query?.limit) || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
        ),
      );

      const skip = hasPagination ? (page - 1) * limit : 0;

      const query = safeQ
        ? {
            $or: [
              { name: { $regex: safeQ, $options: "i" } },
              { email: { $regex: safeQ, $options: "i" } },
            ],
          }
        : {};

      const [users, total] = await Promise.all([
        (async () => {
          let cursor = User.find(query)
            .select(SAFE_USER_FIELDS)
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip);
          if (hasPagination) cursor = cursor.limit(limit);
          return cursor.lean();
        })(),
        User.countDocuments(query),
      ]);

      res.setHeader("X-Total-Count", String(total));
      if (hasPagination) {
        res.setHeader("X-Page", String(page));
        res.setHeader("X-Limit", String(limit));
      }

      return res.status(200).json(users);
    }

    if (req.method === "POST") {
      const {
        name,
        email,
        password,
        role,
        dailyLimit,
        monthlyLimit,
        creditBalance,
        unlimitedCredits,
      } = req.body || {};

      const normalizedName = String(name || "").trim();
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const rawPassword = String(password || "");
      const normalizedRole = normalizeRole(role, "user");

      if (!normalizedName || !normalizedEmail || !rawPassword) {
        return res.status(400).json({ message: "Required fields are missing" });
      }
      if (rawPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const exists = await User.findOne({ email: normalizedEmail }).select("_id").lean();
      if (exists) {
        return res.status(409).json({ message: "Email already exists" });
      }

      const daily = parseOptionalNumber(dailyLimit);
      const monthly = parseOptionalNumber(monthlyLimit);
      const credits = parseOptionalNumber(creditBalance);

      const passwordHash = await hashPassword(rawPassword);

      const user = await User.create({
        name: normalizedName,
        email: normalizedEmail,
        password: passwordHash,
        role: normalizedRole,
        isVerified: true,
        dailyLimit: boundedNumber(daily, 50),
        monthlyLimit: boundedNumber(monthly, 500),
        creditBalance: boundedNumber(credits, 100),
        unlimitedCredits: Boolean(unlimitedCredits),
      });

      await UsageLog.create({
        userId: req.user.userId,
        type: "admin",
        modelKey: "admin/users",
        status: "ok",
        promptPreview: "create user",
        meta: { targetUserId: user._id.toString(), targetEmail: user.email },
      });

      return res.status(201).json({ message: "User created", id: user._id });
    }

    if (req.method === "PUT") {
      const {
        id,
        name,
        role,
        dailyLimit,
        monthlyLimit,
        creditBalance,
        unlimitedCredits,
        password,
      } = req.body || {};

      const userId = String(id || "").trim();
      if (!userId) {
        return res.status(400).json({ message: "User id is required" });
      }
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: "Invalid user id" });
      }

      const target = await User.findById(userId);
      if (!target) return res.status(404).json({ message: "User not found" });

      const normalizedName = String(name || "").trim();
      const normalizedPassword = String(password || "");
      const normalizedRole = normalizeRole(role, target.role);

      const daily = parseOptionalNumber(dailyLimit);
      const monthly = parseOptionalNumber(monthlyLimit);
      const credits = parseOptionalNumber(creditBalance);

      const update = {
        name: normalizedName || target.name,
        role:
          target.email?.toLowerCase() === adminEmail
            ? "admin"
            : normalizedRole || target.role,
        dailyLimit: boundedNumber(daily, target.dailyLimit),
        monthlyLimit: boundedNumber(monthly, target.monthlyLimit),
        creditBalance: boundedNumber(credits, target.creditBalance),
        unlimitedCredits:
          typeof unlimitedCredits === "boolean"
            ? unlimitedCredits
            : target.unlimitedCredits,
        updatedAt: new Date(),
      };

      if (normalizedPassword) {
        if (normalizedPassword.length < 8) {
          return res
            .status(400)
            .json({ message: "Password must be at least 8 characters" });
        }
        update.password = await hashPassword(normalizedPassword);
      }

      await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true });

      await UsageLog.create({
        userId: req.user.userId,
        type: "admin",
        modelKey: "admin/users",
        status: "ok",
        promptPreview: "update user",
        meta: { targetUserId: userId },
      });

      return res.status(200).json({ message: "Updated" });
    }

    if (req.method === "DELETE") {
      const id = String(firstValue(req.query?.id)).trim();
      if (!id) return res.status(400).json({ message: "User id is required" });
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user id" });
      }

      if (id === req.user.userId) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }

      const target = await User.findById(id);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (adminEmail && target.email?.toLowerCase() === adminEmail) {
        return res.status(400).json({ message: "Primary admin cannot be deleted" });
      }

      await Conversation.deleteMany({ userId: id });
      await User.findByIdAndDelete(id);

      await UsageLog.create({
        userId: req.user.userId,
        type: "admin",
        modelKey: "admin/users",
        status: "ok",
        promptPreview: "delete user",
        meta: { targetUserId: id },
      });

      return res.status(200).json({ message: "Deleted" });
    }

    return res.status(405).end();
  } catch (error) {
    console.error("admin/users error:", error);

    if (error?.code === 11000) {
      return res.status(409).json({ message: "Email already exists" });
    }

    if (error?.name === "CastError") {
      return res.status(400).json({ message: "Invalid input" });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
});
