import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { hasPermission, requireApiStaff } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { asCustomerDetails } from "@/lib/ai/customer";
import { linkCustomer } from "@/lib/customers";
import { readCapture, requirementsFor } from "@/lib/capture";
import { generateReference } from "@/lib/utils";
import { fail, notFound, ok, readBody } from "@/lib/admin/http";
import { TICKET_CATEGORIES, TICKET_CATEGORY_LABEL } from "@/lib/admin/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("LEAD") }),
  z.object({ kind: z.literal("QUOTE") }),
  z.object({ kind: z.literal("TICKET"), category: z.enum(TICKET_CATEGORIES).default("GENERAL") }),
]);

/**
 * Turn a conversation into a lead, a quote request or a ticket, using what the
 * customer already told the assistant or the team. The new record is linked to
 * the conversation and the customer's profile.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiStaff(req);
  if ("response" in guard) return guard.response;
  const { staff } = guard;
  const body = await readBody(req, schema);
  if ("response" in body) return body.response;
  const input = body.data;

  const needs = input.kind === "LEAD" ? "leads.manage" : input.kind === "QUOTE" ? "quotes.manage" : "tickets.manage";
  if (!hasPermission(staff, needs) || !hasPermission(staff, "conversations.view")) return fail("Your role does not allow this.", 403);

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, department: DEPARTMENT },
    select: { id: true, reference: true, channel: true, contactName: true, contactPhone: true, capture: true, customerId: true, summary: true, trafficSource: true, campaign: true },
  });
  if (!conversation) return notFound();

  const capture = readCapture(conversation.capture);
  const details = asCustomerDetails(capture.details);
  const phone = details.phone ?? conversation.contactPhone ?? "";
  const name = details.name ?? conversation.contactName ?? "";
  if (!phone) return fail("There is no phone number for this contact yet. Ask for one in the conversation first.", 400);
  const source = conversation.channel === "WHATSAPP" ? ("WHATSAPP" as const) : ("CHATBOT" as const);

  const category = details.productCategory
    ? await prisma.productCategory.findFirst({ where: { department: DEPARTMENT, slug: details.productCategory }, select: { id: true, name: true } })
    : null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customerId =
        conversation.customerId ??
        (await linkCustomer(tx, {
          name: name || null,
          phone,
          whatsapp: details.whatsapp ?? (conversation.channel === "WHATSAPP" ? conversation.contactPhone : null),
          email: details.email,
          company: details.company,
          city: details.city,
          address: details.address,
          businessType: details.businessType,
          source,
        }));
      if (customerId && !conversation.customerId) await tx.conversation.update({ where: { id }, data: { customerId } });

      if (input.kind === "TICKET") {
        const reference = generateReference("TKT");
        const machine = [details.machineType, [details.machineBrand, details.machineModel].filter(Boolean).join(" ")].filter(Boolean).join(" — ");
        const ticket = await tx.ticket.create({
          data: {
            reference,
            department: DEPARTMENT,
            category: input.category,
            status: "OPEN",
            priority: details.priority ?? "NORMAL",
            subject: `${TICKET_CATEGORY_LABEL[input.category]}${machine ? ` — ${machine}` : ""}`.slice(0, 160),
            description: details.requirements ?? conversation.summary ?? "Raised from a conversation — see the transcript.",
            contactName: name || null,
            contactPhone: phone,
            contactEmail: details.email ?? null,
            company: details.company ?? null,
            city: details.city ?? null,
            address: details.address ?? null,
            machineType: details.machineType ?? null,
            machineBrand: details.machineBrand ?? null,
            machineModel: details.machineModel ?? null,
            serialNumber: details.serialNumber ?? null,
            source,
            reporterId: staff.id,
            customerId,
            conversationId: id,
          },
          select: { id: true },
        });
        return { kind: "Ticket" as const, id: ticket.id, reference, href: `/admin/tickets/${ticket.id}` };
      }

      // Leads and quotes: reuse the conversation's lead when there is one.
      let lead = capture.leadId ? await tx.lead.findFirst({ where: { id: capture.leadId, department: DEPARTMENT }, select: { id: true, reference: true } }) : null;
      if (!lead) {
        const reference = generateReference("LEAD");
        lead = await tx.lead.create({
          data: {
            reference,
            department: DEPARTMENT,
            name: name || "Customer",
            company: details.company ?? null,
            phone,
            whatsapp: details.whatsapp ?? null,
            email: details.email ?? null,
            city: details.city ?? null,
            productCategoryId: category?.id ?? null,
            subService: details.interest ?? category?.name ?? null,
            quantity: details.quantity ?? null,
            budget: details.budget ?? null,
            timeline: details.timeline ?? null,
            preferredContact: details.preferredContact ?? null,
            requirements: requirementsFor(details),
            source,
            trafficSource: conversation.trafficSource,
            campaign: conversation.campaign,
            stage: input.kind === "QUOTE" ? "QUOTE_REQUESTED" : "NEW",
            ownerId: staff.id,
            conversationId: id,
            customerId,
          },
          select: { id: true, reference: true },
        });
      }
      if (input.kind === "LEAD") return { kind: "Lead" as const, id: lead.id, reference: lead.reference, href: `/admin/leads/${lead.id}` };

      const reference = generateReference("QTE");
      const quote = await tx.quote.create({
        data: {
          reference,
          department: DEPARTMENT,
          title: `${details.interest ?? category?.name ?? "Quotation request"} — ${details.company || name || "Customer"}`.slice(0, 180),
          status: "REQUESTED",
          quantity: details.quantity ?? null,
          requirements: details.requirements ?? null,
          budget: details.budget ?? null,
          preferredContact: details.preferredContact ?? null,
          city: details.city ?? null,
          productCategoryId: category?.id ?? null,
          source,
          leadId: lead.id,
          customerId,
          conversationId: id,
          ownerId: staff.id,
        },
        select: { id: true },
      });
      return { kind: "Quote" as const, id: quote.id, reference, href: `/admin/quotes/${quote.id}` };
    });

    await audit({
      action: `${result.kind.toLowerCase()}.created`,
      entity: result.kind,
      entityId: result.id,
      userId: staff.id,
      message: `${staff.name} created ${result.kind.toLowerCase()} ${result.reference} from conversation ${conversation.reference}.`,
      after: { reference: result.reference, conversationId: id },
      req,
    });
    return ok(result, 201);
  } catch (error) {
    console.error("[conversations] convert failed:", error);
    return fail("The record could not be created.", 500);
  }
}
