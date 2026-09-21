import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { can } from "@/lib/permissions";
import { audit, notifyStaff } from "@/lib/notify";
import { linkCustomer } from "@/lib/customers";
import { generateReference } from "@/lib/utils";
import { fail, ok, readBody } from "@/lib/admin/http";
import { LEAD_SOURCES, PRIORITIES } from "@/lib/admin/labels";
import { money, optionalEmail, optionalPhone, phoneField, recordId, text } from "@/lib/admin/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2, "Enter the contact's name.").max(120),
  company: text(160).optional(),
  phone: phoneField,
  whatsapp: optionalPhone.optional(),
  email: optionalEmail.optional(),
  city: text(80).optional(),
  productCategoryId: recordId.nullable().optional(),
  productId: recordId.nullable().optional(),
  quantity: text(60).optional(),
  budget: text(80).optional(),
  timeline: text(80).optional(),
  preferredContact: text(40).optional(),
  requirements: z.string().trim().min(3, "Describe what the customer needs.").max(4000),
  source: z.enum(LEAD_SOURCES).default("PHONE"),
  priority: z.enum(PRIORITIES).default("NORMAL"),
  estimatedValue: money.nullable().optional(),
  ownerId: recordId.nullable().optional(),
});

/** A lead entered by staff — a phone call, a walk-in, a referral. */
export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("leads.manage", req);
  if ("response" in guard) return guard.response;
  const body = await readBody(req, schema);
  if ("response" in body) return body.response;
  const input = body.data;

  const [category, product, owner] = await Promise.all([
    input.productCategoryId ? prisma.productCategory.findFirst({ where: { id: input.productCategoryId, department: DEPARTMENT }, select: { id: true, name: true } }) : null,
    input.productId ? prisma.product.findFirst({ where: { id: input.productId, department: DEPARTMENT }, select: { id: true, name: true } }) : null,
    input.ownerId ? prisma.user.findFirst({ where: { id: input.ownerId, department: DEPARTMENT, isActive: true }, select: { id: true, role: true } }) : null,
  ]);
  if (input.productCategoryId && !category) return fail("Choose a category from the list.", 400, { productCategoryId: "Not found." });
  if (input.productId && !product) return fail("Choose a product from the list.", 400, { productId: "Not found." });
  if (input.ownerId && !(owner && can(owner.role, "leads.manage"))) return fail("That person cannot own leads.", 400, { ownerId: "Cannot own leads." });

  try {
    const reference = generateReference("LEAD");
    const lead = await prisma.$transaction(async (tx) => {
      const customerId = await linkCustomer(tx, {
        name: input.name,
        phone: input.phone,
        whatsapp: input.whatsapp,
        email: input.email,
        company: input.company,
        city: input.city,
        source: input.source,
      });
      return tx.lead.create({
        data: {
          reference,
          department: DEPARTMENT,
          name: input.name,
          company: input.company ?? null,
          phone: input.phone,
          whatsapp: input.whatsapp ?? null,
          email: input.email ?? null,
          city: input.city ?? null,
          productCategoryId: category?.id ?? null,
          productId: product?.id ?? null,
          subService: product?.name ?? category?.name ?? null,
          quantity: input.quantity ?? null,
          budget: input.budget ?? null,
          timeline: input.timeline ?? null,
          preferredContact: input.preferredContact ?? null,
          requirements: input.requirements,
          source: input.source,
          priority: input.priority,
          estimatedValue: input.estimatedValue ?? null,
          ownerId: owner?.id ?? guard.staff.id,
          customerId,
          stage: "NEW",
        },
        select: { id: true, ownerId: true },
      });
    });

    await audit({
      action: "lead.created",
      entity: "Lead",
      entityId: lead.id,
      userId: guard.staff.id,
      message: `${guard.staff.name} added lead ${reference} (${input.name}).`,
      after: { reference, name: input.name, company: input.company, source: input.source, ownerId: lead.ownerId },
      req,
    });
    if (lead.ownerId && lead.ownerId !== guard.staff.id) {
      await notifyStaff({ userIds: [lead.ownerId], subject: `${guard.staff.name} assigned you lead ${reference} (${input.name})`, link: `/admin/leads/${lead.id}` });
    }
    return ok({ id: lead.id, reference }, 201);
  } catch (error) {
    console.error("[leads] create failed:", error);
    return fail("The lead could not be saved.", 500);
  }
}
