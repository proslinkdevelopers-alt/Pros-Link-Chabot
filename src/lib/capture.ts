import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { generateReference, truncate } from "@/lib/utils";
import { logEvent, notifyStaff, notifyTeam } from "@/lib/notify";
import { linkCustomer } from "@/lib/customers";
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
 *  The assistant gathers details in conversation and in short flows; this
 *  module keeps them on the conversation (`conversations.capture`) and turns
 *  them into the records the team works from:
 *
 *    • a **lead** once there is a name, a way to reach them and a need — or
 *      as soon as a flow that promises follow-up finishes,
 *    • an **appointment** once a demonstration or visit has a day and a time.
 *
 *  Quote requests and service tickets are created by the runtime when their
 *  flows finish. Every record is linked to one customer profile.
 *
 *  Each record is created once per conversation and then kept current as the
 *  customer adds or corrects details. Only fields the customer changed are
 *  written back, so a correction the team made in the console survives the
 *  next message.
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
  quoteId?: string;
  quoteReference?: string;
  customerId?: string;
  updatedAt?: string;
  /** The engine's own memory — `BotState` in `lib/bot/types.ts`. */
  bot?: unknown;
}

export type CaptureRecordKind = CapturedRecord["kind"];

export interface SyncOptions {
  only?: Array<"LEAD" | "MEETING">;
  /** Create the lead now, even without the conversational signals (a flow finished). */
  forceLead?: boolean;
  /** Move the lead to this stage if it is earlier in the pipeline. */
  stage?: "QUOTE_REQUESTED";
  /** Added to an appointment, e.g. what the customer said about the time. */
  meetingNotes?: string;
}

export interface CaptureContext {
  conversationId: string;
  source: "CHATBOT" | "WHATSAPP";
  /** What the channel knows without asking — a WhatsApp number and profile name. */
  fallback?: { name?: string; phone?: string };
  /** Team inboxes for email notifications. Omitted, the sales inbox. */
  notifyTo?: string[];
}

export interface CaptureResult {
  state: CaptureState;
  /** Records created by this sync — not the ones that already existed. */
  created: CapturedRecord[];
}

/** Narrow the untyped `conversations.capture` JSON column. */
export function readCapture(value: unknown): CaptureState {
  if (!value || typeof value !== "object") return { details: {} };
  const stored = value as Record<string, unknown>;
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
    quoteId: text("quoteId"),
    quoteReference: text("quoteReference"),
    customerId: text("customerId"),
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
    quote: state.quoteReference,
  };
}

const EARLY_STAGES = ["NEW", "CONTACTED", "QUALIFIED"] as const;

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
  const wants = (kind: "LEAD" | "MEETING") => !options.only || options.only.includes(kind);
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialise syncs for one conversation. Two WhatsApp messages sent a
      // second apart are handled concurrently, and without the row lock both
      // would see "no lead yet" and create one each.
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${context.conversationId} FOR UPDATE`;

      const row = await tx.conversation.findUnique({
        where: { id: context.conversationId },
        select: { capture: true, department: true },
      });
      if (!row || row.department !== DEPARTMENT) return null;

      const current = readCapture(row.capture);
      const previous = current.details;
      const details = mergeDetails(previous, incoming);
      const next: CaptureState = { ...current, details, updatedAt: new Date().toISOString() };
      const created: CreatedRecord[] = [];

      const name = details.name ?? context.fallback?.name;
      const phone = details.phone ?? context.fallback?.phone;
      const reachable = Boolean(phone || details.email || details.whatsapp);

      const customerId = async () => {
        if (next.customerId) return next.customerId;
        const id = await linkCustomer(tx, {
          name,
          phone,
          whatsapp: details.whatsapp ?? (context.source === "WHATSAPP" ? phone : undefined),
          email: details.email,
          company: details.company,
          city: details.city,
          address: details.address,
          businessType: details.businessType,
          source: context.source,
        });
        if (id) {
          next.customerId = id;
          await tx.conversation.update({ where: { id: context.conversationId }, data: { customerId: id } });
        }
        return id ?? undefined;
      };

      // --- Lead ---------------------------------------------------------------
      if (wants("LEAD") && (details.intent !== "SERVICE" || options.forceLead)) {
        const hasNeed = Boolean(details.productCategory || details.productId || details.interest || details.requirements);
        // Asking what a copier costs does not make someone a lead, even on
        // WhatsApp where their number is already known. Asking for a quotation
        // or a visit does, and so does giving a way to reach them.
        const interested =
          details.intent === "PURCHASE" || details.intent === "APPOINTMENT" || Boolean(details.phone || details.email);

        if (!next.leadId && ((name && reachable && hasNeed && interested) || options.forceLead)) {
          const reference = generateReference("LEAD");
          const columns = await leadColumns(tx, details);
          const lead = await tx.lead.create({
            data: {
              reference,
              department: DEPARTMENT,
              name: name ?? (context.source === "WHATSAPP" ? "WhatsApp contact" : "Website visitor"),
              phone: phone ?? "",
              ...columns,
              source: context.source,
              stage: options.stage ?? "NEW",
              conversationId: context.conversationId,
              customerId: (await customerId()) ?? null,
            },
            select: { id: true },
          });
          next.leadId = lead.id;
          next.leadReference = reference;
          created.push({ kind: "LEAD", id: lead.id, reference });
        } else if (next.leadId) {
          const changes: Prisma.LeadUncheckedUpdateManyInput = (await changedLeadColumns(tx, previous, details)) ?? {};
          if (!(await tx.lead.findFirst({ where: { id: next.leadId }, select: { customerId: true } }))?.customerId) {
            const id = await customerId();
            if (id) changes.customerId = id;
          }
          if (Object.keys(changes).length) {
            await tx.lead.updateMany({ where: { id: next.leadId, department: DEPARTMENT }, data: changes });
          }
          if (options.stage) {
            await tx.lead.updateMany({
              where: { id: next.leadId, department: DEPARTMENT, stage: { in: [...EARLY_STAGES] } },
              data: { stage: options.stage },
            });
          }
        }
      }

      // --- Appointment --------------------------------------------------------
      if (wants("MEETING") && details.meetingDate && details.meetingTime && name && reachable) {
        const slot = {
          preferredDate: new Date(`${details.meetingDate}T00:00:00Z`),
          preferredTime: details.meetingTime,
          mode: details.meetingMode ?? ("PHONE_CALL" as const),
          notes:
            [
              details.meetingMode ? null : "Appointment type not stated — confirm it with the customer.",
              details.address ? `Address: ${details.address}` : null,
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
              topic: appointmentTopic(details),
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
          if (slotChanged) {
            // Only while the team hasn't confirmed it — a confirmed appointment is theirs.
            const { notes: _notes, ...changedSlot } = slot;
            await tx.meeting.updateMany({ where: { id: next.meetingId, status: "REQUESTED" }, data: changedSlot });
          }
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
  | "whatsapp"
  | "businessType"
  | "budget"
  | "timeline"
  | "requirements"
  | "website"
  | "country"
  | "city"
  | "subService"
  | "productCategoryId"
  | "productId"
  | "quantity"
  | "preferredContact"
  | "intent"
  | "companySize"
>;

/** Catalogue ids for the category slug and product id the customer chose, in this tenant. */
async function catalogIds(tx: Prisma.TransactionClient, details: CustomerDetails) {
  const [category, product] = await Promise.all([
    details.productCategory
      ? tx.productCategory.findFirst({ where: { department: DEPARTMENT, slug: details.productCategory }, select: { id: true } })
      : null,
    details.productId
      ? tx.product.findFirst({ where: { department: DEPARTMENT, id: details.productId }, select: { id: true } })
      : null,
  ]);
  return { productCategoryId: category?.id ?? null, productId: product?.id ?? null };
}

async function leadColumns(tx: Prisma.TransactionClient, details: CustomerDetails): Promise<LeadColumns> {
  return {
    company: details.company ?? null,
    email: details.email ?? null,
    whatsapp: details.whatsapp ?? null,
    businessType: details.businessType ?? null,
    budget: details.budget ?? null,
    timeline: details.timeline ?? null,
    requirements: requirementsFor(details),
    website: details.website ?? null,
    country: details.country ?? null,
    city: details.city ?? null,
    subService: details.interest ?? null,
    quantity: details.quantity ?? null,
    preferredContact: details.preferredContact ?? null,
    intent: details.topic ?? null,
    companySize: details.companySize ?? null,
    ...(await catalogIds(tx, details)),
  };
}

/** The columns whose customer-side value changed this turn, or null if none did. */
async function changedLeadColumns(
  tx: Prisma.TransactionClient,
  previous: CustomerDetails,
  next: CustomerDetails
): Promise<Prisma.LeadUncheckedUpdateManyInput | null> {
  const before = await leadColumns(tx, previous);
  const after = await leadColumns(tx, next);
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

/** The lead's free-text column: what they want, plus details that have no column of their own. */
export function requirementsFor(details: CustomerDetails): string {
  const need =
    details.requirements ??
    (details.intent === "APPOINTMENT"
      ? "Asked for a demonstration or visit."
      : details.interest
        ? `Interested in ${details.interest}.`
        : "Shared their details with the assistant.");

  return [
    need,
    details.meetingDate
      ? `Preferred appointment: ${details.meetingDate}${details.meetingTime ? ` at ${details.meetingTime}` : ""}${
          details.meetingMode ? ` (${MEETING_MODE_LABEL[details.meetingMode]})` : ""
        }`
      : null,
    details.address ? `Address: ${details.address}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function appointmentTopic(details: CustomerDetails): string | null {
  const topic = [details.interest, details.requirements].filter(Boolean).join(" — ");
  return topic ? truncate(topic, 500) : null;
}

// ---------------------------------------------------------- Notifications ---

async function announce(record: CreatedRecord, details: CustomerDetails, context: CaptureContext): Promise<void> {
  const name = details.name ?? context.fallback?.name ?? "Unknown";
  const phone = details.phone ?? context.fallback?.phone;
  const channel = context.source === "WHATSAPP" ? "WhatsApp" : "the website assistant";

  const contactLines = [
    `Name: ${name}`,
    phone ? `Phone: ${phone}` : null,
    details.whatsapp && details.whatsapp !== phone ? `WhatsApp: ${details.whatsapp}` : null,
    details.email ? `Email: ${details.email}` : null,
    details.company ? `Company: ${details.company}` : null,
    details.city ? `City: ${details.city}` : null,
  ];

  if (record.kind === "LEAD") {
    const link = `/admin/leads/${record.id}`;
    const subject = `New lead ${record.reference} — ${name}${details.company ? ` (${details.company})` : ""}`;
    await notifyTeam({
      to: context.notifyTo,
      subject,
      body: [
        `Reference: ${record.reference}`,
        `Captured on ${channel}.`,
        "",
        ...contactLines,
        details.interest ? `Interested in: ${details.interest}` : null,
        details.quantity ? `Quantity: ${details.quantity}` : null,
        details.budget ? `Budget: ${details.budget}` : null,
        details.preferredContact ? `Preferred contact: ${details.preferredContact}` : null,
        "",
        "Requirement:",
        requirementsFor(details),
      ]
        .filter((line) => line !== null)
        .join("\n"),
      link,
    });
    await notifyStaff({ permission: "leads.manage", subject, body: details.interest ?? requirementsFor(details), link });
    await logEvent({
      action: "lead.created",
      entity: "Lead",
      entityId: record.id,
      message: `Lead ${record.reference} captured on ${channel}.`,
      metadata: { reference: record.reference, category: details.productCategory, source: context.source },
    });
    return;
  }

  const subject = `Appointment request ${record.reference} — ${name} (${details.meetingDate} ${details.meetingTime})`;
  await notifyTeam({
    to: context.notifyTo,
    subject,
    body: [
      `Reference: ${record.reference}`,
      `Requested on ${channel}. Confirm the day and time with the customer.`,
      "",
      ...contactLines,
      `Preferred: ${details.meetingDate} at ${details.meetingTime}`,
      `Type: ${details.meetingMode ? MEETING_MODE_LABEL[details.meetingMode] : "Not stated"}`,
      details.interest ? `About: ${details.interest}` : null,
    ]
      .filter((line) => line !== null)
      .join("\n"),
    link: "/admin/appointments",
  });
  await notifyStaff({ permission: "appointments.manage", subject, link: "/admin/appointments" });
  await logEvent({
    action: "appointment.requested",
    entity: "Meeting",
    entityId: record.id,
    message: `Appointment ${record.reference} requested on ${channel}.`,
    metadata: { reference: record.reference, mode: details.meetingMode, source: context.source },
  });
}

// ------------------------------------------------------------- Turn state ---

/**
 * Store the customer's details and the engine's memory at the end of a turn.
 * Locked like `syncCapture`, and the record references written during the
 * turn are kept.
 */
export async function saveTurn(
  conversationId: string,
  details: CustomerDetails,
  bot: unknown,
  records: Partial<Pick<CaptureState, "ticketId" | "ticketReference" | "meetingId" | "meetingReference" | "quoteId" | "quoteReference" | "customerId">> = {},
  intent?: string
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
        data: {
          capture: next as unknown as Prisma.InputJsonValue,
          ...(intent ? { intent } : {}),
          ...(records.customerId ? { customerId: records.customerId } : {}),
        },
      });
    });
  } catch (error) {
    console.warn(
      "[capture] turn save skipped:",
      error instanceof Error ? error.message.split("\n").find(Boolean) : String(error)
    );
  }
}
