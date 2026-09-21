import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { generateReference, truncate } from "@/lib/utils";
import { logEvent, notifyTeam } from "@/lib/notify";
import { findService } from "@/data/marketing/services";
import {
  MEETING_MODE_LABEL,
  asCustomerDetails,
  mergeDetails,
  todayInPakistan,
  type CustomerDetails,
} from "@/lib/ai/customer";
import type { CustomerContext } from "@/lib/ai/system-prompt";
import type { CapturedRecord } from "@/types";

/**
 * =============================================================================
 *  Conversation capture → CRM
 * =============================================================================
 *
 *  The representative gathers details in conversation; `customer.ts` reads them
 *  back out after every turn. This module keeps them on the conversation
 *  (`conversations.capture`) and turns them into the records the team works
 *  from, the moment there is enough to act on:
 *
 *    • a **lead** once there is a name, a way to reach them and a need,
 *    • a **meeting request** once a consultation has a day and a time,
 *    • a **support ticket** once an existing client has described a problem.
 *
 *  Each is created once per conversation and then kept current as the customer
 *  adds or corrects details. Only fields the customer changed are written back,
 *  so a correction the team made in the console survives the next message.
 * =============================================================================
 */

export interface CaptureState {
  details: CustomerDetails;
  leadId?: string;
  leadReference?: string;
  meetingId?: string;
  meetingReference?: string;
  ticketId?: string;
  ticketReference?: string;
  updatedAt?: string;
  /** The WhatsApp assistant's own memory — `BotState` in `lib/bot/types.ts`. */
  bot?: unknown;
}

export type CaptureRecordKind = CapturedRecord["kind"];

/** Narrow what a sync may create — the WhatsApp assistant creates meetings and tickets itself. */
export interface SyncOptions {
  only?: CaptureRecordKind[];
  /** Create the lead now, even without the conversational signals (a flow finished). */
  forceLead?: boolean;
  ticket?: {
    subject?: string;
    description?: string;
    priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  };
  /** Added to a meeting the assistant creates, e.g. what the customer said about the time. */
  meetingNotes?: string;
}

export interface CaptureContext {
  conversationId: string;
  source: "CHATBOT" | "WHATSAPP";
  /** What the channel knows without asking — a WhatsApp number and profile name. */
  fallback?: { name?: string; phone?: string };
  /** Who hears about records this sync creates. Omitted, the sales inbox. */
  notifyTo?: string[];
}

export interface CaptureResult {
  state: CaptureState;
  /** Records created by this sync — not the ones that already existed. */
  created: CapturedRecord[];
}

/**
 * Narrow the untyped `conversations.capture` JSON column.
 *
 * WhatsApp captures written by the old one-question-per-message flow
 * (`{ flow, step, answers }`) are read as details, so a customer who was half
 * way through it is not asked the same things again.
 */
export function readCapture(value: unknown): CaptureState {
  if (!value || typeof value !== "object") return { details: {} };
  const stored = value as Record<string, unknown>;

  if (stored.flow === "LEAD" && stored.answers && typeof stored.answers === "object") {
    const answers = stored.answers as Record<string, unknown>;
    return {
      details: asCustomerDetails({
        name: answers.name,
        company: answers.company,
        phone: answers.phone,
        service: typeof answers.service === "string" && findService(answers.service) ? answers.service : undefined,
        budget: answers.budget,
        timeline: answers.timeline,
        requirements: answers.requirements,
      }),
    };
  }
  // Anything else without details (an Institute admission capture) starts fresh.
  if (!stored.details) return { details: {} };

  const text = (key: string) => (typeof stored[key] === "string" ? (stored[key] as string) : undefined);
  return {
    details: asCustomerDetails(stored.details),
    leadId: text("leadId"),
    leadReference: text("leadReference"),
    meetingId: text("meetingId"),
    meetingReference: text("meetingReference"),
    ticketId: text("ticketId"),
    ticketReference: text("ticketReference"),
    updatedAt: text("updatedAt"),
    bot: stored.bot,
  };
}

/** The record references a capture has produced, in the shape the prompt takes. */
export function recordsOf(state: CaptureState): CustomerContext["records"] {
  return {
    lead: state.leadReference,
    meeting: state.meetingReference,
    ticket: state.ticketReference,
  };
}

/**
 * Merge newly extracted details into the conversation and create or update the
 * CRM records they justify. Never throws — a CRM write failing must not take a
 * conversation down with it.
 */
export async function syncCapture(
  context: CaptureContext,
  incoming: CustomerDetails,
  options: SyncOptions = {}
): Promise<CaptureResult | null> {
  const wants = (kind: CaptureRecordKind) => !options.only || options.only.includes(kind);
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialise syncs for one conversation. Two WhatsApp messages sent a
      // second apart are handled concurrently, and without the row lock both
      // would see "no lead yet" and create one each.
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${context.conversationId} FOR UPDATE`;

      const row = await tx.conversation.findUnique({
        where: { id: context.conversationId },
        select: { capture: true },
      });
      if (!row) return null;

      const current = readCapture(row.capture);
      const previous = current.details;
      const details = mergeDetails(previous, incoming);
      const next: CaptureState = { ...current, details, updatedAt: new Date().toISOString() };
      const created: CreatedRecord[] = [];

      const name = details.name ?? context.fallback?.name;
      const phone = details.phone ?? context.fallback?.phone;
      const reachable = Boolean(phone || details.email);

      // --- Lead ---------------------------------------------------------------
      if (wants("LEAD") && (details.intent !== "SUPPORT" || options.forceLead)) {
        const hasNeed = Boolean(details.service || details.requirements || details.intent === "CONSULTATION");
        // Asking what a website costs does not make someone a lead, even on
        // WhatsApp where their number is already known. Asking for the work
        // does, and so does giving us a way to reach them.
        const interested =
          details.intent === "PROJECT" ||
          details.intent === "CONSULTATION" ||
          Boolean(details.phone || details.email);

        if (!next.leadId && ((name && reachable && hasNeed && interested) || options.forceLead)) {
          const reference = generateReference("LEAD");
          const lead = await tx.lead.create({
            data: {
              reference,
              department: DEPARTMENT,
              name: name ?? "WhatsApp contact",
              phone: phone ?? "",
              ...leadColumns(details),
              source: context.source,
              stage: "NEW",
              conversationId: context.conversationId,
            },
            select: { id: true },
          });
          next.leadId = lead.id;
          next.leadReference = reference;
          created.push({ kind: "LEAD", id: lead.id, reference });
        } else if (next.leadId) {
          const changes = changedLeadColumns(previous, details);
          if (changes) {
            await tx.lead.updateMany({ where: { id: next.leadId }, data: changes });
          }
        }
      }

      // --- Meeting request ----------------------------------------------------
      if (wants("MEETING") && details.meetingDate && details.meetingTime && name && reachable) {
        const slot = {
          preferredDate: new Date(`${details.meetingDate}T00:00:00Z`),
          preferredTime: details.meetingTime,
          mode: details.meetingMode ?? ("ZOOM" as const),
          notes:
            [
              details.meetingMode ? null : "Meeting type not stated — confirm it with the customer.",
              options.meetingNotes ?? null,
            ]
              .filter(Boolean)
              .join("\n") || null,
        };

        if (!next.meetingId && details.meetingDate >= todayInPakistan().iso) {
          const reference = generateReference("MTG");
          const meeting = await tx.meeting.create({
            data: {
              reference,
              department: DEPARTMENT,
              name,
              phone: phone ?? "",
              email: details.email ?? null,
              businessName: details.company ?? null,
              topic: meetingTopic(details),
              status: "REQUESTED",
              leadId: next.leadId ?? null,
              conversationId: context.conversationId,
              ...slot,
            },
            select: { id: true },
          });
          next.meetingId = meeting.id;
          next.meetingReference = reference;
          created.push({ kind: "MEETING", id: meeting.id, reference });
        } else if (next.meetingId) {
          const slotChanged =
            previous.meetingDate !== details.meetingDate ||
            previous.meetingTime !== details.meetingTime ||
            previous.meetingMode !== details.meetingMode;
          const contactChanged =
            previous.name !== details.name ||
            previous.phone !== details.phone ||
            previous.email !== details.email;

          if (slotChanged || contactChanged) {
            // Only while the team hasn't confirmed it — a confirmed meeting is
            // theirs. Notes are left alone: by now they may be the team's.
            const { notes: _notes, ...changedSlot } = slot;
            await tx.meeting.updateMany({
              where: { id: next.meetingId, status: "REQUESTED" },
              data: {
                ...(slotChanged ? changedSlot : {}),
                ...(contactChanged ? { name, phone: phone ?? "", email: details.email ?? null } : {}),
              },
            });
          }
        }
      }

      // --- Support ticket -----------------------------------------------------
      if (wants("TICKET") && details.intent === "SUPPORT" && details.requirements && reachable) {
        const contact = {
          contactName: name ?? null,
          contactPhone: phone ?? null,
          contactEmail: details.email ?? null,
        };

        if (!next.ticketId) {
          const reference = generateReference("TKT");
          const category = details.supportCategory ?? "GENERAL";
          const ticket = await tx.ticket.create({
            data: {
              reference,
              department: DEPARTMENT,
              category,
              status: "OPEN",
              priority: options.ticket?.priority ?? (category === "COMPLAINT" ? "HIGH" : "NORMAL"),
              subject: truncate(options.ticket?.subject ?? details.requirements, 120),
              description: options.ticket?.description ?? details.requirements,
              conversationId: context.conversationId,
              ...contact,
            },
            select: { id: true },
          });
          next.ticketId = ticket.id;
          next.ticketReference = reference;
          created.push({ kind: "TICKET", id: ticket.id, reference });
        } else if (
          previous.requirements !== details.requirements ||
          previous.phone !== details.phone ||
          previous.email !== details.email ||
          previous.name !== details.name
        ) {
          await tx.ticket.updateMany({
            where: { id: next.ticketId, status: "OPEN" },
            data: { description: details.requirements, ...contact },
          });
        }
      }

      await tx.conversation.update({
        where: { id: context.conversationId },
        data: { capture: next as unknown as Prisma.InputJsonValue },
      });

      return { state: next, created };
    });

    if (!result) return null;

    for (const record of result.created) {
      await announce(record, result.state.details, context);
    }

    return {
      state: result.state,
      created: result.created.map(({ kind, reference }) => ({ kind, reference })),
    };
  } catch (error) {
    console.warn(
      "[capture] sync skipped:",
      error instanceof Error ? error.message.split("\n").find(Boolean) : String(error)
    );
    return null;
  }
}

// ------------------------------------------------------------------ Leads ---

interface CreatedRecord extends CapturedRecord {
  id: string;
}

type LeadColumns = Pick<
  Prisma.LeadUncheckedCreateInput,
  | "company"
  | "email"
  | "businessType"
  | "serviceSlug"
  | "budget"
  | "timeline"
  | "requirements"
  | "website"
  | "country"
  | "city"
  | "subService"
  | "intent"
  | "businessGoal"
  | "challenge"
  | "companySize"
>;

function leadColumns(details: CustomerDetails): LeadColumns {
  return {
    company: details.company ?? null,
    email: details.email ?? null,
    businessType: details.businessType ?? null,
    serviceSlug: details.service ?? null,
    budget: details.budget ?? null,
    timeline: details.timeline ?? null,
    requirements: requirementsFor(details),
    website: details.website ?? null,
    country: details.country ?? null,
    city: details.city ?? null,
    subService: details.subService ?? null,
    intent: details.topic ?? null,
    businessGoal: details.businessGoal ?? null,
    challenge: details.challenge ?? null,
    companySize: details.companySize ?? null,
  };
}

/** The columns whose customer-side value changed this turn, or null if none did. */
function changedLeadColumns(
  previous: CustomerDetails,
  next: CustomerDetails
): Prisma.LeadUpdateManyMutationInput | null {
  const before = leadColumns(previous);
  const after = leadColumns(next);
  const changes: Record<string, string | null> = {};

  for (const key of Object.keys(after) as Array<keyof LeadColumns>) {
    if (after[key] !== before[key] && after[key] != null) {
      changes[key] = after[key] as string;
    }
  }
  if (next.name && next.name !== previous.name) changes.name = next.name;
  if (next.phone && next.phone !== previous.phone) changes.phone = next.phone;

  return Object.keys(changes).length ? changes : null;
}

/** The lead's free-text column: what they want, plus the details that have no column. */
function requirementsFor(details: CustomerDetails): string {
  const need =
    details.requirements ??
    (details.intent === "CONSULTATION"
      ? "Asked for a free consultation."
      : "Shared their details with the assistant.");

  return [
    need,
    details.customerType ? `Customers they want: ${details.customerType}` : null,
    details.leadChannel ? `Current lead source: ${details.leadChannel}` : null,
    details.monthlyLeads ? `Monthly leads needed: ${details.monthlyLeads}` : null,
    details.currentMarketing ? `Current marketing: ${details.currentMarketing}` : null,
    details.monthlyAdSpend ? `Monthly ad spend: ${details.monthlyAdSpend}` : null,
    details.platform ? `Platform: ${details.platform}` : null,
    details.features ? `Features: ${details.features}` : null,
    details.meetingDate
      ? `Preferred consultation: ${details.meetingDate}${details.meetingTime ? ` at ${details.meetingTime}` : ""}${
          details.meetingMode ? ` (${MEETING_MODE_LABEL[details.meetingMode]})` : ""
        }`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function meetingTopic(details: CustomerDetails): string | null {
  const service = details.service ? findService(details.service)?.name : undefined;
  const topic = [service, details.requirements].filter(Boolean).join(" — ");
  return topic ? truncate(topic, 500) : null;
}

// ---------------------------------------------------------- Notifications ---

async function announce(
  record: CreatedRecord,
  details: CustomerDetails,
  context: CaptureContext
): Promise<void> {
  const name = details.name ?? context.fallback?.name ?? "Unknown";
  const phone = details.phone ?? context.fallback?.phone;
  const channel = context.source === "WHATSAPP" ? "WhatsApp" : "the website assistant";
  const service = details.service ? findService(details.service)?.name : undefined;

  const contactLines = [
    `Name: ${name}`,
    phone ? `Phone: ${phone}` : null,
    details.email ? `Email: ${details.email}` : null,
    details.company ? `Business: ${details.company}` : null,
    details.businessType ? `Type of business: ${details.businessType}` : null,
    details.city ? `City: ${details.city}` : null,
  ];

  if (record.kind === "LEAD") {
    await notifyTeam({
      to: context.notifyTo,
      subject: `New lead ${record.reference} — ${name}${details.company ? ` (${details.company})` : ""}`,
      body: [
        `Reference: ${record.reference}`,
        `Captured in conversation on ${channel}.`,
        "",
        ...contactLines,
        service ? `Service: ${service}` : null,
        details.budget ? `Budget: ${details.budget}` : null,
        details.timeline ? `Timeline: ${details.timeline}` : null,
        "",
        "What they need:",
        requirementsFor(details),
      ]
        .filter((line) => line !== null)
        .join("\n"),
      link: `/admin/crm/leads/${record.id}`,
    });
    await logEvent({
      action: "lead.created",
      entity: "Lead",
      entityId: record.id,
      message: `Lead ${record.reference} captured in conversation on ${channel}.`,
      metadata: { reference: record.reference, service: details.service, source: context.source },
    });
    return;
  }

  if (record.kind === "MEETING") {
    await notifyTeam({
      to: context.notifyTo,
      subject: `Consultation request ${record.reference} — ${name} (${details.meetingDate} ${details.meetingTime})`,
      body: [
        `Reference: ${record.reference}`,
        `Requested in conversation on ${channel}. Confirm the slot with the customer.`,
        "",
        ...contactLines,
        `Preferred: ${details.meetingDate} at ${details.meetingTime}`,
        `Type: ${details.meetingMode ? MEETING_MODE_LABEL[details.meetingMode] : "Not stated"}`,
        details.requirements ? `\nTopic:\n${details.requirements}` : null,
      ]
        .filter((line) => line !== null)
        .join("\n"),
      link: `/admin/meetings`,
    });
    await logEvent({
      action: "meeting.requested",
      entity: "Meeting",
      entityId: record.id,
      message: `Consultation ${record.reference} requested in conversation on ${channel}.`,
      metadata: { reference: record.reference, mode: details.meetingMode, source: context.source },
    });
    return;
  }

  await notifyTeam({
    to: context.notifyTo,
    subject: `New ${(details.supportCategory ?? "GENERAL").toLowerCase()} ticket ${record.reference} — ${truncate(details.requirements ?? "", 60)}`,
    body: [
      `Reference: ${record.reference}`,
      `Raised in conversation on ${channel}.`,
      "",
      ...contactLines,
      "",
      details.requirements ?? "",
    ]
      .filter((line) => line !== null)
      .join("\n"),
    link: `/admin/support/tickets`,
  });
  await logEvent({
    action: "ticket.created",
    entity: "Ticket",
    entityId: record.id,
    message: `Ticket ${record.reference} raised in conversation on ${channel}.`,
    metadata: { reference: record.reference, category: details.supportCategory, source: context.source },
  });
}

// ------------------------------------------------------------- Turn state ---

/**
 * Store the customer's details and the assistant's memory at the end of a
 * WhatsApp turn. Locked like `syncCapture`, and the record references a sync
 * wrote during the turn are kept.
 */
export async function saveTurn(
  conversationId: string,
  details: CustomerDetails,
  bot: unknown,
  records: Partial<Pick<CaptureState, "ticketId" | "ticketReference" | "meetingId" | "meetingReference">> = {}
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId} FOR UPDATE`;
      const row = await tx.conversation.findUnique({ where: { id: conversationId }, select: { capture: true } });
      if (!row) return;
      const current = readCapture(row.capture);
      const next: CaptureState = {
        ...current,
        ...Object.fromEntries(Object.entries(records).filter(([, value]) => value)),
        details,
        bot,
        updatedAt: new Date().toISOString(),
      };
      await tx.conversation.update({
        where: { id: conversationId },
        data: { capture: next as unknown as Prisma.InputJsonValue },
      });
    });
  } catch (error) {
    console.warn(
      "[capture] turn save skipped:",
      error instanceof Error ? error.message.split("\n").find(Boolean) : String(error)
    );
  }
}
