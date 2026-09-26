import type { BotConfig } from "@/lib/bot/schema";

/**
 * =============================================================================
 *  Pros-Link Assistant — routing, scoring and automation defaults
 * =============================================================================
 *
 *  PRICING is empty on purpose: no prices were supplied, so the assistant
 *  quotes none and every price comes from the team in a quotation. Publish
 *  prices, if Pros-Link wants to, from Admin → Chatbot Studio → Pricing.
 *
 *  PROOF is empty on purpose: references and reviews reach customers only once
 *  someone at Pros-Link enters verified ones in the studio.
 *
 *  TEAMS have no inboxes yet. Until they are filled in, email notifications go
 *  to SALES_NOTIFY_EMAIL, and in-app notifications go to everyone whose role
 *  can work the record.
 * =============================================================================
 */

const PRODUCT = ["get_quote", "request_callback", "talk_to_sales"];
const SERVICE = ["request_repair", "request_maintenance", "talk_to_support"];

export const DEFAULT_INTENTS: BotConfig["intents"] = {
  DIGITAL_DUPLICATOR: { team: "SALES", categorySlug: "digital-duplicators", interest: "Digital duplicator", actions: PRODUCT, keywords: [] },
  PHOTOCOPIER: { team: "SALES", categorySlug: "photocopiers-mfps", interest: "Photocopier / MFP", actions: PRODUCT, keywords: [] },
  PRINTER: { team: "SALES", categorySlug: "printers", interest: "Printer", actions: PRODUCT, keywords: [] },
  OFFICE_EQUIPMENT: { team: "SALES", categorySlug: "office-equipment", interest: "Office equipment", actions: PRODUCT, keywords: [] },
  OFFICE_SUPPLIES: { team: "PARTS", categorySlug: "office-supplies", interest: "Stationery & papers", actions: ["get_quote", "explore_products", "talk_to_sales"], keywords: [] },
  CONSUMABLES: { team: "PARTS", categorySlug: "consumables", interest: "Consumables", actions: ["request_parts", "get_quote", "explore_products"], keywords: [] },
  PARTS_ACCESSORIES: { team: "PARTS", categorySlug: "parts-accessories", interest: "Parts & accessories", actions: ["request_parts", "explore_products", "talk_to_support"], keywords: [] },
  INSTALLATION: { team: "SERVICE", interest: "Installation", actions: ["request_installation", "talk_to_support", "main_menu"], keywords: [] },
  MAINTENANCE: { team: "SERVICE", interest: "Maintenance", actions: ["request_maintenance", "request_repair", "talk_to_support"], keywords: [] },
  REPAIR: { team: "SERVICE", interest: "Repair", actions: SERVICE, keywords: [] },
  TECHNICAL_SUPPORT: { team: "SERVICE", interest: "Technical support", actions: SERVICE, keywords: [] },
  OFFICE_SOLUTIONS: { team: "SALES", interest: "Office solutions", actions: ["request_callback", "get_quote", "talk_to_sales"], keywords: [] },
  PRODUCTS: { team: "SALES", actions: ["explore_products", "get_quote", "talk_to_sales"], keywords: [] },
  PRICING: { team: "SALES", actions: PRODUCT, keywords: [] },
  QUOTE: { team: "SALES", actions: ["get_quote"], keywords: [] },
  DEMO: { team: "SALES", actions: ["book_demo", "get_quote", "talk_to_sales"], keywords: [] },
  CALLBACK: { team: "SALES", actions: ["request_callback"], keywords: [] },
  SERVICE_REQUEST: { team: "SERVICE", actions: SERVICE, keywords: [] },
  TRACK_REQUEST: { team: "SUPPORT", actions: ["track_request", "customer_support", "main_menu"], keywords: [] },
  SUPPORT: { team: "SUPPORT", actions: ["customer_support", "talk_to_support", "main_menu"], keywords: [] },
  BILLING: { team: "ACCOUNTS", actions: ["talk_to_support", "main_menu"], keywords: [] },
  PARTNERSHIP: { team: "SALES", actions: ["talk_to_sales", "request_callback", "main_menu"], keywords: [] },
  CAREER: { team: "SUPPORT", actions: ["contact_us", "main_menu"], keywords: [] },
  GENERAL_INQUIRY: { team: "SALES", actions: ["explore_products", "get_quote", "talk_to_person"], keywords: [] },
  HUMAN_HANDOVER: { team: "SALES", node: "expert", actions: ["talk_to_person"], keywords: [] },
  CORPORATE: { team: "CORPORATE", actions: ["corporate_requirements", "request_callback", "talk_to_sales"], keywords: [] },
};

export const DEFAULT_PRICING: BotConfig["pricing"] = [];

export const DEFAULT_TEAMS: BotConfig["teams"] = {
  SALES: { label: "Sales", emails: [], ownerEmails: [] },
  CORPORATE: { label: "Corporate Sales", emails: [], ownerEmails: [] },
  SERVICE: { label: "Service", emails: [], ownerEmails: [] },
  SUPPORT: { label: "Customer Support", emails: [], ownerEmails: [] },
  PARTS: { label: "Parts & Supplies", emails: [], ownerEmails: [] },
  ACCOUNTS: { label: "Accounts", emails: [], ownerEmails: [] },
};

export const DEFAULT_SCORING: BotConfig["scoring"] = {
  weights: {
    businessIdentified: 10,
    clearRequirement: 15,
    quantityProvided: 10,
    largeOrder: 10,
    budgetProvided: 5,
    highBudget: 10,
    immediateTimeline: 10,
    corporate: 15,
    wantsCallback: 10,
    wantsDemo: 10,
  },
  bands: { warm: 31, hot: 61, highPriority: 81 },
  highBudgetPkr: 2_000_000,
  largeOrderQuantity: 6,
};

export const DEFAULT_ENTERPRISE: BotConfig["enterprise"] = {
  employeeThreshold: 200,
  branchThreshold: 5,
  keywords: [
    "tender",
    "bulk order",
    "bulk purchase",
    "all our branches",
    "all branches",
    "multiple branches",
    "several branches",
    "head office",
    "fleet of",
    "managed print",
    "corporate order",
    "procurement",
    "purchase order",
    "rfq",
  ],
};

export const DEFAULT_HANDOVER: BotConfig["handover"] = {
  pauseBot: false,
  lowConfidenceTurns: 2,
  notifyTemperatures: ["HOT", "HIGH_PRIORITY"],
  dedupeHours: 12,
  frustrationKeywords: [],
};

export const DEFAULT_FOLLOW_UP: BotConfig["followUp"] = {
  enabled: true,
  // Both inside WhatsApp's 24-hour customer service window, so neither needs
  // an approved template. Add a step past 24 hours only with `template` set.
  steps: [{ afterHours: 4 }, { afterHours: 22 }],
  temperatures: ["WARM", "HOT", "HIGH_PRIORITY"],
  message: {
    en: "Hi[[ {name}]] 👋\n\nJust checking in about your {service} enquiry. Would you like us to:",
    ur_roman: "Assalam o Alaikum[[ {name}]] 👋\n\nAap ki {service} ki enquiry ke baare mein poochna tha. Kya aap chahenge ke hum:",
    ur: "السلام علیکم[[ {name}]] 👋\n\nآپ کی {service} کی انکوائری کے بارے میں پوچھنا تھا۔ کیا آپ چاہیں گے کہ ہم:",
  },
  actions: ["request_callback", "get_quote", "continue_here"],
  template: null,
  onlyDuringBusinessHours: true,
};

export const DEFAULT_SOURCES: BotConfig["sources"] = {
  codes: [
    { code: "web", source: "WEBSITE" },
    { code: "site", source: "WEBSITE" },
    { code: "qr", source: "QR_CODE" },
    { code: "ig", source: "INSTAGRAM" },
    { code: "fb", source: "FACEBOOK" },
    { code: "tt", source: "TIKTOK" },
    { code: "meta", source: "META_ADS" },
    { code: "gads", source: "GOOGLE_ADS" },
    { code: "referral", source: "REFERRAL" },
  ],
  broadcastAttributionDays: 7,
};

export const DEFAULT_PROOF: BotConfig["proof"] = {
  references: [],
  installations: [],
  reviews: [],
};

export const DEFAULT_BROADCAST_CATEGORIES: BotConfig["broadcastCategories"] = [
  { key: "offers", label: "Offers & promotions", description: "Promotions on equipment and supplies." },
  { key: "product-updates", label: "Product updates", description: "New products and additions to the range." },
  { key: "service-reminders", label: "Service reminders", description: "Maintenance and service reminders for customers." },
  { key: "announcements", label: "Announcements", description: "Company news and announcements." },
];
