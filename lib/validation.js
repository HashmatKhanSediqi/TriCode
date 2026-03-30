import { z } from "zod";

const DEFAULT_POLICY = process.env.NODE_ENV === "production" ? "strong" : "basic";
const PASSWORD_POLICY = String(process.env.PASSWORD_POLICY || DEFAULT_POLICY).trim().toLowerCase();
const DEFAULT_MIN = PASSWORD_POLICY === "strong" ? 10 : 6;
export const MIN_PASSWORD_LENGTH = Math.max(6, Number(process.env.MIN_PASSWORD_LENGTH || DEFAULT_MIN));
export const MAX_PASSWORD_LENGTH = 128;

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

function isStrongPassword(password) {
  return (
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function validatePasswordPolicy(password) {
  if (PASSWORD_POLICY !== "strong") {
    return { ok: true, policy: "basic", minLength: MIN_PASSWORD_LENGTH };
  }

  if (!isStrongPassword(password)) {
    return {
      ok: false,
      policy: "strong",
      minLength: MIN_PASSWORD_LENGTH,
      message:
        "Password must include uppercase, lowercase, number, and symbol characters.",
    };
  }

  return { ok: true, policy: "strong", minLength: MIN_PASSWORD_LENGTH };
}

export function deriveNameFromEmail(email) {
  const local = String(email || "").split("@")[0] || "User";
  const clean = local.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40);
  return clean || "User";
}

export function normalizeEmail(email) {
  try {
    return emailSchema.parse(String(email || ""));
  } catch {
    return String(email || "").trim().toLowerCase();
  }
}

export function validateRegisterPayload(payload = {}) {
  const name =
    typeof payload?.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : undefined;

  const schema = z.object({
    name: z.string().trim().max(80).optional(),
    email: emailSchema,
    password: passwordSchema,
    captchaToken: z.string().trim().min(1).optional(),
  });

  const result = schema.safeParse({
    name,
    email: payload?.email,
    password: payload?.password,
    captchaToken: payload?.captchaToken,
  });

  if (!result.success) {
    return { ok: false, errors: result.error.issues };
  }

  const passwordCheck = validatePasswordPolicy(result.data.password);
  if (!passwordCheck.ok) {
    return {
      ok: false,
      errors: [{ path: ["password"], message: passwordCheck.message }],
    };
  }

  return { ok: true, data: result.data };
}

export function validateEmailPassword(payload = {}) {
  const schema = z.object({
    email: emailSchema,
    password: passwordSchema,
  });

  const result = schema.safeParse({
    email: payload?.email,
    password: payload?.password,
  });

  if (!result.success) {
    return { ok: false, errors: result.error.issues };
  }

  const passwordCheck = validatePasswordPolicy(result.data.password);
  if (!passwordCheck.ok) {
    return {
      ok: false,
      errors: [{ path: ["password"], message: passwordCheck.message }],
    };
  }

  return { ok: true, data: result.data };
}
