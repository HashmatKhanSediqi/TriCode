import { sendOtpEmail } from "./email";

const QUEUE_NAME = "otp-email";

let queuePromise = null;
let workerStarted = false;

async function getQueue() {
  const redisUrl = String(process.env.REDIS_URL || "").trim();
  if (!redisUrl) return null;
  if (queuePromise) return queuePromise;

  queuePromise = (async () => {
    try {
      const [{ Queue }, { default: Redis }] = await Promise.all([
        import("bullmq"),
        import("ioredis"),
      ]);

      const connection = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });

      return new Queue(QUEUE_NAME, { connection });
    } catch (error) {
      console.error("email queue unavailable, fallback to direct send:", error?.message || error);
      return null;
    }
  })();

  return queuePromise;
}

async function maybeStartWorker() {
  if (workerStarted) return;
  const redisUrl = String(process.env.REDIS_URL || "").trim();
  if (!redisUrl) return;

  try {
    const [{ Worker }, { default: Redis }] = await Promise.all([
      import("bullmq"),
      import("ioredis"),
    ]);

    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    const worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        await sendOtpEmail(job.data || {});
      },
      { connection },
    );

    worker.on("failed", (job, error) => {
      console.error("email job failed:", job?.id, error?.message || error);
    });

    workerStarted = true;
  } catch (error) {
    console.error("failed to start email queue worker:", error?.message || error);
  }
}

export async function enqueueOtpEmail(payload) {
  await maybeStartWorker();

  const queue = await getQueue();
  if (!queue) {
    await sendOtpEmail(payload);
    return { queued: false, delivered: true };
  }

  await queue.add("send", payload, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  });

  return { queued: true, delivered: false };
}
