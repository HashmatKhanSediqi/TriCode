import { ensureCsrfToken } from "../../../lib/csrf";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");
  const csrfToken = ensureCsrfToken(req, res);
  return res.status(200).json({ csrfToken });
}
