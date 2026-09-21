import type { LeadSource, Prisma, PrismaClient } from "@prisma/client";
import { DEPARTMENT } from "@/config/brand";
import { generateReference } from "@/lib/utils";

/**
 * =============================================================================
 *  One customer, however they reached us
 * =============================================================================
 *
 *  Every lead, quote request, service ticket and conversation is attached to a
 *  customer profile, so the team sees one timeline per person or organisation
 *  instead of scattered records. A returning customer is recognised by phone
 *  number — compared on its last ten digits, so "0300 1234567", "+92 300
 *  1234567" and "923001234567" are the same person — or by email.
 *
 *  A new contact becomes a PROSPECT; a won lead makes them ACTIVE.
 * =============================================================================
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface CustomerInput {
  name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  address?: string | null;
  businessType?: string | null;
  source?: LeadSource;
}

/** Last ten digits — how two spellings of one number are compared. */
export function phoneTail(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

/** The existing customer this contact belongs to, if any. */
export async function findCustomer(db: Db, input: Pick<CustomerInput, "phone" | "whatsapp" | "email">): Promise<string | null> {
  const tails = [phoneTail(input.phone), phoneTail(input.whatsapp)].filter((tail): tail is string => Boolean(tail));
  for (const tail of tails) {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM customers
      WHERE "department"::text = ${DEPARTMENT}
        AND (right(regexp_replace(phone, '\\D', '', 'g'), 10) = ${tail}
             OR right(regexp_replace(coalesce(whatsapp, ''), '\\D', '', 'g'), 10) = ${tail})
      ORDER BY "createdAt" ASC
      LIMIT 1`;
    if (rows[0]) return rows[0].id;
  }
  const email = input.email?.trim().toLowerCase();
  if (email) {
    const byEmail = await db.customer.findFirst({
      where: { department: DEPARTMENT, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (byEmail) return byEmail.id;
  }
  return null;
}

/**
 * Find the customer for this contact, or create one. Fills in details the
 * profile is missing but never overwrites what the team has already entered.
 * Returns null when there is neither a phone number nor an email to go on.
 */
export async function linkCustomer(db: Db, input: CustomerInput): Promise<string | null> {
  if (!phoneTail(input.phone) && !phoneTail(input.whatsapp) && !input.email) return null;

  const existingId = await findCustomer(db, input);
  const now = new Date();

  if (existingId) {
    const current = await db.customer.findUnique({
      where: { id: existingId },
      select: { name: true, company: true, email: true, whatsapp: true, city: true, address: true, industry: true },
    });
    const fill: Prisma.CustomerUpdateInput = { lastInteractionAt: now };
    if (current) {
      if ((!current.name || current.name === "WhatsApp contact") && input.name) fill.name = input.name;
      if (!current.company && input.company) fill.company = input.company;
      if (!current.email && input.email) fill.email = input.email.toLowerCase();
      if (!current.whatsapp && input.whatsapp) fill.whatsapp = input.whatsapp;
      if (!current.city && input.city) fill.city = input.city;
      if (!current.address && input.address) fill.address = input.address;
      if (!current.industry && input.businessType) fill.industry = input.businessType;
    }
    await db.customer.update({ where: { id: existingId }, data: fill });
    return existingId;
  }

  const created = await db.customer.create({
    data: {
      reference: generateReference("CUS"),
      department: DEPARTMENT,
      name: input.name?.trim() || input.company?.trim() || "New customer",
      company: input.company ?? null,
      phone: input.phone ?? input.whatsapp ?? "",
      whatsapp: input.whatsapp ?? null,
      email: input.email?.toLowerCase() ?? null,
      city: input.city ?? null,
      address: input.address ?? null,
      industry: input.businessType ?? null,
      source: input.source ?? null,
      status: "PROSPECT",
      lastInteractionAt: now,
    },
    select: { id: true },
  });
  return created.id;
}
