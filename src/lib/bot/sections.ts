import type { SectionKey } from "./schema";

/** How each configuration section is presented in Chatbot Studio. */
export const SECTION_INFO: Record<SectionKey, { title: string; group: string; description: string }> = {
  businessHours: {
    title: "Business hours",
    group: "Business",
    description:
      "When the team is available — null until real hours are entered. With hours set, the assistant tells customers when a person will reply and keeps follow-ups inside working hours. Days: 0 = Sunday … 6 = Saturday. Contact details live in Settings → Company profile.",
  },
  teams: {
    title: "Teams",
    group: "Business",
    description: "Each team's name, the inboxes its email notifications go to, and the console users (by email) its new leads are assigned to.",
  },
  pricing: {
    title: "Published pricing",
    group: "Business",
    description: "The only prices the assistant will ever quote, and the intents they apply to. Empty by default: every price then comes from the team in a quotation.",
  },
  proof: {
    title: "References",
    group: "Business",
    description: "Verified references, installations and reviews. Nothing reaches customers unless it is entered here.",
  },
  messages: {
    title: "Messages & welcome",
    group: "Conversation",
    description: "The welcome message and every fixed message: catalogue, tracking, handover, opt-out, errors. Placeholders like {name} and {reference} are filled in automatically.",
  },
  menu: {
    title: "Menus",
    group: "Conversation",
    description: "The main menu and its sub-menus. Each node is a menu (a list), a service explainer with buttons, or an action. Products come from the catalogue.",
  },
  actions: {
    title: "Buttons",
    group: "Conversation",
    description: "Reusable buttons — Request a Quote, Request Repair, Talk to Sales… — and what each one does. Button titles show at most 20 characters.",
  },
  flows: {
    title: "Question flows",
    group: "Conversation",
    description: "The questions each flow asks (quote, installation, service, parts, support, callback, demo, corporate, tracking), what they create in the CRM and the buttons offered at the end.",
  },
  options: {
    title: "Answer options",
    group: "Conversation",
    description: "Machine types, quantities, budget ranges, timelines and contact methods offered as choices in flows.",
  },
  intents: {
    title: "Intents & routing",
    group: "Automation",
    description: "For each intent: the team it routes to, the product category it maps to, the buttons under an answer and extra keywords that detect it.",
  },
  scoring: {
    title: "Lead scoring",
    group: "Automation",
    description: "Points per signal and the Cold / Warm / Hot / High Priority thresholds.",
  },
  enterprise: {
    title: "Corporate detection",
    group: "Automation",
    description: "Headcount and branch thresholds, and phrases (tender, bulk order…) that switch on corporate mode and alert the corporate team.",
  },
  handover: {
    title: "Human handover",
    group: "Automation",
    description: "When to hand a conversation to a person, which lead bands alert the team, and whether the assistant stays silent afterwards.",
  },
  followUp: {
    title: "Follow-up timing",
    group: "Automation",
    description: "When quiet WhatsApp leads get a check-in, which bands qualify, the message and buttons, and the approved template for check-ins after 24 hours.",
  },
  sources: {
    title: "Source tracking",
    group: "Automation",
    description: "ref: codes for links and QR codes (wa.me/…?text=Hi%20ref:qr:expo) and how long a broadcast reply is attributed to that broadcast.",
  },
  broadcastCategories: {
    title: "Broadcast categories",
    group: "Automation",
    description: "The categories broadcasts are organised under.",
  },
};
