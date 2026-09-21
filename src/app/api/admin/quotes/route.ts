import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { generateReference } from "@/lib/utils";
import { fail, ok, readBody } from "@/lib/admin/http";
import { recordId } from "@/lib/admin/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ leadId: recordId });

/**
 * Start a quotation for a lead. The request details are copied from the lead;
 * prices are entered by the team on the quote itself.
 */
export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("quotes.manage", req);
  if ("response" in guard) return guard.response;
  const body = await readBody(req, schema);
  if ("response" in body) return body.response;

  const lead = await prisma.lead.findFirst({
    where: { id: body.data.leadId, department: DEPARTMENT },
    select: {
      id: true, reference: true, name: true, company: true, subService: true, quantity: true, requirements: true, budget: true,
      preferredContact: true, city: true, productCategoryId: true, productId: true, customerId: true, conversationId: true, source: true, stage: true,
    },
  });
  if (!lead) return fail("Lead not found.", 404);

  try {
    const reference = generateReference("QTE");
    const quote = await prisma.quote.create({
      data: {
        reference,
        department: DEPARTMENT,
        title: `${lead.subService ?? "Quotation"} — ${lead.company || lead.name}`.slice(0, 180),
        status: "DRAFT",
        quantity: lead.quantity,
        requirements: lead.requirements,
        budget: lead.budget,
        preferredContact: lead.preferredContact,
        city: lead.city,
        productCategoryId: lead.productCategoryId,
        productId: lead.productId,
        source: lead.source,
        leadId: lead.id,
        customerId: lead.customerId,
        conversationId: lead.conversationId,
        ownerId: guard.staff.id,
      },
      select: { id: true },
    });
    if (["NEW", "CONTACTED", "QUALIFIED"].includes(lead.stage)) {
      await prisma.lead.update({ where: { id: lead.id }, data: { stage: "QUOTE_REQUESTED" } });
    }
    await audit({
      action: "quote.created",
      entity: "Quote",
      entityId: quote.id,
      userId: guard.staff.id,
      message: `${guard.staff.name} started quotation ${reference} for lead ${lead.reference}.`,
      after: { reference, leadId: lead.id, status: "DRAFT" },
      req,
    });
    return ok({ id: quote.id, reference, href: `/admin/quotes/${quote.id}` }, 201);
  } catch (error) {
    console.error("[quotes] create failed:", error);
    return fail("The quotation could not be created.", 500);
  }
}
