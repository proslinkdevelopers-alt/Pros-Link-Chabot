import { Prisma } from "@prisma/client";
import type { Language as PrismaLanguage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/redis";
import { logEvent } from "@/lib/notify";
import { shortId } from "@/lib/utils";
import { detectLanguage, type Language } from "@/lib/i18n";
import { DEPARTMENT } from "@/config/brand";
import type { ChatTurn } from "@/lib/ai";
import { readCapture, saveTurn } from "@/lib/capture";
import { getBotConfig } from "@/lib/bot/config";
import { runTurn } from "@/lib/bot/engine";
import { attribute, stripRefCode } from "@/lib/bot/source";
import { readBotState } from "@/lib/bot/types";
import { createWhatsAppRuntime } from "@/lib/bot/whatsapp-runtime";
import { markAsRead, toDisplayPhone } from "./client";
import type { InboundMessage } from "./types";

/**
 * =============================================================================
 *  WhatsApp conversation handler
 * =============================================================================
 *
 *  The transport side of the WhatsApp growth assistant. For each inbound
 *  message it:
 *
 *    1. rate-limits the sender and records the contact,
 *    2. finds the live thread for the number (or opens one, attributing it to
 *       the ad, `ref:` code or broadcast that brought the customer in),
 *    3. stores the message — the idempotency gate against Meta's redeliveries,
 *    4. hands the message to the conversation engine (`lib/bot/engine.ts`)
 *       with a runtime that talks to WhatsApp, the model and the CRM,
 *    5. saves what the engine learned and remembers for the next message.
 *
 *  Menus, flows, intents, scoring and handover all live in the engine; this
 *  file knows nothing about them. The same brain as the website chat answers
 *  open questions — `planAssistantTurn` retrieves from the knowledge base and
 *  builds the system prompt — so the two channels cannot drift apart.
 *
 *  Every path is defensive: this runs inside a webhook Meta will retry on any
 *  non-200, so a failure here must be logged and swallowed, never thrown.
 * =============================================================================
 */

const LANGUAGE_MAP: Record<Language, PrismaLanguage> = {
  en: "EN",
  ur: "UR",
  ur_roman: "UR_ROMAN",
  pa: "PA",
};

/**
 * A WhatsApp thread stays "the same conversation" for this long after the last
 * message. Matched to Meta's own 24-hour customer service window: past it the
 * business must open with a template anyway, so it is a natural thread break.
 */
const THREAD_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Handle one inbound customer message end to end. */
export async function handleInbound(message: InboundMessage): Promise<void> {
  try {
    await route(message);
  } catch (error) {
    console.error("[whatsapp] handler failed:", error);
    await logEvent({
      level: "ERROR",
      action: "whatsapp.handler.failed",
      entity: "WhatsappContact",
      entityId: message.waId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function route(message: InboundMessage): Promise<void> {
  const waId = message.waId;
  const phone = toDisplayPhone(waId);
  const now = new Date();

  // A runaway sender must not be able to burn the AI budget. Fails open when
  // Redis is absent, exactly like the web chat.
  const { allowed } = await rateLimit(`whatsapp:${waId}`, 20, 60);
  if (!allowed) {
    console.warn("[whatsapp] rate limited:", waId);
    return;
  }

  const contact = await upsertContact(message, phone);
  // Staff can silence a number without disconnecting the integration.
  if (contact.isBlocked) return;

  const botConfig = await getBotConfig();
  const text = stripRefCode(message.text);
  const { conversation, created } = await resolveConversation(message, phone, contact.profileName, botConfig.sources);

  // Idempotency gate. Meta redelivers until it sees a 200, and this insert is
  // the thing that makes a redelivery harmless: the second attempt violates the
  // unique index on `externalId` and we stop before answering twice.
  const stored = await recordInbound(conversation.id, message, text);
  if (!stored) return;

  void markAsRead(message.id).catch(() => {});

  const language = resolveLanguage(message, text, conversation.language);
  const capture = readCapture(conversation.capture);
  const state = readBotState(capture.bot);
  const history = await loadHistory(conversation.id);

  if (created) {
    await prisma.botEvent
      .create({
        data: {
          department: DEPARTMENT,
          type: "CONVERSATION_STARTED",
          conversationId: conversation.id,
          value: conversation.trafficSource ?? "DIRECT_WHATSAPP",
          metadata: conversation.campaign ? { campaign: conversation.campaign } : undefined,
        },
      })
      .catch(() => {});
  }

  const runtime = createWhatsAppRuntime({
    waId,
    phone,
    conversationId: conversation.id,
    profileName: contact.profileName ?? undefined,
    language,
    config: botConfig,
    history,
    leadId: capture.leadId,
    attribution: {
      trafficSource: conversation.trafficSource,
      campaign: conversation.campaign,
      adId: conversation.adId,
    },
    now,
  });

  const result = await runTurn(
    { kind: message.kind, text, replyId: message.replyId },
    {
      config: botConfig,
      language,
      phone,
      profileName: contact.profileName ?? undefined,
      isNewConversation: created,
      optedOut: contact.optedOut,
      botPaused: conversation.botPaused,
      details: capture.details,
      state,
      records: {
        lead: capture.leadReference,
        meeting: capture.meetingReference,
        ticket: capture.ticketReference,
      },
      now,
    },
    runtime
  );

  await saveTurn(conversation.id, result.details, result.state, runtime.records);
}

// ------------------------------------------------------------- Conversation --

async function upsertContact(message: InboundMessage, phone: string) {
  return prisma.whatsappContact.upsert({
    where: { waId: message.waId },
    update: {
      lastInboundAt: message.timestamp,
      // Only overwrite the stored name when WhatsApp actually sent one.
      ...(message.profileName ? { profileName: message.profileName } : {}),
    },
    create: {
      waId: message.waId,
      phone,
      profileName: message.profileName,
      department: DEPARTMENT,
      lastInboundAt: message.timestamp,
    },
  });
}

/**
 * Find the live thread for this number, or open a new one.
 *
 * Reusing a recent conversation is what gives WhatsApp genuine memory: the
 * assistant recalls the service discussed an hour ago, and the CRM shows one
 * coherent transcript instead of a row per message.
 *
 * A new thread is attributed once, from its first message. A thread that
 * belonged to the retired BITSOL Institute is never reused — the console hides
 * it, so continuing it would file new messages where nobody can see them.
 */
async function resolveConversation(
  message: InboundMessage,
  phone: string,
  profileName: string | null,
  sources: Parameters<typeof attribute>[1]
) {
  const since = new Date(Date.now() - THREAD_WINDOW_MS);

  const existing = await prisma.conversation.findFirst({
    where: {
      channel: "WHATSAPP",
      contactPhone: phone,
      updatedAt: { gte: since },
      OR: [{ department: DEPARTMENT }, { department: null }],
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    // The profile name often only arrives on a later delivery; backfill it so
    // the console shows a person rather than a number.
    if (profileName && !existing.contactName) {
      const conversation = await prisma.conversation.update({
        where: { id: existing.id },
        data: { contactName: profileName, title: `WhatsApp · ${profileName}` },
      });
      return { conversation, created: false };
    }
    return { conversation: existing, created: false };
  }

  const recentBroadcast = sources.broadcastAttributionDays
    ? await prisma.broadcastRecipient
        .findFirst({
          where: {
            waId: message.waId,
            sentAt: { gte: new Date(Date.now() - sources.broadcastAttributionDays * 86_400_000) },
          },
          orderBy: { sentAt: "desc" },
          select: { broadcast: { select: { title: true, reference: true } } },
        })
        .catch(() => null)
    : null;

  const attribution = attribute(
    {
      text: message.text,
      referral: message.referral,
      recentBroadcast: recentBroadcast?.broadcast,
    },
    sources
  );

  const conversation = await prisma.conversation.create({
    data: {
      reference: `WA-CONV-${shortId(10)}`,
      channel: "WHATSAPP",
      contactPhone: phone,
      contactName: profileName,
      department: DEPARTMENT,
      title: profileName ? `WhatsApp · ${profileName}` : `WhatsApp · ${phone}`,
      trafficSource: attribution.source,
      campaign: attribution.campaign ?? null,
      adId: attribution.adId ?? null,
      referral: (attribution.referral ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  return { conversation, created: true };
}

/**
 * Store the customer's message, keyed by Meta's message id.
 *
 * Returns false when the id is already present, which means this is a webhook
 * redelivery of something already answered.
 */
async function recordInbound(conversationId: string, message: InboundMessage, text: string): Promise<boolean> {
  const content =
    text ||
    (message.kind === "media" ? `[${message.mediaKind ?? "attachment"}]` : "[unsupported message]");

  try {
    await prisma.message.create({
      data: {
        conversationId,
        role: "USER",
        content,
        department: DEPARTMENT,
        language: LANGUAGE_MAP[detectLanguage(text)],
        externalId: message.id,
      },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      console.info("[whatsapp] duplicate delivery ignored:", message.id);
      return false;
    }
    throw error;
  }
}

/** The last turns of this thread, in the shape the AI layer expects. */
async function loadHistory(conversationId: string): Promise<ChatTurn[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId, role: { in: ["USER", "ASSISTANT"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { role: true, content: true },
  });

  return rows
    .reverse()
    .map((row) => ({
      role: row.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: row.content,
    }))
    .filter((turn) => turn.content.trim().length > 0);
}

/**
 * Language for this turn.
 *
 * A button tap carries no language signal — its id is always English — so the
 * conversation's stored language wins there; free text re-detects, which lets
 * someone switch from English to Urdu mid-thread. A two-word answer to a flow
 * question ("ABC Realtors") says little about language, so it keeps the
 * conversation's language unless it is clearly Urdu script.
 */
function resolveLanguage(message: InboundMessage, text: string, stored: PrismaLanguage): Language {
  const storedLanguage =
    (Object.entries(LANGUAGE_MAP).find(([, value]) => value === stored)?.[0] as Language | undefined) ?? "en";
  if (message.kind === "reply" || !text.trim()) return storedLanguage;

  const detected = detectLanguage(text);
  const words = text.trim().split(/\s+/).length;
  if (words <= 2 && detected !== "ur" && detected !== "pa") return storedLanguage;
  return detected;
}

/** Whether the bot should reply at all — the kill switch on the integration. */
export function autoReplyEnabled(): boolean {
  return config.whatsapp.enabled && config.whatsapp.autoReply;
}
