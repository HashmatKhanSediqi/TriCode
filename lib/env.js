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
