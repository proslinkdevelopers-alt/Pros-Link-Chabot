import Redis from "ioredis";
import { config } from "./config";

/**
 * Optional Redis client for rate limiting. `null` when REDIS_URL is not
 * configured; the limiter then counts in memory.
 */
const globalForRedis = globalThis as unknown as { redis: Redis | null | undefined };

function createClient(): Redis | null {
  if (!config.redisUrl) return null;
  const client = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  client.on("error", (err) => console.error("[redis] connection error:", err.message));
  return client;
}

export const redis = globalForRedis.redis ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/**
 * Per-instance fallback used when Redis is not configured or not reachable.
 * It only counts requests that reach this process, so a multi-instance
 * deployment should run Redis — but a single server without Redis still gets
 * real protection (sign-in throttling in particular) instead of none.
 */
const memory = new Map<string, { count: number; resetAt: number }>();
let lastSweep = 0;

function memoryLimit(key: string, limit: number, windowSeconds: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [bucket, entry] of memory) if (entry.resetAt <= now) memory.delete(bucket);
  }
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1 };
  }
  entry.count += 1;
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) };
}

/**
 * Fixed-window rate limiter. Uses Redis when configured and falls back to an
 * in-process counter otherwise. Returns whether the action is allowed.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  if (!redis) return memoryLimit(key, limit, windowSeconds);
  try {
    if (redis.status === "wait") await redis.connect();
    const bucket = `ratelimit:${key}`;
    const count = await redis.incr(bucket);
    if (count === 1) await redis.expire(bucket, windowSeconds);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    return memoryLimit(key, limit, windowSeconds);
  }
}

/** Clear a limiter bucket — after a successful sign-in, for example. */
export async function resetRateLimit(key: string): Promise<void> {
  memory.delete(key);
  if (!redis) return;
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.del(`ratelimit:${key}`);
  } catch {
    /* the window expires on its own */
  }
}
