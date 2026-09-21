import { config } from "@/lib/config";
import { BRAND } from "@/config/brand";
import { BOT_INTENTS, SUPPORT_CATEGORIES } from "@/lib/bot/types";
import { getProvider } from "./provider";
import type { ChatTurn } from "./types";

const BOT_INTENT_LIST = BOT_INTENTS.join(", ");

/**
 * =============================================================================
 *  What the customer has told us
 * =============================================================================
 *
 *  The assistant asks for a name, a number or a machine model when the
 *  conversation makes room for it, in any order and in any language. After
 *  every turn a second, JSON-only model call reads the transcript back out into
 *  structured details.
 *
 *  Nothing the extractor returns is trusted as-is. A phone number or email has
 *  to appear in something the customer actually typed, the company's own
 *  contact details are refused, a product category must exist in the catalogue
 *  and an appointment date must be a real future day. The model can miss a
 *  detail; it cannot invent one that ends up in the CRM.
 * =============================================================================
 */

export const CUSTOMER_INTENTS = ["PURCHASE", "APPOINTMENT", "SERVICE", "BROWSING"] as const;
export const MEETING_MODES = ["SITE_VISIT", "PHONE_CALL", "WHATSAPP", "OFFICE", "ZOOM", "GOOGLE_MEET"] as const;
export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export { SUPPORT_CATEGORIES };

export type CustomerIntent = (typeof CUSTOMER_INTENTS)[number];
export type MeetingModeValue = (typeof MEETING_MODES)[number];
export type SupportCategoryValue = (typeof SUPPORT_CATEGORIES)[number];
export type PriorityValue = (typeof PRIORITIES)[number];

export interface CustomerDetails {
  name?: string;
  phone?: string;
  /** A WhatsApp number, when it differs from the phone number or was asked for. */
  whatsapp?: string;
  email?: string;
  company?: string;
  /** What the business or institution does — "school", "bank branch". Shown as Industry. */
  businessType?: string;
  website?: string;
  country?: string;
  city?: string;
  /** Where an installation or a visit should happen. */
  address?: string;
  /** Employees, branches or offices, as they put it. */
  companySize?: string;
  /** Catalogue slug of the product category they want. */
  productCategory?: string;
  /** Catalogue id of the product they looked at, when they opened one. */
  productId?: string;
  /** What they are interested in, in words — "Photocopier / MFP", "Toner for a duplicator". */
  interest?: string;
  /** The assistant's intent classification (`BOT_INTENTS` in `lib/bot/types.ts`). */
  topic?: string;
  /** What they want or the problem they have, summarised in English. */
  requirements?: string;
  quantity?: string;
  budget?: string;
  timeline?: string;
  /** How they would like to be contacted: Phone call, WhatsApp or Email. */
  preferredContact?: string;
  /** The machine a service request is about. */
  machineType?: string;
  machineBrand?: string;
  machineModel?: string;
  serialNumber?: string;
  priority?: PriorityValue;
  /** A reference the customer wants to track, e.g. PL-TKT-7F3K2Q9A. */
  trackingReference?: string;
  intent?: CustomerIntent;
  /** YYYY-MM-DD — the day they want a visit, a demonstration or a call. */
  meetingDate?: string;
  meetingTime?: string;
  meetingMode?: MeetingModeValue;
  supportCategory?: SupportCategoryValue;
}

export const MEETING_MODE_LABEL: Record<MeetingModeValue, string> = {
  SITE_VISIT: "Visit at their premises",
  PHONE_CALL: "Phone call",
  WHATSAPP: "WhatsApp call",
  OFFICE: "At a Pros-Link office",
  ZOOM: "Video call (Zoom)",
  GOOGLE_MEET: "Video call (Google Meet)",
};

/** Human labels, in the order the console and the prompt list them. */
export const DETAIL_LABELS: Array<[keyof CustomerDetails, string]> = [
  ["name", "Name"],
  ["phone", "Phone"],
  ["whatsapp", "WhatsApp"],
  ["email", "Email"],
  ["company", "Company"],
  ["businessType", "Industry"],
  ["city", "City"],
  ["address", "Address"],
  ["companySize", "Company size"],
  ["country", "Country"],
  ["website", "Website"],
  ["productCategory", "Product category"],
  ["interest", "Interested in"],
  ["topic", "Intent"],
  ["requirements", "Requirement"],
  ["quantity", "Quantity"],
  ["budget", "Budget"],
  ["timeline", "Timeline"],
  ["preferredContact", "Preferred contact"],
  ["machineType", "Machine"],
  ["machineBrand", "Brand"],
  ["machineModel", "Model"],
  ["serialNumber", "Serial number"],
  ["priority", "Priority"],
  ["meetingDate", "Preferred day"],
  ["meetingTime", "Preferred time"],
  ["meetingMode", "Appointment type"],
  ["trackingReference", "Reference to track"],
  ["intent", "Looking to"],
  ["supportCategory", "Request type"],
];

const DETAIL_KEYS = DETAIL_LABELS.map(([key]) => key).concat(["productId"]);
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExtractionOptions {
  /** The number the customer is writing from, on WhatsApp. */
  channelPhone?: string;
  /** The company's own numbers, which are never a customer's. */
  brandPhones?: string[];
  /** The company's own email address. */
  brandEmail?: string;
  /** The company's own website host. */
  brandHost?: string;
  /** Catalogue categories a `productCategory` must be one of. */
  categories?: Array<{ slug: string; name: string }>;
}

// ------------------------------------------------------------ Extraction ----

/**
 * Read the conversation and return everything known about the customer:
 * `known` updated with whatever this transcript adds or corrects.
 *
 * Never throws. Without a working model it still picks up phone numbers and
 * email addresses deterministically, so a provider outage does not lose the
 * one detail the team cannot work without.
 */
export async function extractCustomerDetails(
  transcript: ChatTurn[],
  known: CustomerDetails,
  options: ExtractionOptions = {}
): Promise<CustomerDetails> {
  const customerText = transcript
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content)
    .join("\n");
  const brand = brandIdentity(options);

  let extracted: CustomerDetails = {};
  try {
    let raw = "";
    for await (const chunk of getProvider().streamChat({
      system: extractionPrompt(known, options.categories ?? []),
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
      brand,
      categories: options.categories ?? [],
    });
  } catch (error) {
    console.warn("[customer] extraction skipped:", error instanceof Error ? error.message : String(error));
  }

  // The deterministic scan only fills what the model left empty: when both
  // found a number, the model knows which one the customer said to use.
  const scanned = scanContactDetails(customerText, brand);
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

/** Today's date in Pakistan — the anchor for "tomorrow" and "next Monday". */
export function todayInPakistan(now = new Date()): { iso: string; label: string } {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAND.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: BRAND.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  return { iso, label };
}

function extractionPrompt(known: CustomerDetails, categories: Array<{ slug: string; name: string }>): string {
  const today = todayInPakistan();
  const categoryList = categories.length
    ? categories.map((category) => `- ${category.slug}: ${category.name}`).join("\n")
    : "(none)";

  return `You maintain the CRM record for a customer chatting with ${BRAND.name}'s customer service. ${BRAND.name} sells and services office equipment — duplicators, photocopiers, printers, supplies, consumables and parts. Read the conversation and return what the customer has told us.

Today is ${today.label} (${today.iso}, Pakistan time).

Return ONLY a JSON object with these keys, and null for anything the customer has not clearly told us:
{
  "name": the customer's own name,
  "phone": their phone number exactly as they typed it,
  "whatsapp": their WhatsApp number, only if they gave one separately or said which number is on WhatsApp,
  "email": their email address,
  "company": their company, school, office or institution name,
  "businessType": what the organisation does, in a few words (e.g. "school", "law firm", "bank branch"),
  "city": their city,
  "address": the address or area where a visit or installation should happen,
  "companySize": employees, branches or offices as they stated it,
  "country": their country, in English, only if they said it,
  "website": their website or domain, as they typed it,
  "productCategory": the one category slug from the list below that matches what they want to buy or ask about,
  "interest": what they are interested in, in a few English words (e.g. "A3 photocopier", "toner for a duplicator"),
  "topic": the one intent from this list that best describes the conversation: ${BOT_INTENT_LIST},
  "requirements": one or two plain English sentences on what they want or the problem they have,
  "quantity": how many units they need, as they stated it,
  "budget": their budget as they stated it,
  "timeline": when they need it, as they stated it,
  "preferredContact": "Phone call", "WhatsApp" or "Email", only if they said how they prefer to be contacted,
  "machineType": the machine a service or parts request is about (e.g. "photocopier", "digital duplicator"),
  "machineBrand": its brand, as they stated it,
  "machineModel": its model, as they typed it,
  "serialNumber": its serial number, exactly as they typed it,
  "priority": "URGENT" (machine down, work stopped), "HIGH", "NORMAL" or "LOW", only for a service request and only if they made the urgency clear,
  "trackingReference": a reference number they want to check, e.g. "PL-TKT-7F3K2Q9A", exactly as typed,
  "intent": "PURCHASE" (wants to buy or get a quotation), "APPOINTMENT" (wants a demonstration, visit or call), "SERVICE" (installation, repair, maintenance, parts or support for a machine they have) or "BROWSING" (only asking questions),
  "meetingDate": "YYYY-MM-DD", only if they asked for a visit, demonstration or call and named a day,
  "meetingTime": the time they named for it, e.g. "3:00 PM" or "morning",
  "meetingMode": "SITE_VISIT", "PHONE_CALL" or "WHATSAPP", only if they chose one,
  "supportCategory": one of ${SUPPORT_CATEGORIES.join(", ")}, only when intent is SERVICE
}

Rules:
- Record only what the CUSTOMER said. Never copy ${BRAND.name}'s own phone number, email or address, and never record something the assistant suggested unless the customer confirmed it.
- Menu buttons the customer tapped — "Request a Quote", "Main Menu", "Talk to Sales" — say nothing about what they need. A tapped category or product name does tell you the category and interest.
- Answers to the assistant's questions count: if it asked "Which city are you in?" and the customer replied "Lahore", that is the city.
- Messages may be in English, Urdu, Roman Urdu or Punjabi. Write requirements and interest in English. Write names in English letters.
- When the customer corrects a detail, use the newest value.
- Keep the details already on file unless the customer changed them.
- Work out relative days ("tomorrow", "next Monday", "kal", "parson") from today's date.

Product categories:
${categoryList}

Details already on file:
${JSON.stringify(known)}`;
}

function formatTranscript(transcript: ChatTurn[]): string {
  const lines = transcript
    .slice(-30)
    .map((turn) => `${turn.role === "user" ? "CUSTOMER" : "ASSISTANT"}: ${turn.content.slice(0, 1500)}`)
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

interface BrandIdentity {
  tails: string[];
  email: string;
  host: string;
}

/** The company's own contact details, which are never a customer's. */
function brandIdentity(options: ExtractionOptions): BrandIdentity {
  return {
    tails: (options.brandPhones ?? [])
      .map((phone) => phone.replace(/\D/g, "").slice(-10))
      .filter((tail) => tail.length === 10),
    email: (options.brandEmail ?? "").trim().toLowerCase(),
    host: (options.brandHost ?? "").trim().toLowerCase(),
  };
}

function sanitiseDetails(
  raw: Record<string, unknown>,
  context: {
    customerText: string;
    channelPhone?: string;
    brand: BrandIdentity;
    categories: Array<{ slug: string; name: string }>;
  }
): CustomerDetails {
  const details: CustomerDetails = {
    name: cleanName(raw.name),
    phone: cleanPhone(raw.phone, context),
    whatsapp: cleanPhone(raw.whatsapp, context),
    email: cleanEmail(raw.email, context.customerText, context.brand),
    company: text(raw.company, 160),
    businessType: text(raw.businessType, 120),
    city: text(raw.city, 80),
    address: text(raw.address, 300),
    companySize: text(raw.companySize, 80),
    country: text(raw.country, 60),
    website: cleanWebsite(raw.website, context.customerText, context.brand),
    productCategory: cleanCategory(raw.productCategory, context.categories),
    interest: text(raw.interest, 120),
    topic: oneOf(raw.topic, BOT_INTENTS),
    requirements: text(raw.requirements, 1500),
    quantity: text(raw.quantity, 60),
    budget: text(raw.budget, 80),
    timeline: text(raw.timeline, 80),
    preferredContact: oneOfLabel(raw.preferredContact, ["Phone call", "WhatsApp", "Email"]),
    machineType: text(raw.machineType, 80),
    machineBrand: text(raw.machineBrand, 60),
    machineModel: text(raw.machineModel, 80),
    serialNumber: cleanSerial(raw.serialNumber, context.customerText),
    priority: oneOf(raw.priority, PRIORITIES),
    trackingReference: cleanReference(raw.trackingReference, context.customerText),
    intent: oneOf(raw.intent, CUSTOMER_INTENTS),
    meetingDate: cleanMeetingDate(raw.meetingDate),
    meetingTime: text(raw.meetingTime, 40),
    meetingMode: oneOf(raw.meetingMode, MEETING_MODES),
    supportCategory: oneOf(raw.supportCategory, SUPPORT_CATEGORIES),
  };

  // A time without a day cannot be scheduled.
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

function oneOfLabel(value: unknown, allowed: readonly string[]): string | undefined {
  const clean = text(value, 40)?.toLowerCase();
  return allowed.find((option) => option.toLowerCase() === clean);
}

function cleanCategory(value: unknown, categories: Array<{ slug: string; name: string }>): string | undefined {
  const clean = text(value, 80)?.toLowerCase();
  if (!clean) return undefined;
  return categories.find((category) => category.slug === clean || category.name.toLowerCase() === clean)?.slug;
}

/** A domain the customer actually typed — `abc.com`, `https://abc.com.pk/x`. */
function cleanWebsite(value: unknown, customerText: string, brand: BrandIdentity): string | undefined {
  const site = text(value, 200)?.replace(/[)\].,]+$/, "");
  if (!site || !/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(site)) return undefined;
  const host = site.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
  if (brand.host && host.endsWith(brand.host)) return undefined;
  if (!customerText.toLowerCase().includes(host)) return undefined;
  return site;
}

function cleanName(value: unknown): string | undefined {
  const name = text(value, 80);
  if (!name || name.length < 2 || /\d|@/.test(name) || /pros[\s-]?link/i.test(name)) return undefined;
  return name;
}

function cleanPhone(
  value: unknown,
  context: { customerText: string; channelPhone?: string; brand: BrandIdentity }
): string | undefined {
  const phone = text(value, 32);
  if (!phone) return undefined;

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return undefined;

  const tail = digits.slice(-10);
  if (context.brand.tails.includes(tail)) return undefined;

  // The model may reformat 0300… as +92300…, so compare the last ten digits
  // with every digit the customer typed.
  const typed = context.customerText.replace(/\D/g, "");
  const channel = context.channelPhone?.replace(/\D/g, "") ?? "";
  if (!typed.includes(tail) && !(channel && channel.endsWith(tail))) return undefined;

  return phone;
}

function cleanEmail(value: unknown, customerText: string, brand: BrandIdentity): string | undefined {
  const email = text(value, 160)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return undefined;
  if (brand.email && email === brand.email) return undefined;
  if (!customerText.toLowerCase().includes(email)) return undefined;
  return email;
}

/** A serial number must appear, as typed, in the customer's messages. */
function cleanSerial(value: unknown, customerText: string): string | undefined {
  const serial = text(value, 60);
  if (!serial) return undefined;
  const squash = (s: string) => s.toLowerCase().replace(/[\s-]/g, "");
  return squash(customerText).includes(squash(serial)) ? serial : undefined;
}

/** A reference in the platform's format that the customer actually typed. */
function cleanReference(value: unknown, customerText: string): string | undefined {
  const reference = text(value, 40)?.toUpperCase();
  if (!reference || !REFERENCE.test(reference)) return undefined;
  return customerText.toUpperCase().includes(reference) ? reference : undefined;
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

/** A customer-facing reference, e.g. PL-TKT-7F3K2Q9A. */
export const REFERENCE = /^[A-Z]{2}-(LEAD|TKT|QTE|MTG)-[A-Z2-9]{6,10}$/;
const REFERENCE_IN_TEXT = /\b[A-Z]{2}-(?:LEAD|TKT|QTE|MTG)-[A-Z2-9]{6,10}\b/i;

/** The first reference number in a message, upper-cased, if there is one. */
export function findReference(message: string): string | undefined {
  return message.match(REFERENCE_IN_TEXT)?.[0].toUpperCase();
}

/** Pakistani mobile numbers: 03xx…, +92 3xx…, 92-3xx… with optional separators. */
const PK_MOBILE = /(?:\+?92[\s-]?|\b0)3\d{2}[\s-]?\d{7}\b/g;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** The newest phone number, email and reference the customer typed, without any model. */
function scanContactDetails(customerText: string, brand: BrandIdentity): CustomerDetails {
  const phones = (customerText.match(PK_MOBILE) ?? []).filter(
    (phone) => !brand.tails.includes(phone.replace(/\D/g, "").slice(-10))
  );
  const emails = (customerText.match(EMAIL) ?? [])
    .map((email) => email.toLowerCase())
    .filter((email) => email !== brand.email);

  return asCustomerDetails({ phone: phones.at(-1), email: emails.at(-1), trackingReference: findReference(customerText) });
}
