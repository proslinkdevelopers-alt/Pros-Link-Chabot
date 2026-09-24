import type { Language } from "@/lib/i18n";

/**
 * =============================================================================
 *  Pros-Link Assistant — shared vocabulary
 * =============================================================================
 *
 *  The names every part of the assistant agrees on: intents, teams, lead
 *  temperatures, menu nodes, flows, actions and the per-conversation state.
 *
 *  Everything a person at Pros-Link might want to change — wording, menus,
 *  questions, scoring weights, team inboxes — is *data* shaped by these types
 *  and lives in the chatbot configuration, not in code. What stays in code is
 *  what the engine knows how to *do*: the flow completions, the action kinds
 *  and the profile fields a question can fill.
 *
 *  Isomorphic: no server imports, so the admin console can use the same types.
 * =============================================================================
 */

/** Copy in each supported language. English is required; the rest fall back. */
export type Localized = { en: string } & Partial<Record<Exclude<Language, "en">, string>>;

// ---------------------------------------------------------------- Intents ---

export const BOT_INTENTS = [
  // What the customer is interested in — product areas and service lines.
  "DIGITAL_DUPLICATOR",
  "PHOTOCOPIER",
  "PRINTER",
  "OFFICE_EQUIPMENT",
  "OFFICE_SUPPLIES",
  "CONSUMABLES",
  "PARTS_ACCESSORIES",
  "INSTALLATION",
  "MAINTENANCE",
  "REPAIR",
  "TECHNICAL_SUPPORT",
  "OFFICE_SOLUTIONS",
  // What the customer wants to happen.
  "PRODUCTS",
  "PRICING",
  "QUOTE",
  "DEMO",
  "CALLBACK",
  "SERVICE_REQUEST",
  "TRACK_REQUEST",
  "SUPPORT",
  "BILLING",
  "PARTNERSHIP",
  "CAREER",
  "GENERAL_INQUIRY",
  "HUMAN_HANDOVER",
  "CORPORATE",
] as const;

export type BotIntent = (typeof BOT_INTENTS)[number];

/** Intents that name something Pros-Link sells or services, as opposed to a request. */
export const SERVICE_INTENTS: readonly BotIntent[] = [
  "DIGITAL_DUPLICATOR",
  "PHOTOCOPIER",
  "PRINTER",
  "OFFICE_EQUIPMENT",
  "OFFICE_SUPPLIES",
  "CONSUMABLES",
  "PARTS_ACCESSORIES",
  "INSTALLATION",
  "MAINTENANCE",
  "REPAIR",
  "TECHNICAL_SUPPORT",
  "OFFICE_SOLUTIONS",
];

/** Service lines — interest in these routes to the service team, not sales. */
export const SERVICE_LINE_INTENTS: readonly BotIntent[] = ["INSTALLATION", "MAINTENANCE", "REPAIR", "TECHNICAL_SUPPORT"];

export function isServiceIntent(intent: BotIntent | undefined): boolean {
  return Boolean(intent && SERVICE_INTENTS.includes(intent));
}

// ------------------------------------------------------------------ Teams ---

export const TEAM_KEYS = ["SALES", "CORPORATE", "SERVICE", "SUPPORT", "PARTS", "ACCOUNTS"] as const;

export type TeamKey = (typeof TEAM_KEYS)[number];

// ------------------------------------------------------------------ Leads ---

export const TEMPERATURES = ["COLD", "WARM", "HOT", "HIGH_PRIORITY"] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const TRAFFIC_SOURCES = [
  "META_ADS",
  "GOOGLE_ADS",
  "WEBSITE",
  "QR_CODE",
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
  "DIRECT_WHATSAPP",
  "REFERRAL",
  "CAMPAIGN",
  "BROADCAST",
  "OTHER",
] as const;

export type TrafficSourceKey = (typeof TRAFFIC_SOURCES)[number];

/** Ticket categories a flow can raise — mirrors `TicketCategory` in the schema. */
export const SUPPORT_CATEGORIES = [
  "INSTALLATION",
  "TECHNICAL",
  "MAINTENANCE",
  "REPAIR",
  "SERVICE",
  "PARTS",
  "COMPLAINT",
  "CALLBACK",
  "BILLING",
  "GENERAL",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

// ------------------------------------------------------------ Bot events ----

/** Values written to `bot_events.type`. */
export const BOT_EVENT_TYPES = [
  "CONVERSATION_STARTED",
  "MENU_OPENED",
  "SERVICE_VIEWED",
  "CATALOG_VIEWED",
  "PRODUCT_VIEWED",
  "FLOW_STARTED",
  "FLOW_COMPLETED",
  "QUOTE_REQUESTED",
  "DEMO_REQUESTED",
  "CALL_REQUESTED",
  "SERVICE_REQUESTED",
  "TRACK_REQUESTED",
  "PRICING_VIEWED",
  "LEAD_CAPTURED",
  "LEAD_HOT",
  "ENTERPRISE_DETECTED",
  "HANDOVER",
  "TICKET_CREATED",
  "ATTACHMENT_RECEIVED",
  "FOLLOW_UP_SENT",
  "OPTED_OUT",
  "OPTED_IN",
  "FALLBACK",
] as const;

export type BotEventType = (typeof BOT_EVENT_TYPES)[number];

// ---------------------------------------------------------------- Profile ---

/**
 * Profile fields a flow question can fill. Each is a key of `CustomerDetails`
 * (`lib/ai/customer.ts`), with these handled specially:
 *
 *  - `visitSlot` is answered in the customer's own words, for the team to confirm,
 *  - `name` is offered as a one-tap confirmation when WhatsApp supplied a profile name,
 *  - `phone` and `whatsapp` are known on WhatsApp from the number itself,
 *  - `attachment` is answered by a photo or document on WhatsApp and skipped on the web.
 */
export const STEP_FIELDS = [
  "name",
  "phone",
  "whatsapp",
  "email",
  "company",
  "businessType",
  "city",
  "address",
  "productCategory",
  "quantity",
  "requirements",
  "budget",
  "timeline",
  "preferredContact",
  "companySize",
  "machineType",
  "machineBrand",
  "machineModel",
  "serialNumber",
  "priority",
  "visitSlot",
  "meetingMode",
  "attachment",
  "trackingReference",
] as const;

export type StepField = (typeof STEP_FIELDS)[number];

// ------------------------------------------------------------------ Menus ---

/** One option offered as a button or a list row. */
export interface ChoiceOption {
  /** Stored as the answer. Kept in English so the CRM reads the same for everyone. */
  value: string;
  title: Localized;
  description?: Localized;
  /** Product category this option implies. */
  categorySlug?: string;
  /** Intent this option implies. */
  intent?: BotIntent;
  /** Timeline options: this one counts as an immediate start for scoring. */
  immediate?: boolean;
  /** Budget and quantity options: this one counts as a large order for scoring. */
  highValue?: boolean;
  /** Team options: which team this routes to. */
  team?: TeamKey;
}

export type ActionRef =
  | { type: "menu"; node: string }
  | { type: "flow"; flow: FlowId; context?: FlowContext }
  | { type: "handover"; team?: TeamKey }
  | { type: "pricing" }
  /** The product catalogue: categories, or the published products in one. */
  | { type: "catalog"; category?: string }
  /** The contact details entered in Admin → Settings → Company profile. */
  | { type: "contact" }
  /** A request the team acts on without a flow of its own. */
  | {
      type: "request";
      event: BotEventType;
      nextAction: string;
      body: Localized;
      actions?: string[];
    }
  | { type: "say"; body: Localized; actions?: string[] }
  | { type: "proof"; section: ProofSection };

export interface ActionDefinition {
  /** Button title. WhatsApp shows at most 20 characters on a button, 24 in a list. */
  title: Localized;
  description?: Localized;
  do: ActionRef;
}

interface MenuNodeBase {
  title: Localized;
  description?: Localized;
}

/** A list of further nodes. */
export interface MenuListNode extends MenuNodeBase {
  kind: "menu";
  body: Localized;
  children: string[];
  intent?: BotIntent;
  team?: TeamKey;
}

/** An explainer followed by next-step buttons. */
export interface ServiceNode extends MenuNodeBase {
  kind: "service";
  intent: BotIntent;
  team: TeamKey;
  categorySlug?: string;
  interest?: string;
  body: Localized;
  actions: string[];
}

/** A shortcut straight into a flow, or any other action. */
export interface ActionNode extends MenuNodeBase {
  kind: "action";
  do: ActionRef;
  intent?: BotIntent;
  team?: TeamKey;
}

export type MenuNode = MenuListNode | ServiceNode | ActionNode;

// ------------------------------------------------------------------ Flows ---

export const FLOW_IDS = [
  "quote",
  "installation",
  "service",
  "parts",
  "support",
  "callback",
  "demo",
  "corporate",
  "track",
] as const;

export type FlowId = (typeof FLOW_IDS)[number];

/** What happens when a flow's questions are answered. */
export const FLOW_COMPLETIONS = ["lead", "quote", "brief", "ticket", "meeting", "handover", "track"] as const;
export type FlowCompletion = (typeof FLOW_COMPLETIONS)[number];

/** Where a set of choice options comes from when it is not written inline. */
export const OPTION_SOURCES = ["categories", "machines", "quantities", "budgets", "timelines", "contactMethods"] as const;
export type OptionSource = (typeof OPTION_SOURCES)[number];

export interface FlowStep {
  field: StepField;
  ask: Localized;
  kind: "choice" | "text";
  options?: ChoiceOption[];
  optionsFrom?: OptionSource;
  /** Offer a Skip button and move on without an answer. */
  optional?: boolean;
  /** Only ask when the flow's goal is one of these. */
  goals?: string[];
  /** Only ask on this channel (WhatsApp knows the number; only WhatsApp can send photos). */
  channels?: Array<"WEB" | "WHATSAPP">;
  /** A one-tap answer offered under a text question, e.g. "Same number". */
  quickAnswers?: ChoiceOption[];
}

export interface FlowDefinition {
  title: Localized;
  intro?: Localized;
  intent?: BotIntent;
  team: TeamKey;
  completion: FlowCompletion;
  /** Recorded when the flow starts — QUOTE_REQUESTED, SERVICE_REQUESTED… */
  event?: BotEventType;
  /** CRM next action for the team once the flow completes. */
  nextAction: string;
  /** Hand the finished flow to the team with a full summary. */
  escalate?: boolean;
  steps: FlowStep[];
  done: { body: Localized; actions: string[] };
}

/** What the flow was started *about* — set by the menu or message that opened it. */
export interface FlowContext {
  intent?: BotIntent;
  team?: TeamKey;
  categorySlug?: string;
  interest?: string;
  goal?: string;
  supportCategory?: SupportCategory;
  /** Shown on the ticket subject, e.g. "Repair request". */
  topicLabel?: string;
}

// ------------------------------------------------------------------ Proof ---

export const PROOF_SECTIONS = ["references", "installations", "reviews"] as const;

export type ProofSection = (typeof PROOF_SECTIONS)[number];

/**
 * One piece of verified work. Nothing reaches a customer from here unless a
 * person at Pros-Link entered it — the assistant never makes up clients or
 * testimonials, so an empty section says so honestly instead.
 */
export interface ProofItem {
  title: string;
  summary: string;
  link?: string;
}

// ------------------------------------------------------------------ State ---

export interface ActiveFlow {
  id: FlowId;
  context: FlowContext;
  /** The field the last question asked for, when the customer has not answered it. */
  pending?: StepField;
  /** How many times the pending question has been asked without an answer. */
  retries: number;
  /** Optional fields the customer chose to skip. */
  skipped: StepField[];
  /** A visit time the customer gave in words the extractor could not date. */
  meetingNote?: string;
  /** Photos or documents received during this flow. */
  attachments?: number;
  startedAt: string;
}

/**
 * Everything the assistant remembers about a conversation besides the
 * customer's details, stored under `conversations.capture.bot`.
 */
export interface BotState {
  flow?: ActiveFlow;
  /** The last list shown, so "More options" knows where to continue. */
  menu?: { node: string; page: number };
  /** The product or service this conversation is about. */
  intent?: BotIntent;
  team?: TeamKey;
  /** The catalogue product the customer last opened. */
  productId?: string;
  signals: {
    wantsDemo?: boolean;
    wantsCall?: boolean;
    wantsQuote?: boolean;
    enterprise?: boolean;
  };
  score?: { value: number; temperature: Temperature; reasons: string[] };
  /** `silent`: the team was alerted but the customer was not told a person took over. */
  handover?: { team: TeamKey; reference?: string; at: string; reason: string; silent?: boolean };
  /** Consecutive turns the assistant could not answer. */
  fallbacks: number;
  /** The last menus, products and flows the customer chose, oldest first. */
  trail: string[];
  /** Hot-lead alerts already sent, so each band is announced once. */
  alerted?: Temperature[];
}

export function emptyBotState(): BotState {
  return { signals: {}, fallbacks: 0, trail: [] };
}

/** Narrow the untyped JSON stored on the conversation back to a `BotState`. */
export function readBotState(value: unknown): BotState {
  const state = emptyBotState();
  if (!value || typeof value !== "object") return state;
  const raw = value as Partial<BotState>;
  const flow = raw.flow && FLOW_IDS.includes(raw.flow.id as FlowId) ? raw.flow : undefined;
  const intent = raw.intent && BOT_INTENTS.includes(raw.intent) ? raw.intent : undefined;
  const team = raw.team && TEAM_KEYS.includes(raw.team) ? raw.team : undefined;
  return {
    ...state,
    ...raw,
    flow,
    intent,
    team,
    signals: { ...(raw.signals ?? {}) },
    fallbacks: typeof raw.fallbacks === "number" ? raw.fallbacks : 0,
    trail: Array.isArray(raw.trail) ? raw.trail.filter((entry) => typeof entry === "string").slice(-12) : [],
  };
}
