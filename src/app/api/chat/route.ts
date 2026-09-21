import { NextRequest } from "next/server";
import { z } from "zod";
import type { Language as PrismaLanguage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { rateLimit } from "@/lib/redis";
import { clientIpOf } from "@/lib/notify";
import { detectLanguage, type Language } from "@/lib/i18n";
import type { ChatTurn } from "@/lib/ai";
import { readCapture, saveTurn } from "@/lib/capture";
import { contactOf, getCompanyProfile } from "@/lib/company";
import { listCategories } from "@/lib/catalog";
import { getBotConfig } from "@/lib/bot/config";
import { createCrmRuntime } from "@/lib/bot/crm-runtime";
import { runTurn } from "@/lib/bot/engine";
import type { Outgoing } from "@/lib/bot/render";
import { readBotState } from "@/lib/bot/types";
import type { ChatTurnResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * =============================================================================
 *  Web assistant — one turn
 * =============================================================================
 *
 *  The website runs the same conversation engine and CRM runtime as WhatsApp:
 *  the same menus, catalogue, flows, tracking and handover, the same leads,
 *  quote requests and tickets. Only the transport differs — messages are
 *  collected and returned as JSON instead of being sent to Meta.
 *
 *  The browser holds a random conversation reference; the server holds
 *  everything else (the transcript, what the customer told us, the engine's
 *  memory), so reloading the page loses nothing and nothing sensitive lives in
 *  the browser.
 * =============================================================================
 */

const bodySchema = z.object({
  conversationRef: z.string().regex(/^PL-CONV-[A-Z2-9]{10}$/, "Invalid conversation reference."),
  input: z.object({
    kind: z.enum(["text", "reply"]),
    text: z.string().max(2000),
    replyId: z.string().max(200).optional(),
  }),
});

const LANGUAGE_MAP: Record<Language, PrismaLanguage> = { en: "EN", ur: "UR", ur_roman: "UR_ROMAN", pa: "PA" };
const FROM_PRISMA: Record<PrismaLanguage, Language> = { EN: "en", UR: "ur", UR_ROMAN: "ur_roman", PA: "pa" };

export async function POST(req: NextRequest) {
  // A visitor sends one message at a time; this is generous for people and
  // tight enough that nobody can run up the model bill.
  const { allowed } = await rateLimit(`chat:${clientIpOf(req) ?? "anonymous"}`, 30, 60);
  if (!allowed) {
    return Response.json({ error: "Too many messages. Please wait a moment and try again." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { conversationRef, input } = parsed.data;
  const text = input.text.trim();
  if (input.kind === "text" && !text) return Response.json({ error: "Type a message first." }, { status: 400 });
  if (input.kind === "reply" && !input.replyId) return Response.json({ error: "Invalid request." }, { status: 400 });

  try {
    const [config, company, categories] = await Promise.all([getBotConfig(), getCompanyProfile(), listCategories()]);

    // The thread for this reference — created on the first message.
    let conversation = await prisma.conversation.findUnique({ where: { reference: conversationRef } });
    if (conversation && (conversation.department !== DEPARTMENT || conversation.channel !== "WEB")) {
      return Response.json({ error: "This conversation has ended. Please start a new chat." }, { status: 409 });
    }
    const isNewConversation = !conversation;
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          reference: conversationRef,
          channel: "WEB",
          department: DEPARTMENT,
          title: input.kind === "text" ? text.slice(0, 80) : `Web chat · ${input.text || "Menu"}`.slice(0, 80),
          trafficSource: "WEBSITE",
        },
      });
    }

    // Language: a tap keeps the conversation's language; free text re-detects,
    // except a one- or two-word answer ("Lahore"), which says little unless it
    // is in Urdu script.
    const stored = FROM_PRISMA[conversation.language];
    const detected = detectLanguage(text);
    const shortAnswer = text.split(/\s+/).length <= 2 && detected !== "ur" && detected !== "pa";
    const language: Language = input.kind !== "text" || shortAnswer ? stored : detected;

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: text || `[${input.replyId}]`,
        department: DEPARTMENT,
        language: LANGUAGE_MAP[language],
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastInboundAt: new Date(), status: "OPEN", closedAt: null },
    });

    const history = await loadHistory(conversation.id);
    const capture = readCapture(conversation.capture);
    const state = readBotState(capture.bot);
    const outbox: Outgoing[] = [];
    const now = new Date();

    const crm = createCrmRuntime({
      channel: "WEB",
      conversationId: conversation.id,
      phone: "",
      language,
      config,
      company: contactOf(company),
      categories: categories.map(({ slug, name }) => ({ slug, name })),
      history,
      leadId: capture.leadId,
      customerId: capture.customerId,
      attribution: { trafficSource: "WEBSITE", campaign: null, adId: null },
      now,
      deliver: async (message) => {
        outbox.push(message);
        return { ok: true };
      },
    });

    const result = await runTurn(
      { kind: input.kind, text: text || input.text, replyId: input.replyId },
      {
        config,
        channel: "WEB",
        company: contactOf(company),
        categories: categories.map(({ slug, name }) => ({ slug, name })),
        language,
        phone: "",
        isNewConversation,
        optedOut: false,
        botPaused: conversation.botPaused,
        details: capture.details,
        state,
        records: {
          lead: capture.leadReference,
          meeting: capture.meetingReference,
          ticket: capture.ticketReference,
          quote: capture.quoteReference,
        },
        now,
      },
      crm
    );

    await saveTurn(conversation.id, result.details, result.state, crm.records, result.state.intent);
    await prisma.conversation.update({ where: { id: conversation.id }, data: { language: LANGUAGE_MAP[language] } }).catch(() => {});

    const body: ChatTurnResponse = {
      reference: conversationRef,
      language,
      messages: outbox,
      records: crm.created,
      staffHandling: conversation.botPaused || Boolean(result.state.handover && !result.state.handover.silent),
    };
    return Response.json(body);
  } catch (error) {
    console.error("[chat] turn failed:", error);
    return Response.json(
      { error: "Sorry, I couldn't process that just now. Please try again in a moment." },
      { status: 500 }
    );
  }
}

/** The last turns of the thread, in the shape the AI layer expects. */
async function loadHistory(conversationId: string): Promise<ChatTurn[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId, role: { in: ["USER", "ASSISTANT"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { role: true, content: true },
  });
  return rows
    .reverse()
    .map((row) => ({ role: row.role === "USER" ? ("user" as const) : ("assistant" as const), content: row.content }))
    .filter((turn) => turn.content.trim().length > 0);
}
