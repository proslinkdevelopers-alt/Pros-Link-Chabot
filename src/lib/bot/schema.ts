import { z } from "zod";
import {
  BOT_EVENT_TYPES,
  BOT_INTENTS,
  FLOW_COMPLETIONS,
  FLOW_IDS,
  OPTION_SOURCES,
  PROOF_SECTIONS,
  STEP_FIELDS,
  TEAM_KEYS,
  TEMPERATURES,
  TRAFFIC_SOURCES,
  type BotIntent,
  type FlowId,
  type TeamKey,
} from "./types";

/**
 * =============================================================================
 *  Chatbot configuration — schema
 * =============================================================================
 *
 *  The shape of everything an administrator can change without touching code.
 *  The configuration is split into sections, each stored as its own row in
 *  `settings` (`bot.<section>`), so saving the pricing cannot clobber someone
 *  else's edit to the menu a minute earlier.
 *
 *  Each section is validated on save *and* on load: a stored section that no
 *  longer matches the schema (after an upgrade, say) is ignored in favour of
 *  the built-in default rather than taking the assistant down.
 *
 *  Isomorphic — the Chatbot Studio validates in the browser with the same code.
 * =============================================================================
 */

const text = z.string().trim().min(1);

export const localized = z.object({
  en: text,
  ur: z.string().optional(),
  ur_roman: z.string().optional(),
  pa: z.string().optional(),
});

const intent = z.enum(BOT_INTENTS);
const team = z.enum(TEAM_KEYS);
const flowId = z.enum(FLOW_IDS);

const choiceOption = z.object({
  value: text,
  title: localized,
  description: localized.optional(),
  serviceSlug: z.string().optional(),
  intent: intent.optional(),
  immediate: z.boolean().optional(),
  highValue: z.boolean().optional(),
  team: team.optional(),
});

const flowContext = z.object({
  intent: intent.optional(),
  team: team.optional(),
  serviceSlug: z.string().optional(),
  subService: z.string().optional(),
  goal: z.string().optional(),
  supportCategory: z.enum(["TECHNICAL", "BILLING", "SALES", "COMPLAINT", "GENERAL"]).optional(),
  topicLabel: z.string().optional(),
});

const actionRef = z.discriminatedUnion("type", [
  z.object({ type: z.literal("menu"), node: text }),
  z.object({ type: z.literal("flow"), flow: flowId, context: flowContext.optional() }),
  z.object({ type: z.literal("handover"), team: team.optional() }),
  z.object({ type: z.literal("pricing") }),
  z.object({
    type: z.literal("request"),
    event: z.enum(BOT_EVENT_TYPES),
    nextAction: text,
    body: localized,
    actions: z.array(text).optional(),
  }),
  z.object({ type: z.literal("say"), body: localized, actions: z.array(text).optional() }),
  z.object({ type: z.literal("proof"), section: z.enum(PROOF_SECTIONS) }),
]);

const menuNode = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("menu"),
    title: localized,
    description: localized.optional(),
    body: localized,
    children: z.array(text).min(1),
    intent: intent.optional(),
    team: team.optional(),
  }),
  z.object({
    kind: z.literal("service"),
    title: localized,
    description: localized.optional(),
    intent,
    team,
    serviceSlug: z.string().optional(),
    subService: z.string().optional(),
    body: localized,
    actions: z.array(text),
  }),
  z.object({
    kind: z.literal("action"),
    title: localized,
    description: localized.optional(),
    do: actionRef,
    intent: intent.optional(),
    team: team.optional(),
  }),
]);

const flowStep = z.object({
  field: z.enum(STEP_FIELDS),
  ask: localized,
  kind: z.enum(["choice", "text"]),
  options: z.array(choiceOption).optional(),
  optionsFrom: z.enum(OPTION_SOURCES).optional(),
  optional: z.boolean().optional(),
  goals: z.array(text).optional(),
  quickAnswers: z.array(choiceOption).max(2).optional(),
});

const flowDefinition = z.object({
  title: localized,
  intro: localized.optional(),
  intent: intent.optional(),
  team,
  completion: z.enum(FLOW_COMPLETIONS),
  event: z.enum(BOT_EVENT_TYPES).optional(),
  nextAction: text,
  escalate: z.boolean().optional(),
  steps: z.array(flowStep).min(1),
  done: z.object({ body: localized, actions: z.array(text) }),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");

// ---------------------------------------------------------------- Sections --

export const sectionSchemas = {
  contact: z.object({
    /** The WhatsApp Business number the assistant runs on — share it in wa.me links, QR codes and ads. */
    whatsappCta: z.string(),
    businessPhone: z.string(),
    email: z.string(),
    website: z.string(),
    whatbotUrl: z.string(),
    address: z.string(),
    hours: localized,
  }),

  businessHours: z.object({
    timezone: text,
    /** 0 = Sunday … 6 = Saturday. */
    days: z.array(z.number().int().min(0).max(6)).min(1),
    open: hhmm,
    close: hhmm,
  }),

  personality: z.object({
    assistantName: text,
    /** A few sentences on voice, added to the representative's instructions. */
    tone: z.string(),
    /** Anything else the representative must always do or never do. */
    instructions: z.string(),
  }),

  messages: z.object({
    welcome: localized,
    menuButton: localized,
    moreOptions: localized,
    mainMenu: localized,
    skip: localized,
    footer: localized,
    optOut: localized,
    optIn: localized,
    media: localized,
    busy: localized,
    nameConfirm: localized,
    nameConfirmYes: localized,
    nameConfirmOther: localized,
    askAgain: localized,
    resumeFlow: localized,
    meetingSlotRetry: localized,
    handover: localized,
    handoverOffHours: localized,
    handoverExisting: localized,
    handoverChooseTeam: localized,
    enterprise: localized,
    pricingUnavailable: localized,
    proofEmpty: localized,
    lowConfidence: localized,
    unknownButton: localized,
    brief: localized,
  }),

  menu: z.object({
    root: text,
    nodes: z.record(text, menuNode),
  }),

  actions: z.record(text, z.object({ title: localized, description: localized.optional(), do: actionRef })),

  flows: z.record(flowId, flowDefinition),

  intents: z.record(
    intent,
    z.object({
      team,
      serviceSlug: z.string().optional(),
      subService: z.string().optional(),
      /** Menu node that explains it. */
      node: z.string().optional(),
      /** Buttons offered under an answer about it. */
      actions: z.array(text),
      /** Extra words that should detect it, on top of the built-in ones. */
      keywords: z.array(z.string()),
    })
  ),

  options: z.object({
    services: z.array(choiceOption).min(1),
    budgets: z.object({ USD: z.array(choiceOption).min(1), PKR: z.array(choiceOption).min(1) }),
    timelines: z.array(choiceOption).min(1),
  }),

  countries: z
    .array(
      z.object({
        code: z.string().length(2),
        name: text,
        flag: z.string(),
        /** ISO 4217. Budgets are offered in PKR for PKR and in US dollars otherwise. */
        currency: z.string().length(3),
        dialCodes: z.array(z.string().regex(/^\d{1,4}$/)),
        /** Canadian and US numbers share +1, so area codes tell them apart. */
        areaCodes: z.array(z.string().regex(/^\d{3}$/)).optional(),
        tlds: z.array(z.string()),
        keywords: z.array(z.string()),
      })
    )
    .min(1),

  pricing: z.array(
    z.object({
      id: text,
      label: text,
      intents: z.array(intent),
      summary: localized,
      details: localized.optional(),
      actions: z.array(text),
    })
  ),

  teams: z.record(
    team,
    z.object({
      label: text,
      /** Where this team's notifications go. Empty means the sales inbox. */
      emails: z.array(z.string().email()),
      /** Console users (by email) new leads for this team are assigned to. */
      ownerEmails: z.array(z.string().email()),
    })
  ),

  scoring: z.object({
    weights: z.object({
      businessIdentified: z.number().int().min(0).max(100),
      websiteProvided: z.number().int().min(0).max(100),
      clearService: z.number().int().min(0).max(100),
      budgetProvided: z.number().int().min(0).max(100),
      immediateTimeline: z.number().int().min(0).max(100),
      enterprise: z.number().int().min(0).max(100),
      highBudget: z.number().int().min(0).max(100),
      wantsStrategyCall: z.number().int().min(0).max(100),
      wantsDemo: z.number().int().min(0).max(100),
    }),
    /** Lowest score of each band; below `warm` is Cold. */
    bands: z.object({
      warm: z.number().int().min(1).max(100),
      hot: z.number().int().min(1).max(100),
      highPriority: z.number().int().min(1).max(100),
    }),
    /** A budget at or above this, in US dollars, counts as high value. */
    highBudgetUsd: z.number().positive(),
    /** Rupees per dollar, used only to compare a PKR budget with the threshold. */
    pkrPerUsd: z.number().positive(),
  }),

  enterprise: z.object({
    employeeThreshold: z.number().int().positive(),
    branchThreshold: z.number().int().positive(),
    keywords: z.array(z.string()),
  }),

  handover: z.object({
    /** Stay silent on a thread after it is handed to a person. */
    pauseBot: z.boolean(),
    /** Offer a person after this many turns the assistant could not answer. */
    lowConfidenceTurns: z.number().int().min(1).max(10),
    /** Tell the team, with a full summary, when a lead reaches these bands. */
    notifyTemperatures: z.array(z.enum(TEMPERATURES)),
    /** A second handover request inside this window reuses the first ticket. */
    dedupeHours: z.number().min(0),
    /** Extra words that mean the customer is upset, on top of the built-in ones. */
    frustrationKeywords: z.array(z.string()),
  }),

  followUp: z.object({
    enabled: z.boolean(),
    /** Hours after the customer's last message. Steps past 24h need `template`. */
    steps: z.array(z.object({ afterHours: z.number().positive() })).max(5),
    temperatures: z.array(z.enum(TEMPERATURES)).min(1),
    message: localized,
    actions: z.array(text),
    template: z
      .object({
        name: text,
        languageCode: text,
        variables: z.array(z.enum(["name", "service"])),
      })
      .nullable(),
    onlyDuringBusinessHours: z.boolean(),
  }),

  sources: z.object({
    /** `ref:<code>` in a prefilled WhatsApp message attributes the thread. */
    codes: z.array(
      z.object({
        code: z.string().regex(/^[a-z0-9_-]{1,32}$/i, "Letters, digits, - and _ only"),
        source: z.enum(TRAFFIC_SOURCES),
        campaign: z.string().optional(),
      })
    ),
    /** A reply this many days after a broadcast is attributed to it. */
    broadcastAttributionDays: z.number().int().min(0).max(60),
  }),

  proof: z.object({
    caseStudies: z.array(z.object({ title: text, summary: text, link: z.string().url().optional() })),
    results: z.array(z.object({ title: text, summary: text, link: z.string().url().optional() })),
    websites: z.array(z.object({ title: text, summary: text, link: z.string().url().optional() })),
    aiProjects: z.array(z.object({ title: text, summary: text, link: z.string().url().optional() })),
    whatsappProjects: z.array(z.object({ title: text, summary: text, link: z.string().url().optional() })),
    campaigns: z.array(z.object({ title: text, summary: text, link: z.string().url().optional() })),
    reviews: z.array(z.object({ title: text, summary: text, link: z.string().url().optional() })),
    industries: z.array(z.object({ title: text, summary: text, link: z.string().url().optional() })),
  }),

  broadcastCategories: z.array(
    z.object({ key: z.string().regex(/^[a-z0-9_-]+$/), label: text, description: z.string() })
  ),
} as const;

export type SectionKey = keyof typeof sectionSchemas;
export const SECTION_KEYS = Object.keys(sectionSchemas) as SectionKey[];

export const botConfigSchema = z.object(sectionSchemas);
export type BotConfig = z.infer<typeof botConfigSchema>;

// ------------------------------------------------------- Cross-references ---

/**
 * Problems a section schema cannot see on its own: a menu child, action or
 * flow that does not exist. Returned as readable lines for the studio.
 */
export function crossReferenceIssues(config: BotConfig): string[] {
  const issues: string[] = [];
  const nodes = config.menu.nodes;
  const actions = config.actions;

  const checkActions = (where: string, keys: string[] | undefined) => {
    for (const key of keys ?? []) {
      if (!actions[key]) issues.push(`${where} uses the action "${key}", which does not exist.`);
    }
  };
  const checkRef = (where: string, ref: z.infer<typeof actionRef>) => {
    if (ref.type === "menu" && !nodes[ref.node]) {
      issues.push(`${where} opens the menu "${ref.node}", which does not exist.`);
    }
    if (ref.type === "flow" && !config.flows[ref.flow]) {
      issues.push(`${where} starts the flow "${ref.flow}", which does not exist.`);
    }
    if ((ref.type === "request" || ref.type === "say") && ref.actions) checkActions(where, ref.actions);
  };

  if (!nodes[config.menu.root]) issues.push(`The main menu "${config.menu.root}" does not exist.`);

  for (const [id, node] of Object.entries(nodes)) {
    if (node.kind === "menu") {
      for (const child of node.children) {
        if (!nodes[child]) issues.push(`Menu "${id}" lists "${child}", which does not exist.`);
      }
    }
    if (node.kind === "service") checkActions(`Service "${id}"`, node.actions);
    if (node.kind === "action") checkRef(`Menu item "${id}"`, node.do);
  }

  for (const [key, action] of Object.entries(actions)) checkRef(`Action "${key}"`, action.do);

  for (const [id, flow] of Object.entries(config.flows)) {
    checkActions(`Flow "${id}"`, flow.done.actions);
    for (const step of flow.steps) {
      if (step.kind === "choice" && !step.options?.length && !step.optionsFrom) {
        issues.push(`Flow "${id}" asks for ${step.field} as a choice but gives no options.`);
      }
    }
  }

  for (const [key, entry] of Object.entries(config.intents)) {
    checkActions(`Intent ${key}`, entry.actions);
    if (entry.node && !nodes[entry.node]) {
      issues.push(`Intent ${key} points at the menu item "${entry.node}", which does not exist.`);
    }
  }
  for (const entry of config.pricing) checkActions(`Pricing "${entry.id}"`, entry.actions);
  checkActions("Follow-up", config.followUp.actions);

  for (const intentKey of BOT_INTENTS) {
    if (!config.intents[intentKey as BotIntent]) issues.push(`Intent ${intentKey} has no settings.`);
  }
  for (const flowKey of FLOW_IDS) {
    if (!config.flows[flowKey as FlowId]) issues.push(`Flow ${flowKey} is missing.`);
  }
  for (const teamKey of TEAM_KEYS) {
    if (!config.teams[teamKey as TeamKey]) issues.push(`Team ${teamKey} is missing.`);
  }

  const { warm, hot, highPriority } = config.scoring.bands;
  if (!(warm < hot && hot < highPriority)) {
    issues.push("Score bands must rise: warm < hot < high priority.");
  }

  return issues;
}
