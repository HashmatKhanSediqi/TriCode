import { connectDB } from "../../../lib/mongodb";
import { withAuth } from "../../../lib/auth";
import { getSystemConfig } from "../../../lib/system";
import { enforceRouteRateLimit } from "../../../lib/rateLimit";
import { logSecurityEvent } from "../../../lib/security-log";

export default withAuth(async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const rate = await enforceRouteRateLimit(req, res, {
    route: "system:public",
    email: req.user?.email || req.user?.userId,
    ipLimit: 40,
    ipWindowSec: 60,
    emailLimit: 30,
    emailWindowSec: 300,
  });
  if (!rate.ok) {
    return res.status(429).json({ message: rate.message });
  }

  try {
    await connectDB();
    const cfg = await getSystemConfig();

    if (!cfg || typeof cfg !== "object") {
      await logSecurityEvent(req, {
        eventType: "system.public.invalid_config",
        status: "warn",
        userId: req.user?.userId,
        email: req.user?.email || "",
      });
      return res.status(503).json({ message: "Configuration unavailable." });
    }

    res.setHeader("Cache-Control", "private, max-age=60");

    await logSecurityEvent(req, {
      eventType: "system.public.read",
      status: "ok",
      userId: req.user?.userId,
      email: req.user?.email || "",
    });

    return res.status(200).json({
      features: cfg.features || {},
      availableModels: cfg.availableModels || {},
      media: cfg.media || {},
    });
  } catch (error) {
    console.error("system/public error:", error);
    await logSecurityEvent(req, {
      eventType: "system.public.error",
      status: "error",
      userId: req.user?.userId,
      email: req.user?.email || "",
      metadata: { message: String(error?.message || error || "") },
    });
    return res.status(500).json({ message: "Internal server error." });
  }
});
