import SystemSetting from "../models/SystemSetting";

//
export const DEFAULT_SYSTEM_CONFIG = {
  features: {
    userLogin: true,
    userSignup: true,
    chat: true,
    imageGeneration: true,
    videoGeneration: true,
    packaging: true,
    webSearch: true,
  },
  availableModels: {},
  media: {
    imageDefault: "pollinations",
    videoDefault: "minimax-video",
  },
};

export async function getSystemConfig() {
  let row = await SystemSetting.findOne({ key: "system_config" }).lean();
  if (!row) {
    row = await SystemSetting.create({
      key: "system_config",
      value: DEFAULT_SYSTEM_CONFIG,
    });
    row = row.toObject();
  }
  return {
    ...DEFAULT_SYSTEM_CONFIG,
    ...(row.value || {}),
    features: {
      ...DEFAULT_SYSTEM_CONFIG.features,
      ...(row.value?.features || {}),
    },
    availableModels: {
      ...DEFAULT_SYSTEM_CONFIG.availableModels,
      ...(row.value?.availableModels || {}),
    },
    media: { ...DEFAULT_SYSTEM_CONFIG.media, ...(row.value?.media || {}) },
  };
}

export async function saveSystemConfig(nextValue, userId = null) {
  const safe = {
    ...DEFAULT_SYSTEM_CONFIG,
    ...(nextValue || {}),
    features: {
      ...DEFAULT_SYSTEM_CONFIG.features,
      ...(nextValue?.features || {}),
    },
    availableModels: { ...(nextValue?.availableModels || {}) },
    media: { ...DEFAULT_SYSTEM_CONFIG.media, ...(nextValue?.media || {}) },
  };
  const row = await SystemSetting.findOneAndUpdate(
    { key: "system_config" },
    { $set: { value: safe, updatedBy: userId || null } },
    { upsert: true, new: true },
  ).lean();
  return row.value;
}
