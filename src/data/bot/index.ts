import type { BotConfig } from "@/lib/bot/schema";
import { DEFAULT_BUSINESS_HOURS, DEFAULT_MESSAGES, DEFAULT_PERSONALITY } from "./copy";
import { DEFAULT_FLOWS, DEFAULT_OPTIONS } from "./flows";
import { DEFAULT_ACTIONS, DEFAULT_MENU } from "./menu";
import {
  DEFAULT_BROADCAST_CATEGORIES,
  DEFAULT_ENTERPRISE,
  DEFAULT_FOLLOW_UP,
  DEFAULT_HANDOVER,
  DEFAULT_INTENTS,
  DEFAULT_PRICING,
  DEFAULT_PROOF,
  DEFAULT_SCORING,
  DEFAULT_SOURCES,
  DEFAULT_TEAMS,
} from "./settings";

/**
 * The Pros-Link Assistant as it ships. Admin → Chatbot Studio overrides any
 * section of this; a section nobody has changed keeps following these
 * defaults, including when a later release improves them.
 */
export const DEFAULT_BOT_CONFIG: BotConfig = {
  businessHours: DEFAULT_BUSINESS_HOURS,
  personality: DEFAULT_PERSONALITY,
  messages: DEFAULT_MESSAGES,
  menu: DEFAULT_MENU,
  actions: DEFAULT_ACTIONS,
  flows: DEFAULT_FLOWS,
  intents: DEFAULT_INTENTS,
  options: DEFAULT_OPTIONS,
  pricing: DEFAULT_PRICING,
  teams: DEFAULT_TEAMS,
  scoring: DEFAULT_SCORING,
  enterprise: DEFAULT_ENTERPRISE,
  handover: DEFAULT_HANDOVER,
  followUp: DEFAULT_FOLLOW_UP,
  sources: DEFAULT_SOURCES,
  proof: DEFAULT_PROOF,
  broadcastCategories: DEFAULT_BROADCAST_CATEGORIES,
};
