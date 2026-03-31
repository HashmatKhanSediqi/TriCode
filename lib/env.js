const REQUIRED_AUTH_ENV_VARS = ["JWT_SECRET", "OTP_PEPPER"];

let authEnvValidated = false;

function isMissing(value) {
  return typeof value !== "string" || value.trim() === "";
}

export function requireEnv(name) {
  const value = process.env[name];
  if (isMissing(value)) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function validateAuthEnv() {
  if (authEnvValidated) return;
  for (const key of REQUIRED_AUTH_ENV_VARS) {
    requireEnv(key);
  }
  authEnvValidated = true;
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function shouldShowDevCode() {
  const raw = String(process.env.SHOW_DEV_CODE || "").trim().toLowerCase();
  if (!raw) return !isProduction();
  if (["true", "1", "yes", "on"].includes(raw)) return true;
  if (["false", "0", "no", "off"].includes(raw)) return false;
  return !isProduction();
}
