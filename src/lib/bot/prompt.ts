import type { Language } from "@/lib/i18n";
import type { BotPromptContext } from "@/lib/ai/system-prompt";
import type { CompanyContact } from "./engine";
import type { BotConfig } from "./schema";
import { pick } from "./text";

/**
 * The representative's view of the configuration: how to sound, the contact
 * details it may give (from the company profile) and the only prices it may
 * quote. Used by WhatsApp, the web assistant and the simulator alike, so an
 * edit in the console changes all three.
 */
export function promptContextFor(
  config: BotConfig,
  company: CompanyContact,
  _language: Language,
  turn: Omit<BotPromptContext, "contact" | "personality" | "pricing"> = {}
): BotPromptContext {
  return {
    contact: company,
    personality: config.personality,
    pricing: config.pricing.map((entry) => ({
      label: entry.label,
      summary: [pick(entry.summary, "en"), entry.details ? pick(entry.details, "en") : ""]
        .filter(Boolean)
        .join("\n")
        .replace(/\*/g, ""),
    })),
    ...turn,
  };
}

/** Where a team's email notifications go, falling back to the sales inbox. */
export function teamRecipients(config: BotConfig, team: keyof BotConfig["teams"] | undefined, fallback?: string): string[] {
  const emails = team ? config.teams[team]?.emails ?? [] : [];
  if (emails.length) return emails;
  return fallback ? [fallback] : [];
}
