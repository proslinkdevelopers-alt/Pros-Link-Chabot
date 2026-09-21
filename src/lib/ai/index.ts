import { detectLanguage, type Language } from "@/lib/i18n";
import { listCategories, matchProducts, verifiedBrands } from "@/lib/catalog";
import type { ChatTurn } from "./types";
import { loadKnowledge, retrieveKnowledge } from "./knowledge";
import { buildSystemPrompt, type CustomerContext } from "./system-prompt";
import { getProvider } from "./provider";

export type { AIProvider, ChatTurn } from "./types";
export type { BotPromptContext, CustomerContext } from "./system-prompt";
export { getProvider } from "./provider";
export { loadKnowledge, retrieveKnowledge, invalidateKnowledge } from "./knowledge";
export { asksQuestion } from "./intents";
export { extractCustomerDetails, mergeDetails, type CustomerDetails } from "./customer";

export interface AssistantPlan {
  language: Language;
  system: string;
}

/**
 * Work out how to answer this turn before any tokens are generated: the
 * language to reply in, and the system prompt built from the knowledge entries
 * and catalogue products that match the newest message, the active categories,
 * the verified brands and what the customer has already told us.
 */
export async function planAssistantTurn(messages: ChatTurn[], customer: CustomerContext): Promise<AssistantPlan> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = lastUser?.content ?? "";
  const language = detectLanguage(text);

  const [knowledge, products, categories, brands] = await Promise.all([
    loadKnowledge(),
    matchProducts(text),
    listCategories(),
    verifiedBrands(),
  ]);

  return {
    language,
    system: buildSystemPrompt({
      language,
      relevant: retrieveKnowledge(text, knowledge),
      products,
      categories,
      brands,
      customer,
    }),
  };
}

/**
 * Stream a reply for a pre-computed plan. History is trimmed to the last 20
 * turns; details given earlier still reach the model through the customer
 * section of the system prompt.
 */
export async function* streamAssistantReply(
  messages: ChatTurn[],
  plan: AssistantPlan
): AsyncGenerator<string, void, unknown> {
  yield* getProvider().streamChat({ system: plan.system, messages: messages.slice(-20) });
}
