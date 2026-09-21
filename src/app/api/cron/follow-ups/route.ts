import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { runFollowUps } from "@/lib/bot/followup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Smart follow-up scheduler endpoint.
 *
 * Call it every 15–30 minutes from any scheduler — a crontab line, cron-job.org,
 * GitHub Actions, the hosting panel — with the secret from `CRON_SECRET`:
 *
 *     curl -H "Authorization: Bearer $CRON_SECRET" https://ai.pros-link.com/api/cron/follow-ups
 *
 * It is safe to call more often: each lead gets at most one message per
 * configured step, and the run reports what it sent and why it skipped the rest.
 */
async function handle(req: NextRequest) {
  const secret = config.cron.secret;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set on this server." }, { status: 503 });
  }

  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const provided = header || req.nextUrl.searchParams.get("secret") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  if (!config.whatsapp.enabled) {
    return Response.json({ error: "WhatsApp is not configured." }, { status: 503 });
  }

  try {
    return Response.json(await runFollowUps());
  } catch (error) {
    console.error("[cron] follow-ups failed:", error);
    return Response.json({ error: "Follow-up run failed. See the server log." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
