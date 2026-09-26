import { BRAND } from "@/config/brand";
import type { BotConfig } from "@/lib/bot/schema";
import type { FlowContext } from "@/lib/bot/types";

/**
 * =============================================================================
 *  Pros-Link Assistant — menu tree and actions
 * =============================================================================
 *
 *  Nodes are a flat map so any node can appear in more than one menu and so
 *  the studio can validate references by id. The main menu is the ten items
 *  of the Pros-Link brief, in its order.
 *
 *  WhatsApp's length limits, which these titles respect:
 *    • list row title   24 characters
 *    • button title     20 characters
 *    • list row description 72 characters
 *
 *  Titles are plain words — no emoji clutter — so the assistant reads like a
 *  professional service desk. Product categories and products are not listed
 *  here: they come from the catalogue (Admin → Categories / Products).
 * =============================================================================
 */

type Nodes = BotConfig["menu"]["nodes"];

const serviceFlow = (context: FlowContext) => ({ type: "flow" as const, flow: "service" as const, context });

// --------------------------------------------------------------- Main menu --

const MAIN: Nodes = {
  root: {
    kind: "menu",
    title: { en: "Main Menu", ur_roman: "Main Menu", ur: "مین مینو" },
    body: {
      en: "How can I help you today? Pick an option — or just tell me what you need.",
      ur_roman: "Aaj main aap ki kya madad kar sakta hoon? Koi option chunein — ya seedha apni zaroorat likh dein.",
      ur: "آج میں آپ کی کیا مدد کر سکتا ہوں؟ کوئی آپشن چنیں — یا سیدھا اپنی ضرورت لکھ دیں۔",
    },
    children: ["products", "quote", "service", "repair", "supplies", "sales", "support", "track", "about", "contact"],
  },

  products: {
    kind: "action",
    title: { en: "Products", ur_roman: "Products", ur: "پروڈکٹس" },
    description: {
      en: "Duplicators, copiers, printers and more",
      ur_roman: "Duplicators, copiers, printers aur mazeed",
      ur: "ڈپلیکیٹرز، کاپیئرز، پرنٹرز اور مزید",
    },
    do: { type: "catalog" },
    intent: "PRODUCTS",
    team: "SALES",
  },

  quote: {
    kind: "action",
    title: { en: "Request a Quote", ur_roman: "Quotation Lein", ur: "کوٹیشن لیں" },
    description: {
      en: "Tell us what you need — we'll prepare a price",
      ur_roman: "Zaroorat batayein — hum qeemat tayyar karenge",
      ur: "ضرورت بتائیں — ہم قیمت تیار کریں گے",
    },
    do: { type: "flow", flow: "quote" },
    intent: "QUOTE",
    team: "SALES",
  },

  service: {
    kind: "menu",
    title: { en: "Installation & Support", ur_roman: "Installation & Support", ur: "انسٹالیشن اور سپورٹ" },
    description: {
      en: "Installation, technical support, parts",
      ur_roman: "Installation, technical support, parts",
      ur: "انسٹالیشن، تکنیکی مدد، پارٹس",
    },
    body: {
      en: "🛠️ What do you need help with?",
      ur_roman: "🛠️ Aap ko kis cheez mein madad chahiye?",
      ur: "🛠️ آپ کو کس چیز میں مدد چاہیے؟",
    },
    children: ["svc_installation", "svc_technical", "svc_maintenance", "svc_repair", "svc_request", "svc_parts", "svc_general"],
    team: "SERVICE",
  },

  repair: {
    kind: "menu",
    title: { en: "Repair / Maintenance", ur_roman: "Repair / Maintenance", ur: "مرمت / مینٹیننس" },
    description: {
      en: "Machine not working, or due for servicing",
      ur_roman: "Machine kharab hai, ya servicing chahiye",
      ur: "مشین خراب ہے، یا سروسنگ چاہیے",
    },
    body: {
      en: "🔧 Is this a repair or routine maintenance?",
      ur_roman: "🔧 Kya ye repair hai ya routine maintenance?",
      ur: "🔧 کیا یہ مرمت ہے یا معمول کی مینٹیننس؟",
    },
    children: ["rep_repair", "rep_maintenance", "rep_track"],
    intent: "REPAIR",
    team: "SERVICE",
  },

  supplies: {
    kind: "menu",
    title: { en: "Stationery", ur_roman: "Stationery", ur: "اسٹیشنری" },
    description: {
      en: "Stationery, papers, toner and parts",
      ur_roman: "Stationery, papers, toner aur parts",
      ur: "اسٹیشنری، کاغذ، ٹونر اور پارٹس",
    },
    body: {
      en: "📦 What are you looking for?",
      ur_roman: "📦 Aap kya dhoond rahe hain?",
      ur: "📦 آپ کیا ڈھونڈ رہے ہیں؟",
    },
    children: ["sup_office", "sup_consumables", "sup_parts", "sup_order"],
    intent: "OFFICE_SUPPLIES",
    team: "PARTS",
  },

  sales: {
    kind: "action",
    title: { en: "Talk to Sales", ur_roman: "Sales Se Baat", ur: "سیلز سے بات" },
    description: {
      en: "Speak with our sales team",
      ur_roman: "Hamari sales team se baat karein",
      ur: "ہماری سیلز ٹیم سے بات کریں",
    },
    do: { type: "handover", team: "SALES" },
    team: "SALES",
  },

  support: {
    kind: "menu",
    title: { en: "Customer Support", ur_roman: "Customer Support", ur: "کسٹمر سپورٹ" },
    description: {
      en: "Questions, complaints, service and parts",
      ur_roman: "Sawal, shikayat, service aur parts",
      ur: "سوالات، شکایات، سروس اور پارٹس",
    },
    body: {
      en: "🎧 We're here to help. What do you need?",
      ur_roman: "🎧 Hum madad ke liye haazir hain. Aap ko kya chahiye?",
      ur: "🎧 ہم مدد کے لیے حاضر ہیں۔ آپ کو کیا چاہیے؟",
    },
    children: ["cs_question", "cs_complaint", "cs_service", "cs_parts", "cs_product", "cs_callback", "cs_person"],
    intent: "SUPPORT",
    team: "SUPPORT",
  },

  track: {
    kind: "action",
    title: { en: "Track My Request", ur_roman: "Request Track Karein", ur: "درخواست ٹریک کریں" },
    description: {
      en: "Check a quote request or service ticket",
      ur_roman: "Quote request ya service ticket check karein",
      ur: "کوٹ ریکوئسٹ یا سروس ٹکٹ چیک کریں",
    },
    do: { type: "flow", flow: "track" },
    intent: "TRACK_REQUEST",
    team: "SUPPORT",
  },

  about: {
    kind: "action",
    title: { en: `About ${BRAND.name}`, ur_roman: `${BRAND.name} Ke Baare Mein`, ur: "پروس لنک کے بارے میں" },
    description: { en: "Who we are and what we do", ur_roman: "Hum kaun hain aur kya karte hain", ur: "ہم کون ہیں اور کیا کرتے ہیں" },
    do: {
      type: "say",
      body: {
        en: `*${BRAND.name}* — ${BRAND.tagline}\n\n${BRAND.description}\n\nWe offer digital duplicators, photocopiers and MFPs, printers, office equipment, stationery and papers, consumables, and parts and accessories — with installation, maintenance, repair, technical support and customer care.`,
        ur_roman: `*${BRAND.name}* — Your Trusted Office Solutions Partner\n\nPros-Link Pakistan bhar mein businesses ko office equipment aur office solutions faraham karta hai, nationwide sales aur distribution aur after-sales support ke saath.\n\nHum digital duplicators, photocopiers aur MFPs, printers, office equipment, stationery aur papers, consumables aur parts faraham karte hain — installation, maintenance, repair, technical support aur customer care ke saath.`,
        ur: "*پروس لنک* — Your Trusted Office Solutions Partner\n\nپروس لنک پورے پاکستان میں کاروباروں کو آفس ایکوپمنٹ اور آفس سلوشنز فراہم کرتا ہے، ملک گیر سیلز اور ڈسٹری بیوشن اور بعد از فروخت سپورٹ کے ساتھ۔\n\nہم ڈیجیٹل ڈپلیکیٹرز، فوٹو کاپیئرز اور ایم ایف پیز، پرنٹرز، آفس ایکوپمنٹ، اسٹیشنری اور کاغذ، کنزیومیبلز اور پارٹس فراہم کرتے ہیں — انسٹالیشن، مینٹیننس، مرمت، تکنیکی مدد اور کسٹمر کیئر کے ساتھ۔",
      },
      actions: ["explore_products", "contact_us", "main_menu"],
    },
  },

  contact: {
    kind: "action",
    title: { en: `Contact ${BRAND.name}`, ur_roman: `${BRAND.name} Se Rabta`, ur: "پروس لنک سے رابطہ" },
    description: { en: "Phone, email and offices", ur_roman: "Phone, email aur offices", ur: "فون، ای میل اور دفاتر" },
    do: { type: "contact" },
  },
};

// ------------------------------------------------- Installation & Support --

const SERVICE: Nodes = {
  svc_installation: {
    kind: "action",
    title: { en: "New Installation", ur_roman: "Nayi Installation", ur: "نئی انسٹالیشن" },
    do: { type: "flow", flow: "installation", context: { supportCategory: "INSTALLATION", topicLabel: "Installation request" } },
    intent: "INSTALLATION",
    team: "SERVICE",
  },
  svc_technical: {
    kind: "action",
    title: { en: "Technical Support", ur_roman: "Technical Support", ur: "تکنیکی مدد" },
    do: serviceFlow({ supportCategory: "TECHNICAL", topicLabel: "Technical support" }),
    intent: "TECHNICAL_SUPPORT",
    team: "SERVICE",
  },
  svc_maintenance: {
    kind: "action",
    title: { en: "Maintenance", ur_roman: "Maintenance", ur: "مینٹیننس" },
    do: serviceFlow({ supportCategory: "MAINTENANCE", topicLabel: "Maintenance request" }),
    intent: "MAINTENANCE",
    team: "SERVICE",
  },
  svc_repair: {
    kind: "action",
    title: { en: "Repair", ur_roman: "Repair", ur: "مرمت" },
    do: serviceFlow({ supportCategory: "REPAIR", topicLabel: "Repair request" }),
    intent: "REPAIR",
    team: "SERVICE",
  },
  svc_request: {
    kind: "action",
    title: { en: "Service Request", ur_roman: "Service Request", ur: "سروس کی درخواست" },
    do: serviceFlow({ supportCategory: "SERVICE", topicLabel: "Service request" }),
    intent: "SERVICE_REQUEST",
    team: "SERVICE",
  },
  svc_parts: {
    kind: "action",
    title: { en: "Parts Request", ur_roman: "Parts Request", ur: "پارٹس کی درخواست" },
    do: { type: "flow", flow: "parts", context: { supportCategory: "PARTS", topicLabel: "Parts request" } },
    intent: "PARTS_ACCESSORIES",
    team: "PARTS",
  },
  svc_general: {
    kind: "action",
    title: { en: "General Support", ur_roman: "General Support", ur: "عمومی مدد" },
    do: { type: "flow", flow: "support", context: { supportCategory: "GENERAL", topicLabel: "Support request" } },
    intent: "SUPPORT",
    team: "SUPPORT",
  },
};

// ------------------------------------------------------ Repair / Maintenance --

const REPAIR: Nodes = {
  rep_repair: {
    kind: "action",
    title: { en: "Request Repair", ur_roman: "Repair Request", ur: "مرمت کی درخواست" },
    description: { en: "Machine faulty or not working", ur_roman: "Machine kharab ya band hai", ur: "مشین خراب یا بند ہے" },
    do: serviceFlow({ supportCategory: "REPAIR", topicLabel: "Repair request" }),
    intent: "REPAIR",
    team: "SERVICE",
  },
  rep_maintenance: {
    kind: "action",
    title: { en: "Maintenance Visit", ur_roman: "Maintenance Visit", ur: "مینٹیننس وزٹ" },
    description: { en: "Routine servicing for a machine", ur_roman: "Machine ki routine servicing", ur: "مشین کی معمول کی سروسنگ" },
    do: serviceFlow({ supportCategory: "MAINTENANCE", topicLabel: "Maintenance request" }),
    intent: "MAINTENANCE",
    team: "SERVICE",
  },
  rep_track: {
    kind: "action",
    title: { en: "Track a Repair", ur_roman: "Repair Track Karein", ur: "مرمت ٹریک کریں" },
    description: { en: "Check an existing service ticket", ur_roman: "Maujooda service ticket check karein", ur: "موجودہ سروس ٹکٹ چیک کریں" },
    do: { type: "flow", flow: "track" },
    team: "SERVICE",
  },
};

// -------------------------------------------------------------- Supplies ----

const SUPPLIES: Nodes = {
  sup_office: {
    kind: "action",
    title: { en: "Stationery & Papers", ur_roman: "Stationery & Papers", ur: "اسٹیشنری اور کاغذ" },
    do: { type: "catalog", category: "office-supplies" },
    intent: "OFFICE_SUPPLIES",
  },
  sup_consumables: {
    kind: "action",
    title: { en: "Toner & Consumables", ur_roman: "Toner & Consumables", ur: "ٹونر اور کنزیومیبلز" },
    do: { type: "catalog", category: "consumables" },
    intent: "CONSUMABLES",
  },
  sup_parts: {
    kind: "action",
    title: { en: "Parts & Accessories", ur_roman: "Parts & Accessories", ur: "پارٹس اور لوازمات" },
    do: { type: "catalog", category: "parts-accessories" },
    intent: "PARTS_ACCESSORIES",
  },
  sup_order: {
    kind: "action",
    title: { en: "Order Supplies", ur_roman: "Supplies Order Karein", ur: "سپلائیز آرڈر کریں" },
    description: { en: "Request a quotation for supplies", ur_roman: "Supplies ki quotation mangwayein", ur: "سپلائیز کی کوٹیشن منگوائیں" },
    do: { type: "flow", flow: "quote", context: { interest: "Stationery & supplies", team: "PARTS" } },
    team: "PARTS",
  },
};

// ------------------------------------------------------- Customer Support ---

const SUPPORT: Nodes = {
  cs_question: {
    kind: "action",
    title: { en: "Ask a Question", ur_roman: "Sawal Poochein", ur: "سوال پوچھیں" },
    do: { type: "say", body: { en: "Of course — type your question and I'll help.", ur_roman: "Bilkul — apna sawal likhein, main madad karta hoon.", ur: "بالکل — اپنا سوال لکھیں، میں مدد کرتا ہوں۔" } },
    team: "SUPPORT",
  },
  cs_complaint: {
    kind: "action",
    title: { en: "Submit a Complaint", ur_roman: "Shikayat Darj Karein", ur: "شکایت درج کریں" },
    do: { type: "flow", flow: "support", context: { supportCategory: "COMPLAINT", topicLabel: "Complaint" } },
    team: "SUPPORT",
  },
  cs_service: {
    kind: "action",
    title: { en: "Request Service", ur_roman: "Service Request", ur: "سروس کی درخواست" },
    do: serviceFlow({ supportCategory: "SERVICE", topicLabel: "Service request" }),
    team: "SERVICE",
  },
  cs_parts: {
    kind: "action",
    title: { en: "Replacement Parts", ur_roman: "Replacement Parts", ur: "متبادل پارٹس" },
    do: { type: "flow", flow: "parts", context: { supportCategory: "PARTS", topicLabel: "Replacement parts" } },
    team: "PARTS",
  },
  cs_product: {
    kind: "action",
    title: { en: "Product Information", ur_roman: "Product Maloomat", ur: "پروڈکٹ کی معلومات" },
    do: { type: "catalog" },
    team: "SALES",
  },
  cs_callback: {
    kind: "action",
    title: { en: "Request a Callback", ur_roman: "Call Back Request", ur: "کال بیک کی درخواست" },
    do: { type: "flow", flow: "support", context: { supportCategory: "CALLBACK", topicLabel: "Callback request" } },
    team: "SUPPORT",
  },
  cs_person: {
    kind: "action",
    title: { en: "Talk to Support", ur_roman: "Support Se Baat", ur: "سپورٹ سے بات" },
    do: { type: "handover", team: "SUPPORT" },
    team: "SUPPORT",
  },
};

// -------------------------------------------------------- Talk to the team --

const EXPERT: Nodes = {
  expert: {
    kind: "menu",
    title: { en: "Talk to Our Team", ur_roman: "Team Se Baat", ur: "ٹیم سے بات" },
    body: { en: "Who would you like to speak with?", ur_roman: "Aap kis team se baat karna chahenge?", ur: "آپ کس ٹیم سے بات کرنا چاہیں گے؟" },
    children: ["expert_sales", "expert_corporate", "expert_service", "expert_support", "expert_parts", "expert_accounts"],
    intent: "HUMAN_HANDOVER",
  },
  expert_sales: {
    kind: "action",
    title: { en: "Sales", ur_roman: "Sales", ur: "سیلز" },
    do: { type: "handover", team: "SALES" },
    team: "SALES",
  },
  expert_corporate: {
    kind: "action",
    title: { en: "Corporate & Bulk Orders", ur_roman: "Corporate & Bulk", ur: "کارپوریٹ اور بلک" },
    do: { type: "handover", team: "CORPORATE" },
    team: "CORPORATE",
  },
  expert_service: {
    kind: "action",
    title: { en: "Service & Repairs", ur_roman: "Service & Repairs", ur: "سروس اور مرمت" },
    do: { type: "handover", team: "SERVICE" },
    team: "SERVICE",
  },
  expert_support: {
    kind: "action",
    title: { en: "Customer Support", ur_roman: "Customer Support", ur: "کسٹمر سپورٹ" },
    do: { type: "handover", team: "SUPPORT" },
    team: "SUPPORT",
  },
  expert_parts: {
    kind: "action",
    title: { en: "Parts & Supplies", ur_roman: "Parts & Supplies", ur: "پارٹس اور سپلائیز" },
    do: { type: "handover", team: "PARTS" },
    team: "PARTS",
  },
  expert_accounts: {
    kind: "action",
    title: { en: "Accounts & Billing", ur_roman: "Accounts & Billing", ur: "اکاؤنٹس اور بلنگ" },
    do: { type: "handover", team: "ACCOUNTS" },
    team: "ACCOUNTS",
  },
};

export const DEFAULT_MENU: BotConfig["menu"] = {
  root: "root",
  nodes: { ...MAIN, ...SERVICE, ...REPAIR, ...SUPPLIES, ...SUPPORT, ...EXPERT },
};

// ----------------------------------------------------------------- Actions --

export const DEFAULT_ACTIONS: BotConfig["actions"] = {
  main_menu: {
    title: { en: "Main Menu", ur_roman: "Main Menu", ur: "مین مینو" },
    do: { type: "menu", node: "root" },
  },
  explore_products: {
    title: { en: "Explore Products", ur_roman: "Products Dekhein", ur: "پروڈکٹس دیکھیں" },
    do: { type: "catalog" },
  },
  get_quote: {
    title: { en: "Request a Quote", ur_roman: "Quotation Lein", ur: "کوٹیشن لیں" },
    do: { type: "flow", flow: "quote" },
  },
  service_repair: {
    title: { en: "Service & Repair", ur_roman: "Service & Repair", ur: "سروس اور مرمت" },
    do: { type: "menu", node: "service" },
  },
  talk_to_sales: {
    title: { en: "Talk to Sales", ur_roman: "Sales Se Baat", ur: "سیلز سے بات" },
    do: { type: "handover", team: "SALES" },
  },
  customer_support: {
    title: { en: "Customer Support", ur_roman: "Customer Support", ur: "کسٹمر سپورٹ" },
    do: { type: "menu", node: "support" },
  },
  talk_to_support: {
    title: { en: "Talk to Support", ur_roman: "Support Se Baat", ur: "سپورٹ سے بات" },
    do: { type: "handover", team: "SUPPORT" },
  },
  talk_to_person: {
    title: { en: "Talk to a Person", ur_roman: "Kisi Se Baat", ur: "کسی سے بات" },
    do: { type: "menu", node: "expert" },
  },
  request_callback: {
    title: { en: "Request Callback", ur_roman: "Call Back Karein", ur: "کال بیک کریں" },
    do: { type: "flow", flow: "callback" },
  },
  request_installation: {
    title: { en: "New Installation", ur_roman: "Nayi Installation", ur: "نئی انسٹالیشن" },
    do: { type: "flow", flow: "installation", context: { supportCategory: "INSTALLATION", topicLabel: "Installation request" } },
  },
  request_repair: {
    title: { en: "Request Repair", ur_roman: "Repair Request", ur: "مرمت کی درخواست" },
    do: serviceFlow({ supportCategory: "REPAIR", topicLabel: "Repair request" }),
  },
  request_maintenance: {
    title: { en: "Maintenance Visit", ur_roman: "Maintenance Visit", ur: "مینٹیننس وزٹ" },
    do: serviceFlow({ supportCategory: "MAINTENANCE", topicLabel: "Maintenance request" }),
  },
  request_parts: {
    title: { en: "Parts Request", ur_roman: "Parts Request", ur: "پارٹس کی درخواست" },
    do: { type: "flow", flow: "parts", context: { supportCategory: "PARTS", topicLabel: "Parts request" } },
  },
  track_request: {
    title: { en: "Track My Request", ur_roman: "Request Track", ur: "درخواست ٹریک" },
    do: { type: "flow", flow: "track" },
  },
  book_demo: {
    title: { en: "Book a Demo", ur_roman: "Demo Book Karein", ur: "ڈیمو بک کریں" },
    do: { type: "flow", flow: "demo" },
  },
  corporate_requirements: {
    title: { en: "Share Requirements", ur_roman: "Requirement Batayein", ur: "ضروریات بتائیں" },
    description: { en: "For corporate and bulk orders" },
    do: { type: "flow", flow: "corporate" },
  },
  contact_us: {
    title: { en: `Contact ${BRAND.name}`, ur_roman: "Rabta Karein", ur: "رابطہ کریں" },
    do: { type: "contact" },
  },
  continue_here: {
    title: { en: "Continue Here", ur_roman: "Yahin Baat Karein", ur: "یہیں بات کریں" },
    do: {
      type: "say",
      body: {
        en: "Of course — tell me what you need and I'll pick up right where we left off.",
        ur_roman: "Bilkul — batayein aap ko kya chahiye, main wahin se aage barhta hoon.",
        ur: "بالکل — بتائیں آپ کو کیا چاہیے، میں وہیں سے آگے بڑھتا ہوں۔",
      },
    },
  },
};
