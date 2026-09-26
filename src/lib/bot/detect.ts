import type { BotConfig } from "./schema";
import { hasPhrase, normalise, wordCount } from "./text";
import { BOT_INTENTS, SERVICE_INTENTS, type BotIntent } from "./types";

/**
 * =============================================================================
 *  Deterministic detection
 * =============================================================================
 *
 *  How the router reads a typed message: which product or service it is
 *  about, what the customer wants to happen, whether they are upset, want a
 *  person, want to stop receiving messages, or are describing a corporate or
 *  bulk requirement.
 *
 *  Keyword work on purpose. It is instant, free, testable and predictable.
 *
 *  Keywords cover English, Roman Urdu and Urdu script, and administrators can
 *  add more per intent from Chatbot Studio.
 * =============================================================================
 */

type Weighted = Array<[phrase: string, weight: number]>;

/** What the message is about: product areas and service lines. */
const SERVICE_KEYWORDS: Partial<Record<BotIntent, Weighted>> = {
  DIGITAL_DUPLICATOR: [
    ["digital duplicator", 7], ["duplicator", 6], ["duplicating machine", 6], ["risograph", 6], ["riso", 5],
    ["duplo", 5], ["stencil machine", 5], ["ڈپلیکیٹر", 6], ["ڈوپلیکیٹر", 6],
  ],
  PHOTOCOPIER: [
    ["photocopier", 6], ["photo copier", 6], ["photocopy machine", 6], ["photostat machine", 6], ["copier", 5],
    ["copy machine", 5], ["fotocopy", 5], ["photostat", 5], ["photocopy", 4], ["mfp", 5], ["multifunction", 5],
    ["multi function", 5], ["all in one printer", 5], ["فوٹو کاپی", 5], ["فوٹو اسٹیٹ", 5], ["فوٹوسٹیٹ", 5],
  ],
  PRINTER: [
    ["laser printer", 6], ["inkjet printer", 6], ["printer", 5], ["inkjet", 4], ["print machine", 4], ["پرنٹر", 5],
  ],
  OFFICE_EQUIPMENT: [
    ["office equipment", 6], ["office machine", 5], ["office machines", 5], ["shredder", 4], ["paper shredder", 5],
    ["laminator", 4], ["laminating machine", 5], ["binding machine", 4], ["paper cutter", 4],
  ],
  OFFICE_SUPPLIES: [
    ["office supplies", 6], ["stationery", 5], ["stationary", 4], ["stationeries", 5], ["stationaries", 4],
    ["stationries", 4], ["stationry", 4], ["a4 paper", 5], ["copy paper", 5], ["paper ream", 5],
    ["photocopy paper", 6], ["photostat paper", 6], ["printing paper", 5],
    ["paper rim", 5], ["legal paper", 4], ["کاغذ", 3], ["سٹیشنری", 5], ["اسٹیشنری", 5],
  ],
  CONSUMABLES: [
    ["toner", 6], ["toner cartridge", 6], ["ink cartridge", 6], ["cartridge", 5], ["refill", 3], ["ink", 3],
    ["drum unit", 5], ["drum", 3], ["master roll", 5], ["consumables", 5], ["ٹونر", 6], ["کارٹریج", 5],
  ],
  PARTS_ACCESSORIES: [
    ["spare parts", 6], ["spare part", 6], ["replacement part", 6], ["parts", 3], ["accessories", 4], ["roller", 3],
    ["fuser", 4], ["pickup roller", 5], ["پرزے", 4], ["پارٹس", 4],
  ],
  INSTALLATION: [
    ["installation", 5], ["install", 5], ["installing", 5], ["set up", 3], ["setup", 3], ["lagwana", 3],
    ["fit karwana", 4], ["انسٹالیشن", 5], ["انسٹال", 5],
  ],
  MAINTENANCE: [
    ["maintenance", 5], ["servicing", 5], ["service contract", 6], ["maintenance contract", 6], ["amc", 5],
    ["annual maintenance", 6], ["preventive maintenance", 6], ["مینٹیننس", 5], ["سروسنگ", 5],
  ],
  REPAIR: [
    ["repair", 5], ["repairing", 5], ["fix", 3], ["fixing", 3], ["marammat", 5], ["theek karwana", 4],
    ["ٹھیک کروانا", 4], ["ریپئر", 5], ["مرمت", 5],
  ],
  TECHNICAL_SUPPORT: [
    ["technical support", 6], ["tech support", 6], ["technical help", 5], ["technician", 4], ["printer driver", 5],
    ["driver", 3], ["network printing", 5], ["scan to email", 5], ["configuration", 3],
  ],
  OFFICE_SOLUTIONS: [
    ["office solution", 6], ["office solutions", 6], ["print solution", 6], ["managed print", 6],
    ["document solution", 6], ["office setup", 5], ["complete office", 4],
  ],
};

/** What the customer wants to happen. */
const REQUEST_KEYWORDS: Partial<Record<BotIntent, Weighted>> = {
  PRODUCTS: [
    ["your products", 5], ["product list", 5], ["show products", 5], ["catalogue", 5], ["catalog", 5],
    ["what do you sell", 6], ["what products", 5], ["which products", 5], ["products", 3], ["range", 2],
  ],
  QUOTE: [
    ["quotation", 5], ["quote", 5], ["estimate", 3], ["proposal", 3], ["rfq", 5], ["کوٹیشن", 5],
  ],
  PRICING: [
    ["price", 4], ["prices", 4], ["pricing", 4], ["price list", 5], ["cost", 4], ["how much", 4], ["rate", 2],
    ["rates", 3], ["kitne ka", 5], ["kitne ki", 5], ["kitna", 3], ["kitne", 3], ["qeemat", 5], ["قیمت", 5],
    ["کتنے کا", 5], ["ریٹ", 3],
  ],
  DEMO: [["demo", 5], ["demonstration", 5], ["see the machine", 5], ["trial", 2], ["ڈیمو", 5]],
  CALLBACK: [
    ["call me back", 6], ["call back", 5], ["callback", 5], ["call me", 5], ["give me a call", 6],
    ["mujhe call", 5], ["call karein", 5], ["call kar", 4], ["phone karein", 5], ["فون کریں", 5], ["کال کریں", 5],
  ],
  SERVICE_REQUEST: [
    ["not working", 5], ["stopped working", 5], ["isnt working", 5], ["out of order", 5], ["breakdown", 5],
    ["broken", 4], ["paper jam", 6], ["jammed", 5], ["jamming", 5], ["jam", 3], ["error code", 5], ["error", 3],
    ["not printing", 5], ["wont print", 5], ["not copying", 5], ["not scanning", 5], ["wont turn on", 5],
    ["not turning on", 5], ["print nahi", 4], ["copy nahi", 4],
    ["kharab", 5], ["kharaab", 5], ["band ho gaya", 4], ["band ho gayi", 4], ["chal nahi raha", 5],
    ["kaam nahi kar", 5], ["nahi chal", 4], ["send a technician", 6], ["technician bhej", 6], ["need repair", 5],
    ["needs repair", 5], ["repair karwana", 5], ["repair chahiye", 5], ["خراب", 5], ["کام نہیں کر", 5],
  ],
  TRACK_REQUEST: [
    ["track my", 6], ["track", 4], ["tracking", 5], ["status of my", 6], ["ticket status", 6], ["request status", 6],
    ["complaint status", 6], ["order status", 5], ["reference number", 4], ["ticket number", 4], ["update on my", 5],
    ["kahan tak", 4], ["kya hua", 3],
  ],
  SUPPORT: [
    ["customer support", 5], ["customer care", 5], ["help desk", 4], ["support", 2], ["issue", 1], ["problem", 1],
    ["masla", 2], ["مسئلہ", 2],
  ],
  BILLING: [
    ["invoice", 5], ["billing", 5], ["payment", 3], ["receipt", 3], ["bill", 3], ["refund", 5], ["بل", 3], ["ادائیگی", 4],
  ],
  PARTNERSHIP: [
    ["dealership", 5], ["dealer", 5], ["distributor", 5], ["distributorship", 5], ["reseller", 5], ["franchise", 4],
    ["partner with", 5], ["partnership", 5],
  ],
  CAREER: [
    ["job", 3], ["jobs", 3], ["career", 4], ["careers", 4], ["hiring", 3], ["vacancy", 5], ["internship", 5],
    ["my cv", 5], ["resume", 3], ["naukri", 5], ["نوکری", 5],
  ],
};

/** Minimum weight for a request intent to steer the conversation. */
const REQUEST_THRESHOLD: Partial<Record<BotIntent, number>> = {
  SERVICE_REQUEST: 4,
  SUPPORT: 4,
  CAREER: 4,
  PARTNERSHIP: 4,
  TRACK_REQUEST: 4,
  PRODUCTS: 4,
};

export interface Classification {
  /** The single best label for the message — what gets stored as the intent. */
  primary: BotIntent;
  /** The product or service line mentioned, if any. */
  service?: BotIntent;
  /** The request expressed, if any. */
  request?: BotIntent;
}

/** A phrase or its plural: "photocopier" also matches "photocopiers", "cartridge" "cartridges". */
function mentions(text: string, phrase: string): boolean {
  return hasPhrase(text, phrase) || hasPhrase(text, `${phrase}s`) || hasPhrase(text, `${phrase}es`);
}

function score(text: string, table: Partial<Record<BotIntent, Weighted>>, extra: BotConfig["intents"]) {
  const scores = new Map<BotIntent, number>();
  const serviceTable = table === SERVICE_KEYWORDS;
  for (const intent of BOT_INTENTS) {
    let total = 0;
    for (const [phrase, weight] of table[intent] ?? []) {
      if (mentions(text, phrase)) total += weight;
    }
    if (serviceTable === SERVICE_INTENTS.includes(intent)) {
      for (const phrase of extra[intent]?.keywords ?? []) {
        if (mentions(text, phrase)) total += 5;
      }
    }
    if (total > 0) scores.set(intent, total);
  }
  return scores;
}

function best(scores: Map<BotIntent, number>): BotIntent | undefined {
  let top: [BotIntent, number] | undefined;
  for (const entry of scores) {
    if (!top || entry[1] > top[1]) top = entry;
  }
  return top?.[0];
}

/** A reference number such as PL-TKT-7F3K2Q9A. */
const REFERENCE = /\b[A-Z]{2}-(?:LEAD|TKT|QTE|MTG)-[A-Z2-9]{6,10}\b/i;

/** Requests that change what happens next, taking priority over the topic. */
const STEERING_REQUESTS: readonly BotIntent[] = [
  "SERVICE_REQUEST", "TRACK_REQUEST", "BILLING", "CAREER", "PARTNERSHIP", "QUOTE", "CALLBACK", "DEMO",
];

export function classify(message: string, config: Pick<BotConfig, "intents">): Classification {
  const text = normalise(message);
  const services = score(text, SERVICE_KEYWORDS, config.intents);
  const requests = score(text, REQUEST_KEYWORDS, config.intents);

  if (REFERENCE.test(message)) requests.set("TRACK_REQUEST", Math.max(requests.get("TRACK_REQUEST") ?? 0, 8));

  // "Photocopy" on its own is a photocopier; "photocopy paper" is supplies.
  if (services.has("OFFICE_SUPPLIES") && services.has("PHOTOCOPIER") && hasPhrase(text, "paper")) {
    services.delete("PHOTOCOPIER");
  }

  for (const [intent, value] of requests) {
    if (value < (REQUEST_THRESHOLD[intent] ?? 3)) requests.delete(intent);
  }

  const service = best(services);
  const request = best(requests);

  // A request that changes what happens next wins; asking about the price of
  // something keeps the something as the label.
  const primary = request && STEERING_REQUESTS.includes(request) ? request : service ?? request ?? "GENERAL_INQUIRY";

  return { primary, service, request };
}

// ------------------------------------------------------------ Conversation --

// Phrases, not single words: "I am the office manager" must not open a ticket.
// "Call me back" is deliberately absent — it is a callback request, not a handover.
const HUMAN_PHRASES = [
  "talk to a human", "speak to a human", "talk to human", "talk to someone", "speak to someone",
  "real person", "human agent", "live agent", "talk to a representative", "speak to a representative",
  "talk to a person", "speak to a person", "talk to your team", "speak to your team", "connect me with someone",
  "talk to your manager", "speak to your manager", "talk to the manager", "talk to an agent",
  "insan se baat", "insaan se baat", "bande se baat", "baat karwao", "baat karwaen", "kisi se baat",
  "team se baat", "manager se baat", "agent se baat",
  "انسان سے بات", "نمائندے سے بات", "کسی سے بات",
];

const FRUSTRATION_PHRASES = [
  "complaint", "complain", "not happy", "unhappy", "disappointed", "not helpful", "useless", "frustrated",
  "angry", "worst", "pathetic", "scam", "fraud", "terrible", "ridiculous", "waste of time", "legal action",
  "bakwas", "bekar", "ghatiya", "fazool", "shikayat", "dhoka", "شکایت", "بکواس", "دھوکہ",
];

/** The customer explicitly asked for a person. */
export function wantsHuman(message: string): boolean {
  const text = normalise(message);
  return HUMAN_PHRASES.some((phrase) => hasPhrase(text, phrase));
}

/** The customer sounds upset — escalate rather than keep answering. */
export function isFrustrated(message: string, extra: string[] = []): boolean {
  const text = normalise(message);
  return [...FRUSTRATION_PHRASES, ...extra].some((phrase) => hasPhrase(text, phrase));
}

const OPT_OUT_PHRASES = [
  "stop", "unsubscribe", "opt out", "optout", "dont message", "do not message", "don't message",
  "remove me", "stop messaging", "stop sending", "stop messages", "no more messages",
  "band karo", "message mat karo", "messages mat bhejo", "mat bhejo", "پیغام نہ بھیجیں", "بند کرو",
];

const OPT_IN_PHRASES = ["start", "subscribe", "unstop", "resume messages"];

/**
 * An opt-out request. Only short messages count: "stop" on its own is a clear
 * instruction, while "my printer won't stop jamming" is not.
 */
export function isOptOut(message: string): boolean {
  if (wordCount(message) > 6) return false;
  const text = normalise(message);
  return OPT_OUT_PHRASES.some((phrase) => hasPhrase(text, phrase)) && !hasPhrase(text, "dont stop") && !hasPhrase(text, "wont stop");
}

export function isOptIn(message: string): boolean {
  if (wordCount(message) > 3) return false;
  const text = normalise(message);
  return OPT_IN_PHRASES.some((phrase) => hasPhrase(text, phrase));
}

const MENU_PHRASES = ["menu", "main menu", "restart", "home", "start over", "مینو"];
const GREETINGS = [
  "hi", "hii", "hello", "hey", "hy", "hlo", "salam", "salaam", "aoa", "asalam o alaikum", "assalam o alaikum",
  "assalamualaikum", "assalamu alaikum", "as salam o alaikum", "good morning", "good afternoon",
  "good evening", "السلام علیکم", "سلام", "start",
];

/** "menu", "main menu" — always back to the top. */
export function isMenuRequest(message: string): boolean {
  if (wordCount(message) > 3) return false;
  const text = normalise(message);
  return MENU_PHRASES.some((phrase) => hasPhrase(text, phrase));
}

/** A message that is nothing but a greeting. */
export function isGreetingOnly(message: string): boolean {
  let text = normalise(message);
  for (const greeting of [...GREETINGS].sort((a, b) => b.length - a.length)) {
    text = text.replace(normalise(greeting), " ");
  }
  return text.replace(/\b(there|team|pros|link|proslink|sir|madam|ji|jee)\b/g, "").replace(/-/g, "").trim() === "";
}

const QUESTION_STARTS = [
  "what", "how", "why", "when", "where", "which", "who", "can", "could", "do", "does", "is", "are",
  "will", "would", "should", "kya", "kaise", "kesay", "kitna", "kitne", "kab", "kahan", "kaun", "konsa",
  "کیا", "کیسے", "کتنا", "کتنے", "کب", "کہاں", "کون",
];

/** A question rather than an answer — "Do you install in Multan?" */
export function isQuestion(message: string): boolean {
  const trimmed = message.trim();
  if (/[?؟]\s*$/.test(trimmed)) return true;
  const first = normalise(trimmed).trim().split(" ")[0];
  return wordCount(trimmed) >= 3 && QUESTION_STARTS.includes(first);
}

// ---------------------------------------------------------------- Industry --

const INDUSTRIES: Array<[label: string, phrases: string[]]> = [
  ["Education", ["school", "schools", "college", "university", "academy", "institute", "madrassa", "coaching", "campus", "اسکول", "کالج"]],
  // Not "department" on its own: "our accounts department" is not a government office.
  ["Government", ["government", "government department", "govt department", "ministry", "govt", "sarkari", "municipal", "سرکاری"]],
  ["Banking & finance", ["bank", "banking", "branch banking", "microfinance", "insurance", "leasing"]],
  ["Healthcare", ["hospital", "clinic", "medical", "pharmacy", "laboratory", "lab", "ہسپتال"]],
  ["Printing & publishing", ["printing press", "press", "publisher", "publishing", "print shop", "photocopy shop", "photostat shop"]],
  ["Legal", ["law firm", "lawyer", "advocate", "chambers", "court"]],
  ["NGO & development", ["ngo", "non profit", "nonprofit", "foundation", "trust"]],
  ["Manufacturing", ["factory", "manufacturing", "textile", "mill", "industry", "industrial"]],
  ["Retail", ["shop", "store", "retail", "showroom", "mart"]],
  ["Hospitality", ["hotel", "restaurant", "guest house", "resort"]],
  ["Logistics", ["logistics", "courier", "cargo", "transport"]],
  ["Corporate office", ["corporate office", "head office", "company office", "software house", "call center", "call centre"]],
];

/** A best-effort industry label from what the customer wrote. */
export function detectIndustry(message: string): string | undefined {
  const text = normalise(message);
  return INDUSTRIES.find(([, phrases]) => phrases.some((phrase) => hasPhrase(text, phrase)))?.[0];
}

// -------------------------------------------------------------- Corporate --

export interface EnterpriseSignal {
  enterprise: boolean;
  reason?: string;
}

function parseCount(raw: string, suffix?: string): number {
  const value = Number(raw.replace(/,/g, ""));
  return suffix?.toLowerCase() === "k" ? value * 1000 : value;
}

/**
 * Whether the customer is describing a corporate or bulk requirement: a
 * headcount or branch count over the configured thresholds, or one of the
 * configured phrases (a tender, several branches, a fleet of machines).
 */
export function detectEnterprise(
  message: string,
  companySize: string | undefined,
  config: BotConfig["enterprise"]
): EnterpriseSignal {
  const source = `${message}\n${companySize ?? ""}`;

  const people = source.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*\+?\s*(?:employees|employee|staff|people|team members|workers|mulazim|mulazimeen|ملازمین)/i
  );
  if (people && parseCount(people[1], people[2]) >= config.employeeThreshold) {
    return { enterprise: true, reason: `${people[0].trim()}` };
  }

  const branches = source.match(/(\d+)\s*\+?\s*(?:branches|branch|locations|offices|campuses|schools|برانچز)/i);
  if (branches && Number(branches[1]) >= config.branchThreshold) {
    return { enterprise: true, reason: `${branches[0].trim()}` };
  }

  const text = normalise(message);
  const phrase = config.keywords.find((keyword) => hasPhrase(text, keyword));
  if (phrase) return { enterprise: true, reason: `mentioned "${phrase}"` };

  return { enterprise: false };
}
