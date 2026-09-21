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
import { LEAD_SOURCES, PRIORITIES, TICKET_CATEGORIES, TICKET_CATEGORY_LABEL } from "@/lib/admin/labels";
import { dateField, optionalEmail, phoneField, recordId, text } from "@/lib/admin/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(PRIORITIES).default("NORMAL"),
  subject: text(160).optional(),
  description: z.string().trim().min(3, "Describe the request.").max(4000),
  contactName: z.string().trim().min(2, "Enter the contact's name.").max(120),
  contactPhone: phoneField,
  contactEmail: optionalEmail.optional(),
  company: text(160).optional(),
  city: text(80).optional(),
  address: text(300).optional(),
  machineType: text(80).optional(),
  machineBrand: text(60).optional(),
  machineModel: text(80).optional(),
  serialNumber: text(60).optional(),
  preferredDate: dateField.optional(),
  preferredTime: text(60).optional(),
  assigneeId: recordId.nullable().optional(),
  source: z.enum(LEAD_SOURCES).default("PHONE"),
  customerId: recordId.nullable().optional(),
});

/** A ticket raised by staff on a customer's behalf — a phone call, an email, a visit. */
export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("tickets.manage", req);
  if ("response" in guard) return guard.response;
  const body = await readBody(req, schema);
  if ("response" in body) return body.response;
  const input = body.data;

  const [assignee, knownCustomer] = await Promise.all([
    input.assigneeId ? prisma.user.findFirst({ where: { id: input.assigneeId, department: DEPARTMENT, isActive: true }, select: { id: true, role: true } }) : null,
    input.customerId ? prisma.customer.findFirst({ where: { id: input.customerId, department: DEPARTMENT }, select: { id: true } }) : null,
  ]);
  if (input.assigneeId && !(assignee && (can(assignee.role, "tickets.manage") || can(assignee.role, "tickets.update_assigned")))) {
    return fail("That person cannot be assigned tickets.", 400, { assigneeId: "Cannot take tickets." });
  }
  if (input.customerId && !knownCustomer) return fail("Customer not found.", 400, { customerId: "Not found." });

  const machine = [input.machineType, [input.machineBrand, input.machineModel].filter(Boolean).join(" ")].filter(Boolean).join(" — ");
  const subject = input.subject || `${TICKET_CATEGORY_LABEL[input.category]}${machine ? ` — ${machine}` : ""}`;

  try {
    const reference = generateReference("TKT");
    const ticket = await prisma.$transaction(async (tx) => {
      const customerId =
        knownCustomer?.id ??
        (await linkCustomer(tx, {
          name: input.contactName,
          phone: input.contactPhone,
          email: input.contactEmail,
          company: input.company,
          city: input.city,
          address: input.address,
          source: input.source,
        }));
      return tx.ticket.create({
        data: {
          reference,
          department: DEPARTMENT,
          category: input.category,
          priority: input.priority,
          status: assignee ? "ASSIGNED" : "OPEN",
          subject: subject.slice(0, 160),
          description: input.description,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail ?? null,
          company: input.company ?? null,
          city: input.city ?? null,
          address: input.address ?? null,
          machineType: input.machineType ?? null,
          machineBrand: input.machineBrand ?? null,
          machineModel: input.machineModel ?? null,
          serialNumber: input.serialNumber ?? null,
          preferredDate: input.preferredDate ?? null,
          preferredTime: input.preferredTime ?? null,
          source: input.source,
          reporterId: guard.staff.id,
          assigneeId: assignee?.id ?? null,
          customerId,
        },
        select: { id: true },
      });
    });

    await audit({
      action: "ticket.created",
      entity: "Ticket",
      entityId: ticket.id,
      userId: guard.staff.id,
      message: `${guard.staff.name} raised ticket ${reference}.`,
      after: { reference, category: input.category, priority: input.priority, assigneeId: assignee?.id ?? null },
      req,
    });
    if (assignee && assignee.id !== guard.staff.id) {
      await notifyStaff({ userIds: [assignee.id], subject: `${guard.staff.name} assigned you ticket ${reference}`, body: subject, link: `/admin/tickets/${ticket.id}` });
    }
    return ok({ id: ticket.id, reference }, 201);
  } catch (error) {
    console.error("[tickets] create failed:", error);
    return fail("The ticket could not be saved.", 500);
  }
}
