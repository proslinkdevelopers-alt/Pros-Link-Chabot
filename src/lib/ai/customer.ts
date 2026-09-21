import { config } from "@/lib/config";
import { BRAND } from "@/config/brand";
import { MARKETING_SERVICES, findService, matchService } from "@/data/marketing/services";
import { BOT_INTENTS } from "@/lib/bot/types";
import { getProvider } from "./provider";
import type { ChatTurn } from "./types";

const BOT_INTENT_LIST = BOT_INTENTS.join(", ");

/**
 * =============================================================================
 *  What the customer has told us
 * =============================================================================
 *
 *  The assistant talks like a customer service representative: it asks for a
 *  name, a number or a budget when the conversation makes room for it, in any
 *  order, in any language. That leaves nothing structured to read the answers
 *  from — so after every turn a second, JSON-only model call reads the
 *  transcript and returns the customer's details.
 *
 *  Nothing the extractor returns is trusted as-is. A phone number or email has
 *  to appear in something the customer actually typed, BITSOL's own contact
 *  details are refused, a service must be in the catalogue and a meeting date
 *  must be a real future day. The model can miss a detail; it cannot invent one
 *  that ends up in the CRM.
 * =============================================================================
 */

export const CUSTOMER_INTENTS = ["PROJECT", "CONSULTATION", "SUPPORT", "BROWSING"] as const;
export const MEETING_MODES = ["OFFICE", "ZOOM", "GOOGLE_MEET", "WHATSAPP"] as const;
export const SUPPORT_CATEGORIES = ["TECHNICAL", "BILLING", "SALES", "COMPLAINT", "GENERAL"] as const;

export type CustomerIntent = (typeof CUSTOMER_INTENTS)[number];
export type MeetingModeValue = (typeof MEETING_MODES)[number];
export type SupportCategoryValue = (typeof SUPPORT_CATEGORIES)[number];

export interface CustomerDetails {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  /** What the business does, in a few words — "bakery", "real estate agency". Shown as Industry. */
  businessType?: string;
  website?: string;
  country?: string;
  city?: string;
  /** Catalogue slug of the service they want. */
  service?: string;
  /** The specific service within it, e.g. "Local SEO", "Meta Ads". */
  subService?: string;
  /** The assistant's intent classification (`BOT_INTENTS` in `lib/bot/types.ts`). */
  topic?: string;
  /** What they want or the problem they have, summarised in English. */
  requirements?: string;
  businessGoal?: string;
  challenge?: string;
  budget?: string;
  timeline?: string;
  /** Lead generation: the customers they want to attract. */
  customerType?: string;
  /** Lead generation: where their leads come from today. */
  leadChannel?: string;
  monthlyLeads?: string;
  currentMarketing?: string;
  monthlyAdSpend?: string;
  /** Website & software: the platform they want it built for. */
  platform?: string;
  features?: string;
  /** Employees, branches or team size, as they put it. */
  companySize?: string;
  /** Support: which of their projects with BITSOL the issue concerns. */
  project?: string;
  intent?: CustomerIntent;
  /** YYYY-MM-DD, only when they asked for a consultation and named a day. */
  meetingDate?: string;
  meetingTime?: string;
  meetingMode?: MeetingModeValue;
  supportCategory?: SupportCategoryValue;
}

export const MEETING_MODE_LABEL: Record<MeetingModeValue, string> = {
  OFFICE: "Office visit",
  ZOOM: "Zoom",
  GOOGLE_MEET: "Google Meet",
  WHATSAPP: "WhatsApp call",
};

/** Human labels, in the order the console and the prompt list them. */
export const DETAIL_LABELS: Array<[keyof CustomerDetails, string]> = [
  ["name", "Name"],
  ["phone", "Phone / WhatsApp"],
  ["email", "Email"],
  ["company", "Business name"],
  ["businessType", "Industry"],
  ["website", "Website"],
  ["country", "Country"],
  ["city", "City"],
  ["companySize", "Company size"],
  ["service", "Service"],
  ["subService", "Specific service"],
  ["topic", "Intent"],
  ["requirements", "What they need"],
  ["businessGoal", "Business goal"],
  ["challenge", "Current challenge"],
  ["customerType", "Customers they want"],
  ["leadChannel", "Current lead source"],
  ["monthlyLeads", "Monthly leads needed"],
  ["currentMarketing", "Current marketing"],
  ["monthlyAdSpend", "Monthly ad spend"],
  ["platform", "Platform"],
  ["features", "Required features"],
  ["project", "Project"],
  ["budget", "Budget"],
  ["timeline", "Timeline"],
  ["meetingDate", "Consultation day"],
  ["meetingTime", "Consultation time"],
  ["meetingMode", "Consultation type"],
  ["intent", "Looking to"],
  ["supportCategory", "Support category"],
];

const DETAIL_KEYS = DETAIL_LABELS.map(([key]) => key);
const DAY_MS = 24 * 60 * 60 * 1000;

// ------------------------------------------------------------ Extraction ----

/**
 * Read the conversation and return everything known about the customer:
 * `known` updated with whatever this transcript adds or corrects.
 *
 * Never throws. Without a working model it still picks up phone numbers and
 * email addresses deterministically, so a provider outage does not lose the
 * one detail the sales team cannot work without.
 */
export async function extractCustomerDetails(
  transcript: ChatTurn[],
  known: CustomerDetails,
  options: { channelPhone?: string; brandPhones?: string[] } = {}
): Promise<CustomerDetails> {
  const customerText = transcript
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content)
    .join("\n");

  let extracted: CustomerDetails = {};
  try {
    let raw = "";
    for await (const chunk of getProvider().streamChat({
      system: extractionPrompt(known),
      messages: [{ role: "user", content: formatTranscript(transcript) }],
      model: config.ai.extractionModel,
      // Room for the JSON and, on a Gemini model, the thought tokens that
      // count against the same limit.
      maxTokens: 1200,
      thinking: false,
    })) {
      raw += chunk;
    }
    extracted = sanitiseDetails(parseJsonObject(raw), {
      customerText,
      channelPhone: options.channelPhone,
      brandTails: brandTails(options.brandPhones),
    });
  } catch (error) {
    console.warn(
      "[customer] extraction skipped:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // The deterministic scan only fills what the model left empty: when both
  // found a number, the model knows which one the customer said to use.
  const scanned = scanContactDetails(customerText, brandTails(options.brandPhones));
  return mergeDetails(mergeDetails(known, scanned), extracted);
}

/** Newer values win; a field the newer set leaves empty keeps its old value. */
export function mergeDetails(base: CustomerDetails, next: CustomerDetails): CustomerDetails {
  const merged: CustomerDetails = { ...base };
  for (const key of DETAIL_KEYS) {
    const value = next[key];
    if (value !== undefined && value !== "") {
      (merged as Record<string, string>)[key] = value;
    }
  }
  return merged;
}

/** Narrow stored JSON back to details, dropping anything that isn't a known string field. */
export function asCustomerDetails(value: unknown): CustomerDetails {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const details: CustomerDetails = {};
  for (const key of DETAIL_KEYS) {
    const field = source[key];
    if (typeof field === "string" && field.trim()) {
      (details as Record<string, string>)[key] = field.trim();
    }
  }
  return details;
}

/** Today's date where BITSOL works — the anchor for "tomorrow" and "next Monday". */
export function todayInPakistan(now = new Date()): { iso: string; label: string } {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  return { iso, label };
}

function extractionPrompt(known: CustomerDetails): string {
  const today = todayInPakistan();
  const services = MARKETING_SERVICES.map((service) => `- ${service.slug}: ${service.name}`).join("\n");

  return `You maintain the CRM record for a customer chatting with ${BRAND.name}'s customer service. Read the conversation and return what the customer has told us.

Today is ${today.label} (${today.iso}, Pakistan time).

Return ONLY a JSON object with these keys, and null for anything the customer has not clearly told us:
{
  "name": the customer's own name,
  "phone": their phone or WhatsApp number exactly as they typed it,
  "email": their email address,
  "company": their business or company name,
  "businessType": their industry or what their business does, in a few words (e.g. "real estate agency"),
  "website": their business website or domain, as they typed it,
  "country": the country their business is in, in English (e.g. "Pakistan", "UAE", "United Kingdom"),
  "city": their city,
  "companySize": employees, branches or team size as they stated it (e.g. "500 employees", "3 branches"),
  "service": the one service slug from the list below that matches what they want,
  "subService": the specific service in a few English words (e.g. "Local SEO", "Meta Ads", "WhatsApp chatbot"),
  "topic": the one intent from this list that best describes the conversation: ${BOT_INTENT_LIST},
  "requirements": one or two plain English sentences on what they want or the problem they have,
  "businessGoal": what they want to achieve, in English,
  "challenge": the main problem they face today, in English,
  "customerType": the kind of customers they want to attract,
  "leadChannel": where their leads come from today,
  "monthlyLeads": how many leads a month they need, as they stated it,
  "currentMarketing": how they market the business today,
  "monthlyAdSpend": what they spend on ads each month, as they stated it,
  "platform": the platform they want built (e.g. "Shopify", "iOS and Android", "WordPress"),
  "features": the features they asked for, in English,
  "project": which existing BITSOL project a support request is about,
  "budget": their budget as they stated it,
  "timeline": when they want to start or finish, as they stated it,
  "intent": "PROJECT" (wants a service delivered), "CONSULTATION" (wants a call or meeting), "SUPPORT" (existing client with a problem) or "BROWSING" (only asking questions),
  "meetingDate": "YYYY-MM-DD", only if they want a consultation and named a day,
  "meetingTime": the time they named for it, e.g. "3:00 PM" or "evening",
  "meetingMode": "OFFICE", "ZOOM", "GOOGLE_MEET" or "WHATSAPP", only if they chose one,
  "supportCategory": "TECHNICAL", "BILLING", "SALES", "COMPLAINT" or "GENERAL", only when intent is SUPPORT
}

Rules:
- Record only what the CUSTOMER said. Never copy ${BRAND.name}'s own phone number, email or address, and never record something the representative suggested unless the customer confirmed it.
- Menu buttons the customer tapped — "Get a quote", "Main Menu", "Talk to an Expert" — say nothing about what they need. Leave requirements and service null until they describe it themselves. A tapped service name ("🔍 SEO") does tell you the service and topic.
- Answers to the representative's questions count: if it asked "What's your website?" and the customer replied "abcrealtors.com", that is the website.
- Messages may be in English, Urdu, Roman Urdu or Punjabi. Write requirements, goals and challenges in English. Write names in English letters.
- When the customer corrects a detail, use the newest value.
- Keep the details already on file unless the customer changed them.
- Work out relative days ("tomorrow", "next Monday", "kal", "parson") from today's date.

Services:
${services}

Details already on file:
${JSON.stringify(known)}`;
}

function formatTranscript(transcript: ChatTurn[]): string {
  const lines = transcript
    .slice(-30)
    .map(
      (turn) =>
        `${turn.role === "user" ? "CUSTOMER" : "REPRESENTATIVE"}: ${turn.content.slice(0, 1500)}`
    )
    .join("\n\n");
  return `${lines}\n\nReturn the JSON object now.`;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("the extractor returned no JSON object");
  const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("the extractor returned something other than an object");
  }
  return parsed as Record<string, unknown>;
}

// ------------------------------------------------------------ Validation ----

const BRAND_EMAIL = "";

/** Last ten digits of every number that belongs to BITSOL, never to a customer. */
function brandTails(extra: string[] = []): string[] {
  return [...extra]
    .map((phone) => phone.replace(/\D/g, "").slice(-10))
    .filter((tail) => tail.length === 10);
}

function sanitiseDetails(
  raw: Record<string, unknown>,
  context: { customerText: string; channelPhone?: string; brandTails: string[] }
): CustomerDetails {
  const details: CustomerDetails = {
    name: cleanName(raw.name),
    phone: cleanPhone(raw.phone, context),
    email: cleanEmail(raw.email, context.customerText),
    company: text(raw.company, 160),
    businessType: text(raw.businessType, 120),
    website: cleanWebsite(raw.website, context.customerText),
    country: text(raw.country, 60),
    city: text(raw.city, 80),
    companySize: text(raw.companySize, 80),
    service: cleanService(raw.service),
    subService: text(raw.subService, 80),
    topic: oneOf(raw.topic, BOT_INTENTS),
    requirements: text(raw.requirements, 1500),
    businessGoal: text(raw.businessGoal, 500),
    challenge: text(raw.challenge, 500),
    customerType: text(raw.customerType, 80),
    leadChannel: text(raw.leadChannel, 80),
    monthlyLeads: text(raw.monthlyLeads, 80),
    currentMarketing: text(raw.currentMarketing, 200),
    monthlyAdSpend: text(raw.monthlyAdSpend, 80),
    platform: text(raw.platform, 120),
    features: text(raw.features, 800),
    project: text(raw.project, 160),
    budget: text(raw.budget, 80),
    timeline: text(raw.timeline, 80),
    intent: oneOf(raw.intent, CUSTOMER_INTENTS),
    meetingDate: cleanMeetingDate(raw.meetingDate),
    meetingTime: text(raw.meetingTime, 40),
    meetingMode: oneOf(raw.meetingMode, MEETING_MODES),
    supportCategory: oneOf(raw.supportCategory, SUPPORT_CATEGORIES),
  };

  // A time without a day cannot be booked, and neither half means anything
  // once the customer is not asking for a consultation.
  if (!details.meetingDate) delete details.meetingTime;

  return asCustomerDetails(details);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || /^(null|none|n\/a|unknown|not provided|not shared|-)$/i.test(clean)) {
    return undefined;
  }
  return clean.slice(0, max);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const clean = text(value, 40)?.toUpperCase();
  return allowed.find((option) => option === clean);
}

/** A domain the customer actually typed — `abc.com`, `https://abc.com.pk/x`. */
function cleanWebsite(value: unknown, customerText: string): string | undefined {
  const site = text(value, 200)?.replace(/[)\].,]+$/, "");
  if (!site || !/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(site)) return undefined;
  const host = site.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
  if (host.endsWith("bitsolmarketing.com")) return undefined;
  if (!customerText.toLowerCase().includes(host)) return undefined;
  return site;
}

function cleanName(value: unknown): string | undefined {
  const name = text(value, 80);
  if (!name || name.length < 2 || /\d|@/.test(name) || /bitsol/i.test(name)) return undefined;
  return name;
}

function cleanPhone(
  value: unknown,
  context: { customerText: string; channelPhone?: string; brandTails: string[] }
): string | undefined {
  const phone = text(value, 32);
  if (!phone) return undefined;

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return undefined;

  const tail = digits.slice(-10);
  if (context.brandTails.includes(tail)) return undefined;

  // The model may reformat 0300… as +92300…, so compare the last ten digits
  // with every digit the customer typed.
  const typed = context.customerText.replace(/\D/g, "");
  const channel = context.channelPhone?.replace(/\D/g, "") ?? "";
  if (!typed.includes(tail) && !(channel && channel.endsWith(tail))) return undefined;

  return phone;
}

function cleanEmail(value: unknown, customerText: string): string | undefined {
  const email = text(value, 160)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return undefined;
  if (email === BRAND_EMAIL) return undefined;
  if (!customerText.toLowerCase().includes(email)) return undefined;
  return email;
}

function cleanService(value: unknown): string | undefined {
  const service = text(value, 120);
  if (!service) return undefined;
  return (findService(service) ?? matchService(service))?.slug;
}

function cleanMeetingDate(value: unknown): string | undefined {
  const date = text(value, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;

  const day = Date.parse(`${date}T00:00:00Z`);
  const today = Date.parse(`${todayInPakistan().iso}T00:00:00Z`);
  if (Number.isNaN(day) || day < today || day > today + 180 * DAY_MS) return undefined;
  return date;
}

// ------------------------------------------------------ Deterministic scan --

/** Pakistani mobile numbers: 03xx…, +92 3xx…, 92-3xx… with optional separators. */
const PK_MOBILE = /(?:\+?92[\s-]?|\b0)3\d{2}[\s-]?\d{7}\b/g;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** The newest phone number and email the customer typed, without any model. */
function scanContactDetails(customerText: string, brandPhoneTails: string[]): CustomerDetails {
  const phones = (customerText.match(PK_MOBILE) ?? []).filter(
    (phone) => !brandPhoneTails.includes(phone.replace(/\D/g, "").slice(-10))
  );
  const emails = (customerText.match(EMAIL) ?? [])
    .map((email) => email.toLowerCase())
    .filter((email) => email !== BRAND_EMAIL);

  return asCustomerDetails({ phone: phones.at(-1), email: emails.at(-1) });
}
