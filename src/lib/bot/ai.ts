import { config as appConfig } from "@/lib/config";
import { LANGUAGE_PROFILES, type Language } from "@/lib/i18n";
import { BRAND } from "@/config/brand";
import { extractCustomerDetails, getProvider, planAssistantTurn, type ChatTurn } from "@/lib/ai";
import type { CustomerDetails } from "@/lib/ai/customer";
import { truncate } from "@/lib/utils";
import type { CompanyContact, ReplyRequest } from "./engine";
import { promptContextFor } from "./prompt";
import type { BotConfig } from "./schema";

/**
 * The model calls behind a `BotRuntime`, shared by WhatsApp, the web assistant
 * and the console simulator so all three answer exactly alike. None of these
 * throw: a model outage becomes an empty string, which the engine turns into
 * an apology and a way to reach the team.
 */

export interface AiContext {
  config: BotConfig;
  company: CompanyContact;
  categories: Array<{ slug: string; name: string }>;
  channel: "WEB" | "WHATSAPP";
  language: Language;
  /** The WhatsApp number; empty on the web. */
  phone: string;
  profileName?: string;
  /** The conversation so far, including the message being handled. */
  history: ChatTurn[];
}

async function collect(system: string, content: string, maxTokens: number, model?: string): Promise<string> {
  let text = "";
  for await (const chunk of getProvider().streamChat({
    system,
    messages: [{ role: "user", content }],
    maxTokens,
    model,
    thinking: false,
  })) {
    text += chunk;
  }
  return text.trim();
}

export async function representativeReply(ctx: AiContext, request: ReplyRequest): Promise<string> {
  try {
    const plan = await planAssistantTurn(ctx.history, {
      channel: ctx.channel,
      details: request.details,
      whatsapp: ctx.channel === "WHATSAPP" && ctx.phone ? { number: ctx.phone, profileName: ctx.profileName } : undefined,
      bot: promptContextFor(ctx.config, ctx.company, ctx.language, {
        knowledge: request.knowledge,
        pendingQuestion: request.pendingQuestion,
        enterprise: request.state.signals.enterprise,
        handover: request.state.handover
          ? {
              team: ctx.config.teams[request.state.handover.team]?.label ?? request.state.handover.team,
              reference: request.state.handover.reference,
            }
          : undefined,
      }),
    });

    // The model answers the customer's latest message, so the history it sees
    // ends there even if this turn has already sent something.
    const lastCustomer = ctx.history.map((turn) => turn.role).lastIndexOf("user");
    const messages = ctx.history.slice(0, lastCustomer + 1).slice(-20);

    let text = "";
    for await (const chunk of getProvider().streamChat({ system: plan.system, messages })) text += chunk;
    return text.trim();
  } catch (error) {
    console.error("[bot] model error:", error instanceof Error ? error.message : error);
    return "";
  }
}

export function customerDetailsFrom(ctx: AiContext, known: CustomerDetails): Promise<CustomerDetails> {
  const host = ctx.company.website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
  return extractCustomerDetails(ctx.history, known, {
    channelPhone: ctx.channel === "WHATSAPP" ? ctx.phone : undefined,
    brandPhones: [ctx.company.phone, ctx.company.whatsapp, ...ctx.company.offices.map((office) => office.phone)].filter(Boolean),
    brandEmail: ctx.company.email,
    brandHost: host,
    categories: ctx.categories,
  });
}

export async function translateCopy(ctx: AiContext, text: string, language: Language): Promise<string> {
  try {
    return await collect(
      `Translate the chat message you are given for a customer of ${BRAND.name}. ${LANGUAGE_PROFILES[language].promptDirective} Translate faithfully: add nothing, remove nothing. Keep *bold* markers, bullet characters, line breaks, emojis, URLs, reference numbers and product and brand names exactly as they are. Reply with the translation only.`,
      text,
      1600,
      appConfig.ai.extractionModel
    );
  } catch (error) {
    console.warn("[bot] translation skipped:", error instanceof Error ? error.message : error);
    return "";
  }
}

export async function handoverBriefing(ctx: AiContext): Promise<string> {
  const transcript = ctx.history
    .slice(-30)
    .map((turn) => `${turn.role === "user" ? "CUSTOMER" : "ASSISTANT"}: ${turn.content.slice(0, 800)}`)
    .join("\n");
  try {
    const summary = await collect(
      "You brief a colleague taking over a customer conversation. In three to five plain English sentences say what the customer wants, the details they gave (machine, model, quantity, city), what they are waiting for and anything that needs care. Use only what is in the transcript. No headings, no bullet points.",
      transcript,
      500,
      appConfig.ai.extractionModel
    );
    if (summary) return summary;
  } catch {
    /* fall through to the transcript excerpt */
  }
  return ctx.history
    .filter((turn) => turn.role === "user")
    .slice(-4)
    .map((turn) => `“${truncate(turn.content, 200)}”`)
    .join(" · ");
}
