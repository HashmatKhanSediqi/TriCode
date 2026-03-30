import { DEFAULT_WELCOME_PROMPTS } from "../../../lib/prompts";

export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const limitRaw = Number(req.query?.limit || 0);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, DEFAULT_WELCOME_PROMPTS.length)
    : DEFAULT_WELCOME_PROMPTS.length;

  const shuffled = [...DEFAULT_WELCOME_PROMPTS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({
    prompts: shuffled.slice(0, limit),
    updatedAt: new Date().toISOString(),
  });
}
