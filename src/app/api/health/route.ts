import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + dependency health probe (used by Docker/Nginx/monitoring). */
export async function GET() {
  const checks: Record<string, "ok" | "down" | "skipped"> = {
    app: "ok",
    database: "skipped",
    redis: "skipped",
  };

  if (config.databaseUrl) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch {
      checks.database = "down";
    }
  }

  if (redis) {
    try {
      if (redis.status === "wait") await redis.connect();
      await redis.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "down";
    }
  }

  const healthy = !Object.values(checks).includes("down");
  return Response.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
