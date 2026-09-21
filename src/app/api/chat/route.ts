import { NextRequest } from "next/server";
import { z } from "zod";
import {
  asksQuestion,
  extractCustomerDetails,
  planAssistantTurn,
  shouldEscalate,
  streamAssistantReply,
  suggestFollowUps,
  type CustomerDetails,
} from "@/lib/ai";
import { BRAND, DEPARTMENT } from "@/config/brand";
import { generateReference, generateConversationReference } from "@/lib/utils";
import { rateLimit } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { logEvent, notifyTeam } from "@/lib/notify";
import { readCapture, recordsOf, syncCapture, type CaptureState } from "@/lib/capture";
import { detectLanguage } from "@/lib/i18n";
import { getBotConfig } from "@/lib/bot/config";
import { promptContextFor } from "@/lib/bot/prompt";
import type { ChatStreamEvent } from "@/types";
import type { Language as PrismaLanguage } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        // Empty is allowed and dropped below: a reply the model failed to
        // produce sits in the client's transcript as an empty turn, and
        // rejecting it here would fail every message after it.
        content: z.string().max(4000),
      })
    )
    .min(1)
    .max(50),
  conversationRef: z.string().max(64).optional(),
});

function sse(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

const LANGUAGE_MAP = {
  en: "EN",
  ur: "UR",
  ur_roman: "UR_ROMAN",
  pa: "PA",
} as const;

export async function POST(req: NextRequest) {
  // --- Rate limit (fails open when Redis is absent) -------------------------
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";
  const { allowed } = await rateLimit(`chat:${ip}`, 30, 60);
  if (!allowed) {
    return Response.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      { status: 429 }
    );
  }

  // --- Validate -------------------------------------------------------------
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const messages = parsed.data.messages.filter((m) => m.content.trim().length > 0);
  if (!messages.length) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const reference = parsed.data.conversationRef ?? generateConversationReference();

  // What this customer has already told us, so the representative neither asks
  // twice nor forgets a name given twenty messages ago. Bounded: a slow
  // database costs this turn its memory, not its reply.
  const [stored, botConfig] = await Promise.all([
    within(loadCapture(reference), 1500, null),
    getBotConfig(),
  ]);
  const known: CustomerDetails = stored?.details ?? {};
  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const plan = planAssistantTurn(messages, {
    channel: "WEB",
    details: known,
    records: stored ? recordsOf(stored) : undefined,
    // Contact details, voice and published pricing from Chatbot Studio.
    bot: promptContextFor(botConfig, detectLanguage(lastUserText)),
  });

  // Started now, alongside the reply, so it has usually finished by the time
  // the last token is sent.
  const extraction = extractCustomerDetails(messages, known);

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUser?.content ?? "";

  const ticketId = shouldEscalate(userText) ? generateReference("TKT") : undefined;

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantText = "";
      // The visitor may close the tab mid-reply; the work below still finishes.
      const send = (event: ChatStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(sse(event)));
        } catch {
          /* stream already closed by the client */
        }
      };

      // Tell the client the detected language immediately so it can switch
      // text direction while the model is still generating.
      send({ type: "meta", language: plan.language });

      try {
        for await (const chunk of streamAssistantReply(messages, plan)) {
          assistantText += chunk;
          send({ type: "chunk", text: chunk });
        }

        // A stream with no text — a safety block, or a thinking budget spent
        // entirely on thoughts — would leave an empty bubble. Say so instead.
        if (!assistantText.trim()) {
          throw new Error("The model returned no text.");
        }

        if (ticketId) {
          const note = `\n\n🎫 I've created ticket **${ticketId}** and passed this to the ${BRAND.name} team. Keep this reference for follow-up.`;
          assistantText += note;
          send({ type: "chunk", text: note });
        }

        send({
          type: "done",
          ticketId,
          suggestions: asksQuestion(assistantText) ? [] : suggestFollowUps(userText),
        });
      } catch (err) {
        console.error("[chat] stream error:", err);
        send({
          type: "error",
          message: "Sorry, I'm having trouble responding right now. Please try again in a moment.",
        });
      }

      // --- Best-effort persistence and CRM capture ----------------------------
      // The client re-enables the composer on `done`, so nobody waits on this.
      // The stream stays open only to report records the turn created.
      try {
        const conversationId = await persist({
          reference,
          language: LANGUAGE_MAP[plan.language],
          userText,
          assistantText,
          ticketId,
          known,
          latencyMs: Date.now() - startedAt,
        });

        const captured = await syncCapture(
          { conversationId, source: "CHATBOT" },
          await extraction
        );
        if (captured?.created.length) {
          send({ type: "capture", records: captured.created });
        }
      } catch (e) {
        console.warn("[chat] persistence skipped:", (e as Error)?.message ?? e);
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** The capture stored on this conversation, or null for a new or archived one. */
async function loadCapture(reference: string): Promise<CaptureState | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { reference },
    select: { capture: true, department: true },
  });
  if (!conversation) return null;
  if (conversation.department && conversation.department !== DEPARTMENT) return null;
  return readCapture(conversation.capture);
}

/** Resolve with `fallback` if the promise rejects or takes longer than `ms`. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * Store the exchange for chat history, CRM context and analytics. Returns the
 * conversation id so the capture can be attached to it.
 */
async function persist(opts: {
  reference: string;
  language: PrismaLanguage;
  userText: string;
  assistantText: string;
  ticketId?: string;
  known: CustomerDetails;
  latencyMs: number;
}): Promise<string> {
  const { reference, language, userText, assistantText, ticketId, known, latencyMs } = opts;

  const conversation = await prisma.conversation.upsert({
    where: { reference },
    update: { updatedAt: new Date(), language },
    create: {
      reference,
      department: DEPARTMENT,
      language,
      title: userText.slice(0, 80),
    },
  });

  if (userText) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: userText,
        department: DEPARTMENT,
        language,
      },
    });
  }

  // A failed turn has no reply worth keeping; the customer's message still is.
  if (assistantText.trim()) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: assistantText,
        department: DEPARTMENT,
        language,
        latencyMs,
      },
    });
  }

  if (ticketId) {
    await prisma.ticket.create({
      data: {
        reference: ticketId,
        department: DEPARTMENT,
        category: "GENERAL",
        subject: "Escalated from the BITSOL AI Assistant",
        description: userText,
        // Whatever the representative had already learned, so the person who
        // picks this up can call back without reading the whole transcript.
        contactName: known.name ?? null,
        contactPhone: known.phone ?? null,
        contactEmail: known.email ?? null,
        conversationId: conversation.id,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { handedOff: true },
    });

    await notifyTeam({
      subject: `Human handoff requested — ${ticketId}`,
      body: [
        "A visitor asked for a human.",
        "",
        `Ticket: ${ticketId}`,
        `Conversation: ${reference}`,
        known.name ? `Name: ${known.name}` : null,
        known.phone ? `Phone: ${known.phone}` : null,
        known.email ? `Email: ${known.email}` : null,
        "",
        "Their message:",
        userText,
      ]
        .filter((line) => line !== null)
        .join("\n"),
      link: `/admin/support/tickets`,
    });

    await logEvent({
      action: "chat.escalated",
      entity: "Ticket",
      entityId: ticketId,
      message: "Assistant escalated a conversation to a human.",
    });
  }

  return conversation.id;
}
