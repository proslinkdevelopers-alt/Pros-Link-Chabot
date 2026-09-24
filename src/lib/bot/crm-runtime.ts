import type { LeadStage, Prisma, Priority, TicketCategory, TicketStatus, TrafficSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config as appConfig } from "@/lib/config";
import { DEPARTMENT } from "@/config/brand";
import type { Language } from "@/lib/i18n";
import { logEvent, notifyStaff, notifyTeam } from "@/lib/notify";
import { generateReference, truncate } from "@/lib/utils";
import { syncCapture, type CaptureContext } from "@/lib/capture";
import { linkCustomer, phoneTail } from "@/lib/customers";
import { findProduct, listProducts } from "@/lib/catalog";
import type { ChatTurn } from "@/lib/ai";
import { extractCustomerDetails, type CustomerDetails } from "@/lib/ai/customer";
import type { Permission } from "@/lib/permissions";
import type { CapturedRecord } from "@/types";
import type { BotRuntime, CompanyContact, Effect, EffectResult, TrackResult } from "./engine";
import { teamRecipients } from "./prompt";
import { transcriptOf, type Outgoing } from "./render";
import type { LeadScore } from "./scoring";
import type { BotConfig } from "./schema";
import { machineLine } from "./summary";
import type { SupportCategory, TeamKey, Temperature } from "./types";

/**
 * =============================================================================
 *  CRM runtime — the engine's hands, on any channel
 * =============================================================================
 *
 *  Everything the conversation engine asks for, done for real: messages go out
 *  through the channel's `deliver` and into the transcript, the catalogue is
 *  read, and CRM effects become leads, quote requests, service tickets,
 *  appointments, handovers and notifications for the right team — identically
 *  for WhatsApp and the web assistant.
 *
 *  Nothing here throws. A failed CRM write is logged and the conversation
 *  carries on — the customer must still get a reply.
 * =============================================================================
 */

const LANGUAGE_MAP = { en: "EN", ur: "UR", ur_roman: "UR_ROMAN", pa: "PA" } as const;

export interface DeliveryResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface CrmRuntimeContext {
  channel: "WEB" | "WHATSAPP";
  conversationId: string;
  /** The WhatsApp number (`+923001234567`); empty on the web. */
  phone: string;
  /** Meta's wa_id, on WhatsApp. */
  waId?: string;
  profileName?: string;
  language: Language;
  config: BotConfig;
  company: CompanyContact;
  categories: Array<{ slug: string; name: string }>;
  /** The thread so far, including the message being handled. */
  history: ChatTurn[];
  leadId?: string;
  customerId?: string;
  attribution?: { trafficSource: TrafficSource | null; campaign: string | null; adId: string | null };
  now: Date;
  /** Put one message in front of the customer. */
  deliver(message: Outgoing): Promise<DeliveryResult>;
}

export interface CrmRuntime extends BotRuntime {
  /** References written this turn, for the conversation's capture. */
  records: {
    ticketId?: string;
    ticketReference?: string;
    meetingId?: string;
    meetingReference?: string;
    quoteId?: string;
    quoteReference?: string;
    customerId?: string;
  };
  /** Records created this turn — shown as receipts in the web assistant. */
  created: CapturedRecord[];
}

/** Ticket categories that are service work rather than support requests. */
export const SERVICE_CATEGORIES: TicketCategory[] = ["INSTALLATION", "TECHNICAL", "MAINTENANCE", "REPAIR", "SERVICE", "PARTS"];

const TICKET_STATUS: Record<TicketStatus, { label: string; next?: string }> = {
  OPEN: { label: "Received", next: "Our team will review it and contact you." },
  ASSIGNED: { label: "Assigned to our team", next: "The person handling it will contact you." },
  IN_PROGRESS: { label: "In progress" },
  WAITING_CUSTOMER: { label: "Waiting for your reply", next: "Our team needs something from you — please reply here or wait for their call." },
  TECHNICIAN_DISPATCHED: { label: "Technician dispatched", next: "A technician is on the way or scheduled to visit." },
  RESOLVED: { label: "Resolved", next: "If the problem is back, reply here and we'll reopen it." },
  CLOSED: { label: "Closed" },
};

const QUOTE_STATUS: Record<string, string> = {
  REQUESTED: "Received",
  DRAFT: "Being prepared",
  SENT: "Sent to you",
  ACCEPTED: "Accepted",
  REJECTED: "Declined",
  EXPIRED: "Expired",
};

const LEAD_STATUS: Partial<Record<LeadStage, string>> = {
  NEW: "Received",
  CONTACTED: "In progress",
  QUALIFIED: "In progress",
  QUOTE_REQUESTED: "Quotation being prepared",
  QUOTED: "Quotation sent",
  NEGOTIATION: "In discussion",
  WON: "Completed",
  LOST: "Closed",
  SPAM: "Closed",
  OPTED_OUT: "Closed",
};

const MEETING_STATUS: Record<string, string> = {
  REQUESTED: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  RESCHEDULED: "Rescheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "Missed",
};

/** Whose in-app notifications a team's work belongs to. */
const TEAM_PERMISSION: Record<TeamKey, Permission> = {
  SALES: "leads.manage",
  CORPORATE: "leads.manage",
  SERVICE: "tickets.manage",
  SUPPORT: "tickets.manage",
  PARTS: "tickets.manage",
  ACCOUNTS: "tickets.manage",
};

export function createCrmRuntime(ctx: CrmRuntimeContext): CrmRuntime {
  const { config } = ctx;
  let leadId = ctx.leadId;
  const records: CrmRuntime["records"] = { customerId: ctx.customerId };
  const created: CapturedRecord[] = [];
  const whatsapp = ctx.channel === "WHATSAPP";
  const source = whatsapp ? ("WHATSAPP" as const) : ("CHATBOT" as const);

  const capture: CaptureContext = {
    conversationId: ctx.conversationId,
    source,
    fallback: { name: ctx.profileName, phone: whatsapp ? ctx.phone : undefined },
  };

  const teamLabel = (team: TeamKey) => config.teams[team]?.label ?? team;
  const recipients = (team: TeamKey) => teamRecipients(config, team, appConfig.routing.salesEmail);
  const customerName = (details: CustomerDetails) => details.name ?? ctx.profileName ?? (ctx.phone || "Website visitor");
  const customerPhone = (details: CustomerDetails) => details.phone ?? (whatsapp ? ctx.phone : undefined);
  const lastCustomerMessage = () => [...ctx.history].reverse().find((turn) => turn.role === "user")?.content ?? "";
  const channelName = whatsapp ? "WhatsApp" : "the website assistant";

  // ---------------------------------------------------------------- Send ---

  async function send(message: Outgoing): Promise<void> {
    const result = await ctx.deliver(message).catch(
      (error: unknown): DeliveryResult => ({ ok: false, error: error instanceof Error ? error.message : String(error) })
    );
    const content = transcriptOf(message);
    ctx.history.push({ role: "assistant", content });

    await prisma.message
      .create({
        data: {
          conversationId: ctx.conversationId,
          role: "ASSISTANT",
          content,
          department: DEPARTMENT,
          language: LANGUAGE_MAP[ctx.language],
          externalId: result.messageId,
        },
      })
      .catch((error) => console.warn("[bot] transcript write skipped:", error?.message));

    await prisma.conversation
      .update({ where: { id: ctx.conversationId }, data: { language: LANGUAGE_MAP[ctx.language], updatedAt: new Date() } })
      .catch(() => {});

    if (result.ok) {
      if (whatsapp && ctx.waId) {
        await prisma.whatsappContact.update({ where: { waId: ctx.waId }, data: { lastOutboundAt: new Date() } }).catch(() => {});
      }
      return;
    }

    // A failed send is invisible from the outside — the customer simply gets
    // nothing — so it is recorded with the cause.
    await logEvent({
      level: "ERROR",
      action: `${whatsapp ? "whatsapp" : "chat"}.send.failed`,
      entity: "Conversation",
      entityId: ctx.conversationId,
      message: result.error ?? "Unknown error delivering the message.",
      metadata: { to: ctx.phone || undefined, shape: message.type },
    });
  }

  // -------------------------------------------------------- Understanding ---

  /** Phone numbers, emails and references the customer typed. */
  const extract = async (known: CustomerDetails) =>
    extractCustomerDetails(ctx.history, known, {
      brandPhones: [ctx.company.phone, ctx.company.whatsapp, ...ctx.company.offices.map((office) => office.phone)].filter(Boolean),
      brandEmail: ctx.company.email,
    });

  /** The customer's last few messages, for the person taking over. */
  const summarize = async () =>
    ctx.history
      .filter((turn) => turn.role === "user")
      .slice(-4)
      .map((turn) => `“${truncate(turn.content, 200)}”`)
      .join(" · ");

  // ------------------------------------------------------------ Catalogue ---

  const products = (categorySlug: string) => listProducts(categorySlug);
  const product = (id: string) => findProduct(id);

  // ------------------------------------------------------------- Tracking ---

  /** Status of a request — only when `phone` is the number it was made with. */
  async function track(reference: string, phone: string): Promise<TrackResult> {
    const tail = phoneTail(phone);
    const ref = reference.trim().toUpperCase();
    if (!tail || !/^[A-Z]{2}-(TKT|QTE|LEAD|MTG)-[A-Z2-9]{6,10}$/.test(ref)) return { found: false };
    const matches = (...numbers: Array<string | null | undefined>) => numbers.some((number) => phoneTail(number) === tail);

    try {
      switch (ref.split("-")[1]) {
        case "TKT": {
          const ticket = await prisma.ticket.findFirst({
            where: { reference: ref, department: DEPARTMENT },
            select: { status: true, category: true, updatedAt: true, contactPhone: true, customer: { select: { phone: true, whatsapp: true } } },
          });
          if (!ticket || !matches(ticket.contactPhone, ticket.customer?.phone, ticket.customer?.whatsapp)) return { found: false };
          const status = TICKET_STATUS[ticket.status];
          return {
            found: true,
            reference: ref,
            kind: SERVICE_CATEGORIES.includes(ticket.category) ? "Service ticket" : "Support request",
            status: status.label,
            updatedAt: ticket.updatedAt,
            next: status.next,
          };
        }
        case "QTE": {
          const quote = await prisma.quote.findFirst({
            where: { reference: ref, department: DEPARTMENT },
            select: { status: true, updatedAt: true, lead: { select: { phone: true, whatsapp: true } }, customer: { select: { phone: true, whatsapp: true } } },
          });
          if (!quote || !matches(quote.lead?.phone, quote.lead?.whatsapp, quote.customer?.phone, quote.customer?.whatsapp)) return { found: false };
          return { found: true, reference: ref, kind: "Quote request", status: QUOTE_STATUS[quote.status] ?? "In progress", updatedAt: quote.updatedAt };
        }
        case "LEAD": {
          const lead = await prisma.lead.findFirst({
            where: { reference: ref, department: DEPARTMENT },
            select: { stage: true, updatedAt: true, phone: true, whatsapp: true },
          });
          if (!lead || !matches(lead.phone, lead.whatsapp)) return { found: false };
          return { found: true, reference: ref, kind: "Enquiry", status: LEAD_STATUS[lead.stage] ?? "In progress", updatedAt: lead.updatedAt };
        }
        case "MTG": {
          const meeting = await prisma.meeting.findFirst({
            where: { reference: ref, department: DEPARTMENT },
            select: { status: true, updatedAt: true, phone: true, preferredDate: true, preferredTime: true },
          });
          if (!meeting || !matches(meeting.phone)) return { found: false };
          return { found: true, reference: ref, kind: "Appointment", status: MEETING_STATUS[meeting.status] ?? "In progress", updatedAt: meeting.updatedAt };
        }
      }
    } catch (error) {
      console.warn("[bot] tracking lookup failed:", error instanceof Error ? error.message : error);
    }
    return { found: false };
  }

  // ------------------------------------------------------------------ CRM ---

  async function recordEvent(effect: Extract<Effect, { type: "event" }>): Promise<void> {
    await prisma.botEvent
      .create({
        data: {
          department: DEPARTMENT,
          type: effect.event,
          channel: ctx.channel,
          conversationId: ctx.conversationId,
          leadId: leadId ?? null,
          intent: effect.intent ?? null,
          team: effect.team ?? null,
          value: effect.value ? truncate(effect.value, 190) : null,
          metadata: (effect.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      })
      .catch((error) => console.warn("[bot] event skipped:", error?.message));
  }

  /** The least busy active console user among a team's owners. */
  async function ownerFor(team: TeamKey): Promise<string | undefined> {
    const emails = config.teams[team]?.ownerEmails ?? [];
    if (!emails.length) return undefined;
    const users = await prisma.user.findMany({
      where: { email: { in: emails }, isActive: true, department: DEPARTMENT },
      select: {
        id: true,
        _count: { select: { assignedLeads: { where: { stage: { in: ["NEW", "CONTACTED", "QUALIFIED", "QUOTE_REQUESTED"] } } } } },
      },
    });
    return users.sort((a, b) => a._count.assignedLeads - b._count.assignedLeads)[0]?.id;
  }

  const PRIORITY_RANK: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
  const priorityFor = (temperature: Temperature): Priority =>
    temperature === "HIGH_PRIORITY" ? "URGENT" : temperature === "HOT" ? "HIGH" : "NORMAL";

  /** Everything the assistant knows about the lead beyond the captured details. */
  async function updateLead(
    id: string,
    input: { score: LeadScore; details: CustomerDetails; team?: TeamKey; nextAction?: string; summary?: string }
  ): Promise<void> {
    const lead = await prisma.lead.findFirst({
      where: { id, department: DEPARTMENT },
      select: { stage: true, priority: true, ownerId: true, trafficSource: true },
    });
    if (!lead) return;

    const { score, details } = input;
    const data: Prisma.LeadUncheckedUpdateInput = {
      score: score.value,
      temperature: score.temperature,
      scoreReasons: score.reasons,
      lastMessage: truncate(lastCustomerMessage(), 500) || undefined,
      lastMessageAt: ctx.now,
      // The customer just wrote, so follow-ups start counting again from here.
      followUpCount: 0,
    };
    if (details.topic) data.intent = details.topic;
    if (input.team) data.assignedTeam = input.team;
    if (input.nextAction) data.nextAction = input.nextAction;
    if (input.summary) data.conversationSummary = input.summary;

    if (!lead.trafficSource && ctx.attribution?.trafficSource) {
      data.trafficSource = ctx.attribution.trafficSource;
      data.campaign = ctx.attribution.campaign;
      data.adId = ctx.attribution.adId;
    }

    const wanted = priorityFor(score.temperature);
    if (PRIORITY_RANK.indexOf(wanted) > PRIORITY_RANK.indexOf(lead.priority)) data.priority = wanted;
    if (lead.stage === "NEW" && (score.temperature === "WARM" || score.temperature === "HOT" || score.temperature === "HIGH_PRIORITY")) {
      data.stage = "QUALIFIED";
    }

    if (!lead.ownerId && input.team) {
      const owner = await ownerFor(input.team);
      if (owner) {
        data.ownerId = owner;
        await notifyStaff({ userIds: [owner], subject: `New lead assigned to you — ${customerName(details)}`, link: `/admin/leads/${id}` });
      }
    }

    await prisma.lead.update({ where: { id }, data });
  }

  function customerLines(details: CustomerDetails): string[] {
    const phone = customerPhone(details);
    return [
      `Name: ${customerName(details)}`,
      phone ? `Phone: ${phone}` : "",
      details.whatsapp && details.whatsapp !== phone ? `WhatsApp: ${details.whatsapp}` : "",
      whatsapp ? `WhatsApp: ${ctx.phone}` : "",
      details.email ? `Email: ${details.email}` : "",
      details.company ? `Company: ${details.company}` : "",
      details.businessType ? `Industry: ${details.businessType}` : "",
      details.city ? `City: ${details.city}` : "",
      details.address ? `Address: ${details.address}` : "",
    ].filter(Boolean);
  }

  async function customerFor(details: CustomerDetails): Promise<string | undefined> {
    if (records.customerId) return records.customerId;
    const id = await linkCustomer(prisma, {
      name: details.name ?? ctx.profileName,
      phone: customerPhone(details),
      whatsapp: details.whatsapp ?? (whatsapp ? ctx.phone : undefined),
      email: details.email,
      company: details.company,
      city: details.city,
      address: details.address,
      businessType: details.businessType,
      source,
    }).catch(() => null);
    if (id) records.customerId = id;
    return id ?? undefined;
  }

  async function catalogIds(details: CustomerDetails) {
    const [category, item] = await Promise.all([
      details.productCategory
        ? prisma.productCategory.findFirst({ where: { department: DEPARTMENT, slug: details.productCategory }, select: { id: true } })
        : null,
      details.productId ? prisma.product.findFirst({ where: { department: DEPARTMENT, id: details.productId }, select: { id: true } }) : null,
    ]);
    return { productCategoryId: category?.id ?? null, productId: item?.id ?? null };
  }

  /** Media the customer sent in this conversation since `since` — attached to the ticket. */
  async function mediaSince(since?: string): Promise<Prisma.InputJsonValue | undefined> {
    if (!whatsapp) return undefined;
    const rows = await prisma.message.findMany({
      where: {
        conversationId: ctx.conversationId,
        role: "USER",
        mediaId: { not: null },
        ...(since ? { createdAt: { gte: new Date(Date.parse(since) - 60_000) } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true, mediaId: true, mediaType: true, mediaMime: true, content: true, createdAt: true },
    });
    if (!rows.length) return undefined;
    return rows.map((row) => ({
      mediaId: row.mediaId,
      type: row.mediaType,
      mime: row.mediaMime,
      caption: row.content.startsWith("[") ? null : row.content,
      messageId: row.id,
      at: row.createdAt.toISOString(),
    }));
  }

  async function createTicket(input: {
    details: CustomerDetails;
    category: TicketCategory;
    priority: Priority;
    subject: string;
    description: string;
    since?: string;
    note?: string;
  }): Promise<{ id: string; reference: string }> {
    const { details } = input;
    const reference = generateReference("TKT");
    const [customerId, catalog, attachments] = await Promise.all([customerFor(details), catalogIds(details), mediaSince(input.since)]);
    const ticket = await prisma.ticket.create({
      data: {
        reference,
        department: DEPARTMENT,
        category: input.category,
        status: "OPEN",
        priority: input.priority,
        subject: truncate(input.subject, 120),
        description: input.description,
        contactName: customerName(details),
        contactPhone: customerPhone(details) ?? details.whatsapp ?? null,
        contactEmail: details.email ?? null,
        company: details.company ?? null,
        city: details.city ?? null,
        address: details.address ?? null,
        machineType: details.machineType ?? null,
        machineBrand: details.machineBrand && details.machineBrand !== "Not sure" ? details.machineBrand : null,
        machineModel: details.machineModel && details.machineModel !== "Not sure" ? details.machineModel : null,
        serialNumber: details.serialNumber && details.serialNumber !== "Not available" ? details.serialNumber : null,
        productId: catalog.productId,
        preferredDate: details.meetingDate ? new Date(`${details.meetingDate}T00:00:00Z`) : null,
        preferredTime: details.meetingTime ?? (input.note ? truncate(input.note, 120) : null),
        attachments,
        source,
        customerId: customerId ?? null,
        conversationId: ctx.conversationId,
      },
      select: { id: true, reference: true },
    });
    created.push({ kind: "TICKET", reference: ticket.reference });
    return ticket;
  }

  async function markHandedOff(team: TeamKey): Promise<void> {
    await prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: { handedOff: true, handedOffAt: ctx.now, handoverTeam: team, status: "OPEN" },
    });
  }

  function ticketPriority(category: SupportCategory, details: CustomerDetails, serious: boolean): Priority {
    if (details.priority) return details.priority;
    if (category === "COMPLAINT" || serious) return "HIGH";
    return "NORMAL";
  }

  async function commit(effect: Effect): Promise<EffectResult> {
    try {
      switch (effect.type) {
        case "event":
          await recordEvent(effect);
          return {};

        case "sync": {
          const result = await syncCapture(
            { ...capture, notifyTo: recipients(effect.team ?? "SALES") },
            effect.details,
            { only: ["LEAD"], forceLead: effect.force, stage: effect.stage }
          );
          if (result?.state.customerId) records.customerId = result.state.customerId;
          if (!result?.state.leadId) return {};
          leadId = result.state.leadId;
          const leadCreated = result.created.some((record) => record.kind === "LEAD");
          if (leadCreated) created.push(...result.created.filter((record) => record.kind === "LEAD"));
          await updateLead(leadId, { score: effect.score, details: effect.details, team: effect.team, nextAction: effect.nextAction });
          return { leadReference: result.state.leadReference, leadCreated };
        }

        case "quote": {
          const { details, score } = effect;
          const reference = generateReference("QTE");
          const [customerId, catalog] = await Promise.all([customerFor(details), catalogIds(details)]);
          const notes = [
            ...customerLines(details),
            details.interest ? `Interested in: ${details.interest}` : "",
            details.quantity ? `Quantity: ${details.quantity}` : "",
            details.budget ? `Budget: ${details.budget}` : "",
            details.preferredContact ? `Preferred contact: ${details.preferredContact}` : "",
            `Lead score: ${score.value}/100 (${score.temperature})`,
          ]
            .filter(Boolean)
            .join("\n");
          const quote = await prisma.quote.create({
            data: {
              reference,
              department: DEPARTMENT,
              title: truncate(`${effect.title} — ${details.company ?? customerName(details)}`, 180),
              status: "REQUESTED",
              currency: "PKR",
              notes,
              requirements: details.requirements ?? null,
              quantity: details.quantity ?? null,
              budget: details.budget ?? null,
              preferredContact: details.preferredContact ?? null,
              city: details.city ?? null,
              source,
              ...catalog,
              leadId: leadId ?? null,
              customerId: customerId ?? null,
              conversationId: ctx.conversationId,
            },
            select: { id: true },
          });
          records.quoteId = quote.id;
          records.quoteReference = reference;
          created.push({ kind: "QUOTE", reference });

          const subject = `Quote request ${reference} — ${customerName(details)}${details.company ? ` (${details.company})` : ""}`;
          await notifyTeam({
            to: recipients(effect.team),
            subject,
            body: `A quotation was requested on ${channelName}.\n\n${notes}\n\nRequirement:\n${details.requirements ?? "—"}\n\nNext action: ${effect.nextAction}`,
            link: `/admin/quotes/${quote.id}`,
          });
          await notifyStaff({ permission: "quotes.manage", subject, body: details.interest ?? details.requirements ?? "", link: `/admin/quotes/${quote.id}` });
          await logEvent({
            action: "quote.requested",
            entity: "Quote",
            entityId: quote.id,
            message: `Quote request ${reference} submitted on ${channelName}.`,
            metadata: { reference, category: details.productCategory, source },
          });
          return { reference };
        }

        case "ticket": {
          const { details, context, team } = effect;
          const category = (context.supportCategory ?? "GENERAL") as SupportCategory;
          const serious = Boolean(effect.handover);
          const machine = machineLine(details);
          const ticket = await createTicket({
            details,
            category,
            priority: ticketPriority(category, details, serious),
            subject: `${context.topicLabel ?? "Support request"}${machine ? ` — ${machine}` : details.company ? ` — ${details.company}` : ""}`,
            description: [
              details.requirements ?? "(no description)",
              "",
              machine ? `Machine: ${machine}` : "",
              details.quantity ? `Quantity: ${details.quantity}` : "",
              effect.note ? `Preferred visit, in their words: "${effect.note}"` : "",
              ...customerLines(details),
              effect.handover ? `\n${effect.handover.text}` : "",
            ]
              .filter((line) => line !== "")
              .join("\n"),
            since: effect.since,
            note: effect.note,
          });
          records.ticketId = ticket.id;
          records.ticketReference = ticket.reference;
          if (serious) await markHandedOff(team);

          const subject = `${serious ? "Priority " : ""}${context.topicLabel ?? "Ticket"} ${ticket.reference} — ${customerName(details)}${details.city ? `, ${details.city}` : ""}`;
          await notifyTeam({
            to: recipients(team),
            subject,
            body: effect.handover?.text ?? `${details.requirements ?? ""}\n\n${machine ? `Machine: ${machine}\n` : ""}${customerLines(details).join("\n")}`,
            link: `/admin/tickets/${ticket.id}`,
          });
          await notifyStaff({ permission: "tickets.manage", subject, body: truncate(details.requirements ?? "", 200), link: `/admin/tickets/${ticket.id}` });
          await logEvent({
            action: "ticket.created",
            entity: "Ticket",
            entityId: ticket.id,
            message: `Ticket ${ticket.reference} raised on ${channelName}.`,
            metadata: { category, team, source },
          });
          return { reference: ticket.reference };
        }

        case "meeting": {
          const { details } = effect;
          const result = await syncCapture(capture, { ...details, intent: "APPOINTMENT" }, {
            only: ["MEETING"],
            meetingNotes: [effect.topic, effect.note ? `Customer said: "${effect.note}"` : ""].filter(Boolean).join("\n"),
          });
          if (result?.state.meetingReference) {
            records.meetingId = result.state.meetingId;
            records.meetingReference = result.state.meetingReference;
            created.push(...result.created.filter((record) => record.kind === "MEETING"));
            return { reference: result.state.meetingReference };
          }

          // No date the CRM can store: the team schedules it from the customer's own words.
          if (leadId) {
            await prisma.crmActivity.create({
              data: {
                department: DEPARTMENT,
                type: "FOLLOW_UP",
                entityType: "Lead",
                entityId: leadId,
                body: `Schedule: ${effect.topic}. ${effect.note ? `Customer's preferred time: "${effect.note}".` : "No time given yet."}`,
                dueAt: new Date(ctx.now.getTime() + 2 * 3_600_000),
              },
            });
          }
          const subject = `Schedule an appointment — ${customerName(details)}${details.company ? ` (${details.company})` : ""}`;
          await notifyTeam({
            to: recipients(effect.team),
            subject,
            body: `${effect.topic} requested on ${channelName}.\n${effect.note ? `Preferred time, in their words: "${effect.note}"\n` : ""}\n${customerLines(details).join("\n")}`,
            link: leadId ? `/admin/leads/${leadId}` : "/admin/appointments",
          });
          await notifyStaff({ permission: "appointments.manage", subject, link: leadId ? `/admin/leads/${leadId}` : "/admin/appointments" });
          return {};
        }

        case "handover": {
          const { details, summary, score, silent } = effect;
          const team = summary.team;
          const urgent = effect.state.signals.enterprise || score.temperature === "HIGH_PRIORITY";
          const upset = /upset/i.test(summary.reason);

          let reference = effect.reference;
          let ticketId: string | undefined;
          if (!reference) {
            const category: TicketCategory =
              upset ? "COMPLAINT"
              : team === "ACCOUNTS" ? "BILLING"
              : team === "SERVICE" ? "TECHNICAL"
              : team === "PARTS" ? "PARTS"
              : team === "SUPPORT" ? "GENERAL"
              : "SALES";
            const ticket = await createTicket({
              details,
              category,
              priority: urgent ? "URGENT" : upset || score.temperature === "HOT" ? "HIGH" : "NORMAL",
              subject: `${silent ? "Opportunity" : "Handover"} → ${teamLabel(team)}: ${summary.reason}`,
              description: summary.text,
            });
            reference = ticket.reference;
            ticketId = ticket.id;
            records.ticketId = ticket.id;
            records.ticketReference = ticket.reference;
          }

          await markHandedOff(team);
          if (leadId) {
            await updateLead(leadId, { score, details, team, nextAction: summary.recommendedAction, summary: summary.text });
          }

          const subject = `${urgent ? "Urgent: " : ""}${silent ? "Heads-up" : "Handover"} ${reference} — ${customerName(details)} → ${teamLabel(team)}`;
          await notifyTeam({
            to: recipients(team),
            subject,
            body: `${summary.text}\n\nReply from the console: ${appConfig.appUrl}/admin/conversations/${ctx.conversationId}`,
            link: `/admin/conversations/${ctx.conversationId}`,
          });
          await notifyStaff({
            permission: TEAM_PERMISSION[team],
            subject,
            body: summary.reason,
            link: `/admin/conversations/${ctx.conversationId}`,
          });
          await logEvent({
            action: "chat.escalated",
            entity: "Ticket",
            entityId: ticketId ?? reference,
            message: `Conversation on ${channelName} handed to ${teamLabel(team)}: ${summary.reason}`,
            metadata: { channel: ctx.channel, team, silent },
          });
          return { reference };
        }

        case "alert": {
          const { details, score, summary } = effect;
          let owner: string | null = null;
          if (leadId) {
            await updateLead(leadId, { score, details, team: summary.team, nextAction: summary.recommendedAction, summary: summary.text });
            await prisma.crmActivity.create({
              data: {
                department: DEPARTMENT,
                type: "NOTE",
                entityType: "Lead",
                entityId: leadId,
                body: `Lead scored ${score.value}/100 (${score.temperature}). ${score.reasons.join(", ")}.`,
              },
            });
            owner = (await prisma.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } }))?.ownerId ?? null;
          }
          const subject = `${score.temperature === "HIGH_PRIORITY" ? "High-priority" : "Hot"} lead — ${customerName(details)} (${score.value}/100)`;
          const link = leadId ? `/admin/leads/${leadId}` : `/admin/conversations/${ctx.conversationId}`;
          await notifyTeam({ to: recipients(summary.team), subject, body: summary.text, link });
          await notifyStaff(owner ? { userIds: [owner], subject, link } : { permission: "leads.manage", subject, link });
          return {};
        }

        case "attach": {
          const ticket = await prisma.ticket.findFirst({
            where: { reference: effect.ticketReference, department: DEPARTMENT, conversationId: ctx.conversationId },
            select: { id: true, attachments: true },
          });
          if (!ticket) return {};
          const list = Array.isArray(ticket.attachments) ? (ticket.attachments as Prisma.JsonArray) : [];
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: {
              attachments: [
                ...list,
                { mediaId: effect.media.id, type: effect.media.type, mime: effect.media.mime ?? null, at: new Date().toISOString() },
              ] as Prisma.InputJsonValue,
            },
          });
          return {};
        }

        case "optOut": {
          if (!whatsapp || !ctx.waId) return {};
          await prisma.whatsappContact.update({ where: { waId: ctx.waId }, data: { optedOut: true } });
          const where = { department: DEPARTMENT, OR: [{ conversationId: ctx.conversationId }, { phone: ctx.phone }] };
          await prisma.lead.updateMany({ where, data: { optInStatus: "OPTED_OUT" } });
          await prisma.lead.updateMany({ where: { ...where, stage: { in: ["NEW", "CONTACTED"] } }, data: { stage: "OPTED_OUT" } });
          return {};
        }

        case "optIn": {
          if (!whatsapp || !ctx.waId) return {};
          await prisma.whatsappContact.update({ where: { waId: ctx.waId }, data: { optedOut: false } });
          await prisma.lead.updateMany({
            where: { department: DEPARTMENT, OR: [{ conversationId: ctx.conversationId }, { phone: ctx.phone }] },
            data: { optInStatus: "OPTED_IN" },
          });
          return {};
        }
      }
    } catch (error) {
      console.error(`[bot] ${effect.type} failed:`, error);
      await logEvent({
        level: "ERROR",
        action: `bot.${effect.type}.failed`,
        entity: "Conversation",
        entityId: ctx.conversationId,
        message: error instanceof Error ? error.message.split("\n").find(Boolean) : String(error),
      });
      return {};
    }
  }

  return { send, extract, summarize, products, product, track, commit, records, created };
}
