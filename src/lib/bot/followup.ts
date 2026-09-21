import type { LeadStage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { asLanguage, type Language } from "@/lib/i18n";
import { logEvent } from "@/lib/notify";
import { sendButtons, sendList, sendTemplate, sendText } from "@/lib/whatsapp/client";
import { getBotConfig } from "./config";
import { isOpen } from "./hours";
import { offer, transcriptOf } from "./render";
import { fill, pick } from "./text";

/**
 * =============================================================================
 *  Smart follow-up
 * =============================================================================
 *
 *  A qualified lead who stops replying gets a short, polite check-in — at most
 *  one per configured step, and never:
 *
 *    • to anyone who opted out or was blocked,
 *    • while a person on the team is handling the conversation,
 *    • when the customer is the one waiting for a reply,
 *    • to a lead that is won, lost or spam, or already has a quotation,
 *    • outside business hours (when configured),
 *    • outside WhatsApp's 24-hour window without an approved template.
 *
 *  `followUpCount` counts check-ins since the customer last wrote; the
 *  assistant resets it whenever they reply. Run it every 15–30 minutes from a
 *  scheduler calling `/api/cron/follow-ups`.
 * =============================================================================
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;
const CLOSED_STAGES: LeadStage[] = ["WON", "LOST", "SPAM", "OPTED_OUT", "SUPPORT", "QUOTED", "NEGOTIATION"];
const LANGUAGE_BY_ENUM: Record<string, Language> = { EN: "en", UR: "ur", UR_ROMAN: "ur_roman", PA: "pa" };

export interface FollowUpReport {
  checked: number;
  sent: number;
  skipped: Record<string, number>;
  note?: string;
}

export async function runFollowUps(now = new Date()): Promise<FollowUpReport> {
  const config = await getBotConfig();
  const rules = config.followUp;
  const report: FollowUpReport = { checked: 0, sent: 0, skipped: {} };
  const skip = (reason: string) => {
    report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
  };

  if (!rules.enabled || !rules.steps.length) return { ...report, note: "Follow-ups are switched off." };
  if (rules.onlyDuringBusinessHours && !isOpen(config.businessHours, now)) {
    return { ...report, note: "Outside business hours — nothing sent." };
  }

  const leads = await prisma.lead.findMany({
    where: {
      department: DEPARTMENT,
      source: "WHATSAPP",
      temperature: { in: rules.temperatures },
      stage: { notIn: CLOSED_STAGES },
      optInStatus: { not: "OPTED_OUT" },
      followUpCount: { lt: rules.steps.length },
      conversationId: { not: null },
    },
    orderBy: { score: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      phone: true,
      stage: true,
      subService: true,
      followUpCount: true,
      conversation: {
        select: { id: true, contactPhone: true, handedOff: true, botPaused: true, language: true },
      },
    },
  });

  for (const lead of leads) {
    report.checked += 1;
    const conversation = lead.conversation;
    if (!conversation?.contactPhone) {
      skip("no WhatsApp thread");
      continue;
    }
    if (conversation.handedOff || conversation.botPaused) {
      skip("a person is handling it");
      continue;
    }

    const contact = await prisma.whatsappContact.findFirst({
      where: { phone: conversation.contactPhone, department: DEPARTMENT },
      select: { waId: true, optedOut: true, isBlocked: true, lastInboundAt: true },
    });
    if (!contact || contact.optedOut || contact.isBlocked) {
      skip("opted out or blocked");
      continue;
    }
    if (!contact.lastInboundAt) {
      skip("never wrote in");
      continue;
    }

    const last = await prisma.message.findFirst({
      where: { conversationId: conversation.id, role: { in: ["USER", "ASSISTANT"] } },
      orderBy: { createdAt: "desc" },
      select: { role: true },
    });
    if (last?.role === "USER") {
      skip("customer is waiting on us");
      continue;
    }

    const step = rules.steps[lead.followUpCount];
    const quietFor = now.getTime() - contact.lastInboundAt.getTime();
    if (quietFor < step.afterHours * 3_600_000) {
      skip("not due yet");
      continue;
    }

    const language = asLanguage(LANGUAGE_BY_ENUM[conversation.language]) ?? "en";
    const service = lead.subService ?? "office equipment";
    const firstName = lead.name && lead.name !== "WhatsApp contact" ? lead.name.split(" ")[0] : undefined;
    const body = fill(pick(rules.message, language), { name: firstName, service });

    let result: { ok: boolean; messageId?: string; error?: string };
    let transcript: string;

    if (quietFor < WINDOW_MS) {
      const messages = offer(
        body,
        rules.actions
          .map((key) => [key, config.actions[key]] as const)
          .filter(([, action]) => Boolean(action))
          .map(([key, action]) => ({ id: `a:${key}`, title: pick(action!.title, language) })),
        { listButton: pick(config.messages.menuButton, language), moreTitle: pick(config.messages.moreOptions, language) }
      );
      result = { ok: true };
      for (const message of messages) {
        result =
          message.type === "text"
            ? await sendText(contact.waId, message.body)
            : message.type === "buttons"
              ? await sendButtons(contact.waId, message.body, message.buttons, message.footer)
              : await sendList(contact.waId, message.body, message.button, message.rows, undefined, message.footer);
        if (!result.ok) break;
      }
      transcript = messages.map(transcriptOf).join("\n\n");
    } else if (rules.template) {
      const variables = rules.template.variables.map((name) => (name === "name" ? firstName ?? "there" : service));
      result = await sendTemplate(contact.waId, rules.template.name, rules.template.languageCode, variables);
      transcript = `[Template ${rules.template.name}] ${variables.join(" · ")}`;
    } else {
      skip("outside the 24-hour window and no template set");
      continue;
    }

    if (!result.ok) {
      skip("send failed");
      await logEvent({
        level: "ERROR",
        action: "bot.follow_up.failed",
        entity: "Lead",
        entityId: lead.id,
        message: result.error ?? "Follow-up could not be sent.",
      });
      continue;
    }

    report.sent += 1;
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: transcript,
          department: DEPARTMENT,
          externalId: result.messageId,
        },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          followUpCount: { increment: 1 },
          lastFollowUpAt: now,
        },
      }),
      prisma.whatsappContact.update({ where: { waId: contact.waId }, data: { lastOutboundAt: now } }),
      prisma.botEvent.create({
        data: {
          department: DEPARTMENT,
          channel: "WHATSAPP",
          type: "FOLLOW_UP_SENT",
          conversationId: conversation.id,
          leadId: lead.id,
          value: `step ${lead.followUpCount + 1}`,
        },
      }),
    ]);
  }

  return report;
}
