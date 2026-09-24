import type { BotConfig } from "./schema";

/** Where a team's email notifications go, falling back to the sales inbox. */
export function teamRecipients(config: BotConfig, team: keyof BotConfig["teams"] | undefined, fallback?: string): string[] {
  const emails = team ? config.teams[team]?.emails ?? [] : [];
  if (emails.length) return emails;
  return fallback ? [fallback] : [];
}
