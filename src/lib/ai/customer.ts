import { BRAND } from "@/config/brand";
import { SUPPORT_CATEGORIES } from "@/lib/bot/types";
import type { ChatTurn } from "./types";

/**
 * =============================================================================
 *  What the customer has told us
 * =============================================================================
 *
 *  The assistant collects a name, a city, a machine model and the rest through
 *  its menus and question flows. Alongside them, every message is scanned for
 *  the details a customer tends to type unprompted — a phone number, an email
 *  address, a reference to track — so they are on file before a flow asks.
 *
 *  The company's own contact details are never recorded as a customer's.
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

/** Human labels, in the order the console lists them. */
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

export interface ExtractionOptions {
  /** The company's own numbers, which are never a customer's. */
  brandPhones?: string[];
  /** The company's own email address. */
  brandEmail?: string;
}

// ------------------------------------------------------------ Extraction ----

/**
 * `known` updated with the phone number, email address and reference number
 * the customer typed most recently in `transcript`.
 */
export function extractCustomerDetails(
  transcript: ChatTurn[],
  known: CustomerDetails,
  options: ExtractionOptions = {}
): CustomerDetails {
  const customerText = transcript
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content)
    .join("\n");
  return mergeDetails(known, scanContactDetails(customerText, brandIdentity(options)));
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

/** Today's date in Pakistan. */
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

interface BrandIdentity {
  tails: string[];
  email: string;
}

/** The company's own contact details, which are never a customer's. */
function brandIdentity(options: ExtractionOptions): BrandIdentity {
  return {
    tails: (options.brandPhones ?? [])
      .map((phone) => phone.replace(/\D/g, "").slice(-10))
      .filter((tail) => tail.length === 10),
    email: (options.brandEmail ?? "").trim().toLowerCase(),
  };
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

/** The newest phone number, email and reference the customer typed. */
function scanContactDetails(customerText: string, brand: BrandIdentity): CustomerDetails {
  const phones = (customerText.match(PK_MOBILE) ?? []).filter(
    (phone) => !brand.tails.includes(phone.replace(/\D/g, "").slice(-10))
  );
  const emails = (customerText.match(EMAIL) ?? [])
    .map((email) => email.toLowerCase())
    .filter((email) => email !== brand.email);

  return asCustomerDetails({ phone: phones.at(-1), email: emails.at(-1), trackingReference: findReference(customerText) });
}
