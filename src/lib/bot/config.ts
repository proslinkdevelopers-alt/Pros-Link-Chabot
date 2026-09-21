import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { logEvent } from "@/lib/notify";
import { DEFAULT_BOT_CONFIG } from "@/data/marketing/bot";
import {
  SECTION_KEYS,
  botConfigSchema,
  crossReferenceIssues,
  sectionSchemas,
  type BotConfig,
  type SectionKey,
} from "./schema";

/**
 * =============================================================================
 *  Chatbot configuration — storage
 * =============================================================================
 *
 *  The effective configuration is the built-in defaults with any section an
 *  administrator has saved laid over the top. Each saved section lives in the
 *  `settings` table as `bot.<section>`.
 *
 *  Read on every WhatsApp message, so it is cached in memory for a short
 *  while; saving clears this instance's cache immediately, and other instances
 *  pick the change up within `CACHE_MS`.
 *
 *  A database outage or a stored section that no longer validates never takes
 *  the assistant down: the defaults are used and the problem is reported to the
 *  studio.
 * =============================================================================
 */

const KEY_PREFIX = "bot.";
const CACHE_MS = 30_000;

export interface ConfigState {
  config: BotConfig;
  /** Sections whose stored value is in use. */
  customised: SectionKey[];
  /** Stored sections that failed validation and were ignored. */
  invalid: Array<{ section: SectionKey; issues: string[] }>;
  /** Broken references in the effective configuration. */
  warnings: string[];
  /** Set when the settings could not be read at all. */
  error?: string;
}

let cache: { state: ConfigState; at: number } | null = null;

function zodIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string[] {
  return error.issues.slice(0, 20).map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

export async function loadConfigState(options: { fresh?: boolean } = {}): Promise<ConfigState> {
  if (!options.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.state;

  const config: BotConfig = structuredClone(DEFAULT_BOT_CONFIG);
  const customised: SectionKey[] = [];
  const invalid: ConfigState["invalid"] = [];
  let error: string | undefined;

  try {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: KEY_PREFIX } },
      select: { key: true, value: true },
    });

    for (const row of rows) {
      const section = row.key.slice(KEY_PREFIX.length) as SectionKey;
      if (!SECTION_KEYS.includes(section)) continue;
      const parsed = sectionSchemas[section].safeParse(row.value);
      if (parsed.success) {
        (config as Record<SectionKey, unknown>)[section] = parsed.data;
        customised.push(section);
      } else {
        invalid.push({ section, issues: zodIssues(parsed.error) });
      }
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message.split("\n").find(Boolean) : String(caught);
    console.warn("[bot-config] using defaults:", error);
  }

  const state: ConfigState = { config, customised, invalid, warnings: crossReferenceIssues(config), error };
  for (const entry of invalid) {
    console.warn(`[bot-config] stored section "${entry.section}" ignored:`, entry.issues.join("; "));
  }

  // A failed read is not cached for long, so the assistant recovers as soon as
  // the database does.
  cache = { state, at: error ? Date.now() - CACHE_MS + 5_000 : Date.now() };
  return state;
}

/** The configuration the assistant should use right now. */
export async function getBotConfig(): Promise<BotConfig> {
  return (await loadConfigState()).config;
}

export type SaveResult = { ok: true; warnings: string[] } | { ok: false; issues: string[] };

/**
 * Validate and store one section. Refused when the section is malformed or
 * would leave the configuration pointing at menus, flows or actions that do
 * not exist.
 */
export async function saveSection(section: SectionKey, value: unknown, userId?: string): Promise<SaveResult> {
  const parsed = sectionSchemas[section].safeParse(value);
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) };

  const current = await loadConfigState({ fresh: true });
  const next = { ...current.config, [section]: parsed.data } as BotConfig;
  const whole = botConfigSchema.safeParse(next);
  if (!whole.success) return { ok: false, issues: zodIssues(whole.error) };

  const issues = crossReferenceIssues(whole.data);
  const introduced = issues.filter((issue) => !current.warnings.includes(issue));
  if (introduced.length) return { ok: false, issues: introduced };

  const key = `${KEY_PREFIX}${section}`;
  await prisma.setting.upsert({
    where: { key },
    update: { value: parsed.data as Prisma.InputJsonValue, department: DEPARTMENT, group: "chatbot" },
    create: {
      key,
      value: parsed.data as Prisma.InputJsonValue,
      department: DEPARTMENT,
      group: "chatbot",
      description: `Chatbot Studio — ${section}`,
    },
  });

  cache = null;
  await logEvent({
    action: "bot.config.saved",
    entity: "Setting",
    entityId: key,
    message: `Chatbot configuration section "${section}" updated.`,
    userId,
  });
  return { ok: true, warnings: issues };
}

/** Forget a stored section so the built-in default applies again. */
export async function resetSection(section: SectionKey, userId?: string): Promise<void> {
  const key = `${KEY_PREFIX}${section}`;
  await prisma.setting.deleteMany({ where: { key } });
  cache = null;
  await logEvent({
    action: "bot.config.reset",
    entity: "Setting",
    entityId: key,
    message: `Chatbot configuration section "${section}" reset to the default.`,
    userId,
  });
}
