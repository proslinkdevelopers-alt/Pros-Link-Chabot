import { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/staff";
import { asCustomerDetails } from "@/lib/ai/customer";
import { detectLanguage, asLanguage, type Language } from "@/lib/i18n";
import { getBotConfig } from "@/lib/bot/config";
import { customerDetailsFrom, handoverBriefing, representativeReply, translateCopy } from "@/lib/bot/ai";
import { runTurn, type BotRuntime, type Effect, type EffectResult } from "@/lib/bot/engine";
import { stripRefCode } from "@/lib/bot/source";
import { transcriptOf, type Outgoing } from "@/lib/bot/render";
import { readBotState } from "@/lib/bot/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chatbot Studio simulator — one turn of the real engine with the live
 * configuration and the real model, but nothing sent to WhatsApp and nothing
 * written to the CRM. The CRM effects the turn *would* have had are returned
 * so the tester can see exactly what the team would receive.
 *
 * Stateless: the browser holds the conversation and sends it back each turn.
 */

const bodySchema = z.object({
  input: z.object({
    kind: z.enum(["text", "reply"]),
    text: z.string().max(4000),
    replyId: z.string().max(256).optional(),
  }),
  phone: z.string().max(20).default("+923001234567"),
  profileName: z.string().max(80).optional(),
  language: z.string().optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(80),
  details: z.record(z.unknown()).default({}),
  state: z.unknown().optional(),
  records: z.object({ lead: z.string().optional(), meeting: z.string().optional(), ticket: z.string().optional() }).default({}),
  optedOut: z.boolean().default(false),
  turns: z.number().int().min(0).default(0),
});

export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("chatbot.manage", req);
  if ("response" in guard) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid simulator request." }, { status: 400 });
  const body = parsed.data;

  const config = await getBotConfig();
  const text = body.input.kind === "text" ? stripRefCode(body.input.text) : body.input.text;
  const previous: Language = asLanguage(body.language) ?? "en";
  const language: Language =
    body.input.kind === "text" && text.trim().split(/\s+/).length > 2 ? detectLanguage(text) : previous;

  const history = [...body.history, { role: "user" as const, content: text || "[tap]" }];
  const ai = { config, language, phone: body.phone, profileName: body.profileName, history };
  const sent: Outgoing[] = [];
  const effects: Array<{ type: Effect["type"]; summary: string; detail?: unknown }> = [];
  let optedOut = body.optedOut;
  let leadCreated = false;

  const commit = async (effect: Effect): Promise<EffectResult> => {
    switch (effect.type) {
      case "event":
        effects.push({ type: "event", summary: `${effect.event}${effect.value ? ` · ${effect.value}` : ""}` });
        return {};
      case "sync": {
        const due = effect.force || Boolean(effect.details.name && (effect.details.service || effect.details.requirements));
        if (!due && !body.records.lead) return {};
        const created = !body.records.lead && !leadCreated;
        leadCreated = true;
        effects.push({
          type: "sync",
          summary: `${created ? "Lead created" : "Lead updated"} · score ${effect.score.value} (${effect.score.temperature})${effect.nextAction ? ` · next: ${effect.nextAction}` : ""}`,
          detail: effect.score.reasons,
        });
        return { leadReference: body.records.lead ?? "SIM-LEAD", leadCreated: created };
      }
      case "quote":
        effects.push({ type: "quote", summary: `Draft quotation · ${effect.title}` });
        return { reference: "SIM-QTE" };
      case "ticket":
        effects.push({
          type: "ticket",
          summary: `Ticket · ${effect.context.topicLabel ?? "Support"} → ${effect.team}${effect.handover ? " (handed over)" : ""}`,
          detail: effect.handover?.text,
        });
        return { reference: "SIM-TKT" };
      case "meeting":
        effects.push({
          type: "meeting",
          summary: effect.details.meetingDate
            ? `Meeting request · ${effect.details.meetingDate} ${effect.details.meetingTime ?? ""}`
            : `Call to schedule · "${effect.note ?? "no time given"}"`,
        });
        return effect.details.meetingDate ? { reference: "SIM-MTG" } : {};
      case "handover":
        effects.push({
          type: "handover",
          summary: `${effect.silent ? "Team alerted" : "Handover"} → ${effect.summary.team} · ${effect.summary.reason}`,
          detail: effect.summary.text,
        });
        return { reference: effect.reference ?? "SIM-HANDOVER" };
      case "alert":
        effects.push({ type: "alert", summary: `Hot lead alert → ${effect.summary.team}`, detail: effect.summary.text });
        return {};
      case "optOut":
        optedOut = true;
        effects.push({ type: "optOut", summary: "Contact opted out" });
        return {};
      case "optIn":
        optedOut = false;
        effects.push({ type: "optIn", summary: "Contact opted back in" });
        return {};
    }
  };

  const simulator: BotRuntime = {
    send: async (message) => {
      sent.push(message);
      history.push({ role: "assistant", content: transcriptOf(message) });
    },
    reply: (request) => representativeReply(ai, request),
    extract: (known) => customerDetailsFrom(ai, known),
    translate: (copy, target) => translateCopy(ai, copy, target),
    summarize: () => handoverBriefing(ai),
    commit,
  };

  try {
    const result = await runTurn(
      { kind: body.input.kind, text, replyId: body.input.replyId },
      {
        config,
        language,
        phone: body.phone,
        profileName: body.profileName,
        isNewConversation: body.turns === 0,
        optedOut: body.optedOut,
        botPaused: false,
        details: asCustomerDetails(body.details),
        state: readBotState(body.state),
        records: body.records,
        now: new Date(),
      },
      simulator
    );

    return Response.json({
      sent,
      effects,
      details: result.details,
      state: result.state,
      records: result.records,
      history,
      language,
      optedOut,
    });
  } catch (error) {
    console.error("[simulator] turn failed:", error);
    return Response.json({ error: "The turn failed. See the server log." }, { status: 500 });
  }
}
