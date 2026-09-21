import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { logEvent } from "@/lib/notify";
import { verifySignature } from "@/lib/whatsapp/client";
import { parseInbound, parseStatuses } from "@/lib/whatsapp/parse";
import { autoReplyEnabled, handleInbound } from "@/lib/whatsapp/handler";
import { applyStatusUpdate } from "@/lib/whatsapp/broadcast";
import type { WhatsAppWebhookBody } from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * =============================================================================
 *  WhatsApp Cloud API webhook
 * =============================================================================
 *
 *  Register this URL in Meta ▸ WhatsApp ▸ Configuration ▸ Webhook and subscribe
 *  to the `messages` field:
 *
 *      https://ai.pros-link.com/api/whatsapp/webhook
 *
 *  GET  — Meta's one-time verification handshake.
 *  POST — every inbound customer message and delivery receipt.
 *
 *  Two rules govern everything here:
 *
 *   1. **Never trust the caller.** The URL is public, so an unsigned or
 *      wrongly-signed POST is rejected before a single byte is parsed.
 *      Otherwise anyone could impersonate a customer and fill the CRM.
 *
 *   2. **Always answer 200.** Meta redelivers on any other status, and a
 *      redelivery of a message we already answered would message the customer
 *      twice. Processing errors are logged and swallowed; deduplication by
 *      message id (see `handler.ts`) makes the retries that do happen safe.
 * =============================================================================
 */

/** Meta's subscription handshake: echo `hub.challenge` if the token matches. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (!config.whatsapp.verifyToken) {
    console.error("[whatsapp] WHATSAPP_VERIFY_TOKEN is not set — verification refused.");
    return new Response("Webhook not configured", { status: 500 });
  }

  if (mode === "subscribe" && token === config.whatsapp.verifyToken && challenge) {
    // Meta requires the raw challenge as plain text, not JSON.
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  // The signature covers the exact bytes Meta sent, so the body must be read as
  // text and only parsed afterwards — `req.json()` would discard the original
  // formatting and the HMAC would never match.
  const raw = await req.text();

  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    console.warn("[whatsapp] rejected a webhook with an invalid signature.");
    await logEvent({
      level: "WARN",
      action: "whatsapp.webhook.rejected",
      message: "Inbound webhook failed X-Hub-Signature-256 verification.",
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        undefined,
    });
    return new Response("Invalid signature", { status: 401 });
  }

  let body: WhatsAppWebhookBody;
  try {
    body = JSON.parse(raw) as WhatsAppWebhookBody;
  } catch {
    // Malformed but signed — acknowledge so Meta stops retrying it.
    return new Response("OK", { status: 200 });
  }

  try {
    // Delivery receipts. Most belong to ordinary assistant replies and are
    // dropped by `applyStatusUpdate` after one indexed lookup; the ones that
    // match a broadcast recipient are what turns the "delivered / recipients"
    // column on the broadcasts page into a real number rather than a count of
    // messages Meta merely accepted.
    for (const status of parseStatuses(body)) {
      if (!status.id || !status.status) continue;

      if (status.status === "failed") {
        console.warn(
          "[whatsapp] delivery failed:",
          status.id,
          status.errors?.[0]?.title ?? "unknown reason"
        );
      }

      await applyStatusUpdate(
        status.id,
        status.status,
        status.errors?.[0]?.title ?? status.errors?.[0]?.message
      );
    }

    if (autoReplyEnabled()) {
      const messages = parseInbound(body);
      // Sequential on purpose: two messages from the same person share a
      // conversation, and answering them in parallel would send the replies
      // out of order.
      for (const message of messages) {
        await handleInbound(message);
      }
    }
  } catch (error) {
    // Logged, never rethrown — see rule 2 above.
    console.error("[whatsapp] webhook processing error:", error);
  }

  return new Response("OK", { status: 200 });
}
