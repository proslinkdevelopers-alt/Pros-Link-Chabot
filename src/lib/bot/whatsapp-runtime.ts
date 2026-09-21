import type { LeadStage, Prisma, Priority, TicketCategory, TrafficSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config as appConfig } from "@/lib/config";
import { DEPARTMENT } from "@/config/brand";
import type { Language } from "@/lib/i18n";
import { logEvent, notifyTeam } from "@/lib/notify";
import { generateReference, truncate } from "@/lib/utils";
import { syncCapture, type CaptureContext } from "@/lib/capture";
import type { ChatTurn } from "@/lib/ai";
import type { CustomerDetails } from "@/lib/ai/customer";
import { sendButtons, sendList, sendText } from "@/lib/whatsapp/client";
import type { BotRuntime, Effect, EffectResult, ReplyRequest } from "./engine";
import { customerDetailsFrom, handoverBriefing, representativeReply, translateCopy } from "./ai";
import { teamRecipients } from "./prompt";
import { transcriptOf, type Outgoing } from "./render";
import type { LeadScore } from "./scoring";
import type { BotConfig } from "./schema";
import type { TeamKey, Temperature } from "./types";

/**
 * =============================================================================
 *  WhatsApp runtime — the engine's hands
 * =============================================================================
 *
 *  Everything the conversation engine asks for, done for real: messages go to
 *  the WhatsApp Cloud API and into the transcript, the model answers, and CRM
 *  effects become leads, quotations, tickets, meetings, handovers and
 *  notifications for the right team.
 *
 *  Like the rest of the webhook path, nothing here throws. A failed CRM write is
 *  logged and the conversation carries on — the customer must still get a reply.
 * =============================================================================
 */

const LANGUAGE_MAP = { en: "EN", ur: "UR", ur_roman: "UR_ROMAN", pa: "PA" } as const;

export interface WhatsAppRuntimeContext {
  waId: string;
  /** `+923001234567` */
  phone: string;
  conversationId: string;
  profileName?: string;
  language: Language;
  config: BotConfig;
  /** The thread so far, including the message being handled. */
  history: ChatTurn[];
  leadId?: string;
  attribution?: { trafficSource: TrafficSource | null; campaign: string | null; adId: string | null };
  now: Date;
}

export interface WhatsAppRuntime extends BotRuntime {
  /** Ticket and meeting references created this turn, for the conversation's capture. */
  records: { ticketId?: string; ticketReference?: string; meetingId?: string; meetingReference?: string };
}

export function createWhatsAppRuntime(ctx: WhatsAppRuntimeContext): WhatsAppRuntime {
  const { config } = ctx;
  let leadId = ctx.leadId;
  const records: WhatsAppRuntime["records"] = {};

  const capture: CaptureContext = {
    conversationId: ctx.conversationId,
    source: "WHATSAPP",
    fallback: { name: ctx.profileName, phone: ctx.phone },
  };

  const teamLabel = (team: TeamKey) => config.teams[team]?.label ?? team;
  const recipients = (team: TeamKey) => teamRecipients(config, team, appConfig.routing.salesEmail);
  const customerName = (details: CustomerDetails) => details.name ?? ctx.profileName ?? ctx.phone;
  const lastCustomerMessage = () => [...ctx.history].reverse().find((turn) => turn.role === "user")?.content ?? "";

  // ---------------------------------------------------------------- Send ---

  async function send(message: Outgoing): Promise<void> {
    const result =
      message.type === "text"
        ? await sendText(ctx.waId, message.body)
        : message.type === "buttons"
          ? await sendButtons(ctx.waId, message.body, message.buttons, message.footer)
          : await sendList(ctx.waId, message.body, message.button, message.rows, undefined, message.footer);

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
      .catch((error) => console.warn("[whatsapp] transcript write skipped:", error?.message));

    await prisma.conversation
      .update({
        where: { id: ctx.conversationId },
        data: { language: LANGUAGE_MAP[ctx.language], updatedAt: new Date() },
      })
      .catch(() => {});

    if (result.ok) {
      await prisma.whatsappContact
        .update({ where: { waId: ctx.waId }, data: { lastOutboundAt: new Date() } })
        .catch(() => {});
      return;
    }

    // A failed send is invisible from the outside — the customer simply gets
    // nothing — so it is recorded with the cause.
    await logEvent({
      level: "ERROR",
      action: "whatsapp.send.failed",
      entity: "WhatsappContact",
      entityId: ctx.waId,
      message: result.error ?? "Unknown error sending to the WhatsApp Cloud API.",
      metadata: { to: ctx.phone, shape: message.type },
    });
  }

  // ------------------------------------------------------------------ AI ---

  const ai = { config, language: ctx.language, phone: ctx.phone, profileName: ctx.profileName, history: ctx.history };
  const reply = (request: ReplyRequest) => representativeReply(ai, request);
  const extract = (known: CustomerDetails) => customerDetailsFrom(ai, known);
  const translate = (text: string, language: Language) => translateCopy(ai, text, language);
  const summarize = () => handoverBriefing(ai);

  // ------------------------------------------------------------------ CRM ---

  async function recordEvent(effect: Extract<Effect, { type: "event" }>): Promise<void> {
    await prisma.botEvent
      .create({
        data: {
          department: DEPARTMENT,
          type: effect.event,
          channel: "WHATSAPP",
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
      where: { email: { in: emails }, isActive: true },
      select: {
        id: true,
        _count: { select: { assignedLeads: { where: { stage: { in: ["NEW", "CONTACTED", "QUALIFIED", "HOT"] } } } } },
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
    const lead = await prisma.lead.findUnique({
      where: { id },
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

    const hot = score.temperature === "HOT" || score.temperature === "HIGH_PRIORITY";
    const early: LeadStage[] = ["NEW", "CONTACTED", "QUALIFIED", "FOLLOW_UP"];
    if (hot && early.includes(lead.stage)) data.stage = "HOT";
    else if (lead.stage === "NEW" && score.temperature === "WARM") data.stage = "QUALIFIED";

    if (!lead.ownerId && input.team) {
      const owner = await ownerFor(input.team);
      if (owner) data.ownerId = owner;
    }

    await prisma.lead.update({ where: { id }, data });
  }

  function customerLines(details: CustomerDetails): string[] {
    return [
      `Name: ${customerName(details)}`,
      `WhatsApp: ${ctx.phone}`,
      details.email ? `Email: ${details.email}` : "",
      details.company ? `Company: ${details.company}` : "",
      details.businessType ? `Industry: ${details.businessType}` : "",
      details.website ? `Website: ${details.website}` : "",
      details.country ? `Country: ${details.country}` : "",
    ].filter(Boolean);
  }

  async function createTicket(input: {
    details: CustomerDetails;
    category: TicketCategory;
    priority: Priority;
    subject: string;
    description: string;
  }): Promise<{ id: string; reference: string }> {
    const reference = generateReference("TKT");
    const ticket = await prisma.ticket.create({
      data: {
        reference,
        department: DEPARTMENT,
        category: input.category,
        status: "OPEN",
        priority: input.priority,
        subject: truncate(input.subject, 120),
        description: input.description,
        contactName: customerName(input.details),
        contactPhone: input.details.phone ?? ctx.phone,
        contactEmail: input.details.email ?? null,
        conversationId: ctx.conversationId,
      },
      select: { id: true, reference: true },
    });
    return ticket;
  }

  async function markHandedOff(team: TeamKey): Promise<void> {
    await prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: { handedOff: true, handedOffAt: ctx.now, handoverTeam: team },
    });
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
            { only: ["LEAD"], forceLead: effect.force }
          );
          if (!result?.state.leadId) return {};
          leadId = result.state.leadId;
          await updateLead(leadId, { score: effect.score, details: effect.details, team: effect.team, nextAction: effect.nextAction });
          return {
            leadReference: result.state.leadReference,
            leadCreated: result.created.some((record) => record.kind === "LEAD"),
          };
        }

        case "quote": {
          const { details, score } = effect;
          const reference = generateReference("QTE");
          const notes = [
            ...customerLines(details),
            details.subService || details.service ? `Service: ${details.subService ?? details.service}` : "",
            details.businessGoal ? `Goal: ${details.businessGoal}` : "",
            details.challenge ? `Challenge: ${details.challenge}` : "",
            details.timeline ? `Timeline: ${details.timeline}` : "",
            details.budget ? `Budget: ${details.budget}` : "",
            `Lead score: ${score.value}/100 (${score.temperature})`,
          ]
            .filter(Boolean)
            .join("\n");
          await prisma.quote.create({
            data: {
              reference,
              department: DEPARTMENT,
              title: truncate(`${effect.title} — ${details.company ?? customerName(details)}`, 180),
              status: "DRAFT",
              currency: details.country === "Pakistan" ? "PKR" : "USD",
              notes,
              leadId: leadId ?? null,
            },
          });
          await notifyTeam({
            to: recipients(effect.team),
            subject: `Quote request ${reference} — ${customerName(details)}${details.company ? ` (${details.company})` : ""}`,
            body: `A quote was requested on WhatsApp.\n\n${notes}\n\nNext action: ${effect.nextAction}`,
            link: "/admin/quotes",
          });
          return { reference };
        }

        case "ticket": {
          const { details, context, team } = effect;
          const serious = Boolean(effect.handover);
          const ticket = await createTicket({
            details,
            category: context.supportCategory ?? "GENERAL",
            priority: serious ? "HIGH" : "NORMAL",
            subject: `${context.topicLabel ?? "Support request"}${details.project ? ` — ${details.project}` : ""}`,
            description: [
              details.requirements ?? "(no description)",
              "",
              details.project ? `Project: ${details.project}` : "",
              ...customerLines(details),
              effect.handover ? `\n${effect.handover.text}` : "",
            ]
              .filter((line) => line !== "")
              .join("\n"),
          });
          records.ticketId = ticket.id;
          records.ticketReference = ticket.reference;
          if (serious) await markHandedOff(team);

          await notifyTeam({
            to: recipients(team),
            subject: `${serious ? "Handover" : "New ticket"} ${ticket.reference} — ${context.topicLabel ?? "Support"} (${customerName(details)})`,
            body: effect.handover?.text ?? `${details.requirements ?? ""}\n\n${customerLines(details).join("\n")}`,
            link: "/admin/support/tickets",
          });
          await logEvent({
            action: "ticket.created",
            entity: "Ticket",
            entityId: ticket.id,
            message: `Ticket ${ticket.reference} raised on WhatsApp.`,
            metadata: { category: context.supportCategory, team },
          });
          return { reference: ticket.reference };
        }

        case "meeting": {
          const { details } = effect;
          const result = await syncCapture(capture, { ...details, intent: "CONSULTATION" }, {
            only: ["MEETING"],
            meetingNotes: [effect.topic, effect.note ? `Customer said: "${effect.note}"` : ""].filter(Boolean).join("\n"),
          });
          if (result?.state.meetingReference) {
            records.meetingId = result.state.meetingId;
            records.meetingReference = result.state.meetingReference;
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
          await notifyTeam({
            to: recipients(effect.team),
            subject: `Schedule a call — ${customerName(details)}${details.company ? ` (${details.company})` : ""}`,
            body: `${effect.topic} requested on WhatsApp.\n${effect.note ? `Preferred time, in their words: "${effect.note}"\n` : ""}\n${customerLines(details).join("\n")}`,
            link: leadId ? `/admin/crm/leads/${leadId}` : "/admin/meetings",
          });
          return {};
        }

        case "handover": {
          const { details, summary, score, silent } = effect;
          const team = summary.team;
          const urgent = effect.state.signals.enterprise || score.temperature === "HIGH_PRIORITY";
          const upset = /upset/i.test(summary.reason);

          let reference = effect.reference;
          if (!reference) {
            const category: TicketCategory =
              team === "BILLING" ? "BILLING" : team === "SUPPORT" ? (upset ? "COMPLAINT" : "TECHNICAL") : upset ? "COMPLAINT" : "SALES";
            const ticket = await createTicket({
              details,
              category,
              priority: urgent ? "URGENT" : upset || score.temperature === "HOT" ? "HIGH" : "NORMAL",
              subject: `${silent ? "Opportunity" : "Handover"} → ${teamLabel(team)}: ${summary.reason}`,
              description: summary.text,
            });
            reference = ticket.reference;
          }

          await markHandedOff(team);
          if (leadId) {
            await updateLead(leadId, {
              score,
              details,
              team,
              nextAction: summary.recommendedAction,
              summary: summary.text,
            });
          }

          await notifyTeam({
            to: recipients(team),
            subject: `${urgent ? "🔴 " : ""}${silent ? "Heads-up" : "Handover"} ${reference} — ${customerName(details)} → ${teamLabel(team)}`,
            body: `${summary.text}\n\nReply from the console: ${appConfig.appUrl}/admin/conversations/${ctx.conversationId}`,
            link: `/admin/conversations/${ctx.conversationId}`,
          });
          await logEvent({
            action: "chat.escalated",
            entity: "Ticket",
            entityId: reference,
            message: `WhatsApp conversation handed to ${teamLabel(team)} (${ctx.phone}): ${summary.reason}`,
            metadata: { channel: "WHATSAPP", team, silent },
          });
          return { reference };
        }

        case "alert": {
          const { details, score, summary } = effect;
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
          }
          await notifyTeam({
            to: recipients(summary.team),
            subject: `🔥 ${score.temperature === "HIGH_PRIORITY" ? "High-priority" : "Hot"} lead — ${customerName(details)} (${score.value}/100)`,
            body: summary.text,
            link: leadId ? `/admin/crm/leads/${leadId}` : `/admin/conversations/${ctx.conversationId}`,
          });
          return {};
        }

        case "optOut": {
          await prisma.whatsappContact.update({ where: { waId: ctx.waId }, data: { optedOut: true } });
          const where = { OR: [{ conversationId: ctx.conversationId }, { phone: ctx.phone }] };
          await prisma.lead.updateMany({ where, data: { optInStatus: "OPTED_OUT" } });
          await prisma.lead.updateMany({
            where: { ...where, stage: { in: ["NEW", "CONTACTED", "FOLLOW_UP"] } },
            data: { stage: "OPTED_OUT" },
          });
          return {};
        }

        case "optIn": {
          await prisma.whatsappContact.update({ where: { waId: ctx.waId }, data: { optedOut: false } });
          await prisma.lead.updateMany({
            where: { OR: [{ conversationId: ctx.conversationId }, { phone: ctx.phone }] },
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

  return { send, reply, extract, translate, summarize, commit, records };
}

