import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { findCustomer } from "@/lib/customers";
import { generateReference } from "@/lib/utils";
import { fail, ok, readBody } from "@/lib/admin/http";
import { CUSTOMER_STATUSES, LEAD_SOURCES } from "@/lib/admin/labels";
import { optionalEmail, optionalPhone, phoneField, text } from "@/lib/admin/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name.").max(120),
  company: text(160).optional(),
  phone: phoneField,
  whatsapp: optionalPhone.optional(),
  email: optionalEmail.optional(),
  address: text(300).optional(),
  city: text(80).optional(),
  industry: text(80).optional(),
  notes: text(4000).optional(),
  status: z.enum(CUSTOMER_STATUSES).default("PROSPECT"),
  source: z.enum(LEAD_SOURCES).nullable().optional(),
});

/** Add a customer. A phone number or email already on file points to that profile instead. */
export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("customers.manage", req);
  if ("response" in guard) return guard.response;
  const body = await readBody(req, schema);
  if ("response" in body) return body.response;
  const input = body.data;

  const existing = await findCustomer(prisma, { phone: input.phone, whatsapp: input.whatsapp, email: input.email });
  if (existing) {
    return Response.json(
      { error: "A customer with this phone number or email already exists.", existingId: existing, fields: { phone: "Already on file." } },
      { status: 409 }
    );
  }

  try {
    const reference = generateReference("CUS");
    const customer = await prisma.customer.create({
      data: {
        reference,
        department: DEPARTMENT,
        name: input.name,
        company: input.company ?? null,
        phone: input.phone,
        whatsapp: input.whatsapp ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        industry: input.industry ?? null,
        notes: input.notes ?? null,
        status: input.status,
        source: input.source ?? null,
        ownerId: guard.staff.id,
        lastInteractionAt: new Date(),
      },
      select: { id: true },
    });
    await audit({
      action: "customer.created",
      entity: "Customer",
      entityId: customer.id,
      userId: guard.staff.id,
      message: `${guard.staff.name} added customer ${input.name}.`,
      after: { reference, name: input.name, company: input.company, status: input.status },
      req,
    });
    return ok({ id: customer.id, reference }, 201);
  } catch (error) {
    console.error("[customers] create failed:", error);
    return fail("The customer could not be saved.", 500);
  }
}
