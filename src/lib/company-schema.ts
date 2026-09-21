import { z } from "zod";

/**
 * The company profile: the contact details and links every surface shows.
 *
 * Every field is optional and empty by default. Nothing is shown — and the
 * assistant never gives a number — until a person enters it in Admin →
 * Settings. Isomorphic, so the settings form validates with the same rules
 * the API enforces.
 */

const blank = z.literal("");
const text = (max: number) => z.string().trim().max(max);
const url = z.string().trim().url("Enter a full URL, starting with https://").max(300).or(blank);
const phone = z
  .string()
  .trim()
  .max(40)
  .refine((value) => !value || /^\+?[\d\s()-]{7,20}$/.test(value), "Enter a phone number, e.g. +92 300 1234567");

export const officeSchema = z.object({
  city: text(80).min(1, "City is required"),
  address: text(300).default(""),
  phone: phone.default(""),
});

export const companyProfileSchema = z.object({
  phone: phone.default(""),
  /** The WhatsApp Business number customers are sent to (wa.me links, the chat CTA). */
  whatsapp: phone.default(""),
  email: z.string().trim().email("Enter a valid email address").max(160).or(blank).default(""),
  website: url.default(""),
  /** Head office address. */
  address: text(300).default(""),
  offices: z.array(officeSchema).max(20).default([]),
  /** Opening hours in words, e.g. "Monday–Saturday, 9:00 AM – 6:00 PM". */
  hours: text(160).default(""),
  logoUrl: z
    .string()
    .trim()
    .max(300)
    .refine((value) => !value || value.startsWith("/") || /^https?:\/\//.test(value), "Use a path under /public or a full URL")
    .default(""),
  social: z
    .object({
      facebook: url.default(""),
      instagram: url.default(""),
      linkedin: url.default(""),
      youtube: url.default(""),
      x: url.default(""),
      tiktok: url.default(""),
    })
    .default({}),
});

export type CompanyProfile = z.infer<typeof companyProfileSchema>;
export type Office = z.infer<typeof officeSchema>;

export const EMPTY_COMPANY_PROFILE: CompanyProfile = companyProfileSchema.parse({});

/** Digits only, for tel: and wa.me links. */
export function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/** A wa.me link for the configured WhatsApp number, optionally with a prefilled message. */
export function whatsappLink(profile: Pick<CompanyProfile, "whatsapp">, text?: string): string | null {
  const number = digits(profile.whatsapp);
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** True when at least one way to reach the company has been entered. */
export function hasContact(profile: CompanyProfile): boolean {
  return Boolean(profile.phone || profile.whatsapp || profile.email);
}

export const SOCIAL_LABELS: Record<keyof CompanyProfile["social"], string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X",
  tiktok: "TikTok",
};

/** The contact details the assistant may give out, in the shape the engine takes. */
export function contactOf(profile: CompanyProfile): {
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  address: string;
  hours: string;
  offices: Array<{ city: string; address: string; phone: string }>;
} {
  return {
    phone: profile.phone,
    whatsapp: profile.whatsapp,
    email: profile.email,
    website: profile.website,
    address: profile.address,
    hours: profile.hours,
    offices: profile.offices.map((office) => ({ city: office.city, address: office.address, phone: office.phone })),
  };
}
