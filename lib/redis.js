let redisClientPromise = null;

function isRedisEnabled() {
  return Boolean(String(process.env.REDIS_URL || "").trim());
}

export async function getRedisClient() {
  if (!isRedisEnabled()) return null;
  if (redisClientPromise) return redisClientPromise;

  redisClientPromise = (async () => {
    try {
      const { default: Redis } = await import("ioredis");
      const client = new Redis(String(process.env.REDIS_URL || "").trim(), {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
      });
      await client.connect();
      client.on("error", (error) => {
        console.error("redis error:", error?.message || error);
      });
      return client;
    } catch (error) {
      console.error("redis unavailable, fallback to memory limiter:", error?.message || error);
      return null;
    }
  })();

  return redisClientPromise;
}
