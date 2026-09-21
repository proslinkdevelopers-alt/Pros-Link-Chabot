import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { hasPermission, requireApiStaff, type Staff } from "@/lib/staff";
import { can, type Permission } from "@/lib/permissions";
import { audit, notifyStaff } from "@/lib/notify";
import { invalidateKnowledge } from "@/lib/ai/knowledge";
import { humanise } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * =============================================================================
 *  Record updates from the console
 * =============================================================================
 *
 *  One PATCH endpoint for the console's inline controls — stage, status,
 *  priority, assignment. Safety comes from explicit allow-lists, not the URL:
 *
 *   • only the entities below are reachable, each with its own Zod schema, so
 *     no arbitrary field can be written;
 *   • each needs its own permission, checked against the role in the database;
 *   • a technician may update only tickets assigned to them, and only the
 *     status and resolution;
 *   • an assignee must be an active member of this tenant whose role can work
 *     that kind of record;
 *   • the record must belong to this tenant, even when addressed by id;
 *   • every change is audited with its previous and new values, and the new
 *     assignee is notified.
 * =============================================================================
 */

const PRIORITY = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
const id = z.string().min(1).max(64);

const leadSchema = z
  .object({
    stage: z.enum([
      "NEW", "CONTACTED", "QUALIFIED", "QUOTE_REQUESTED", "QUOTED", "NEGOTIATION", "WON", "LOST", "SPAM", "OPTED_OUT",
    ]),
    priority: PRIORITY,
    estimatedValue: z.number().nonnegative().max(9_999_999_999).nullable(),
    lostReason: z.string().trim().max(500).nullable(),
    nextAction: z.string().trim().max(300).nullable(),
    ownerId: id.nullable(),
  })
  .partial()
  .strict();

const TICKET_STATUS = z.enum([
  "OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "TECHNICIAN_DISPATCHED", "RESOLVED", "CLOSED",
]);

const ticketSchema = z
  .object({
    status: TICKET_STATUS,
    priority: PRIORITY,
    resolution: z.string().trim().max(4000).nullable(),
    assigneeId: id.nullable(),
  })
  .partial()
  .strict();

/** What a technician may change on a ticket assigned to them. */
const technicianTicketSchema = z
  .object({ status: TICKET_STATUS.exclude(["OPEN", "ASSIGNED"]), resolution: z.string().trim().max(4000).nullable() })
  .partial()
  .strict();

const quoteSchema = z
  .object({
    status: z.enum(["REQUESTED", "DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]),
    ownerId: id.nullable(),
    notes: z.string().trim().max(4000).nullable(),
    total: z.number().nonnegative().max(9_999_999_999),
  })
  .partial()
  .strict();

const meetingSchema = z
  .object({
    status: z.enum(["REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
    meetingLink: z.string().url().max(500).or(z.literal("")),
    notes: z.string().max(2000),
  })
  .partial()
  .strict();

const knowledgeSchema = z.object({ state: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }).partial().strict();

type Row = Record<string, unknown>;

interface Handler {
  permission: Permission;
  schema: z.ZodTypeAny;
  entity: string;
  /** The record in this tenant, with the fields an update can change. */
  load: (id: string) => Promise<Row | null>;
  update: (id: string, data: Row, before: Row) => Promise<unknown>;
  /** Console link for notifications. */
  link: (id: string) => string;
  label: (row: Row) => string;
  /** Field holding the person responsible, and the permission they need. */
  assignee?: { field: string; needs: Permission[] };
}

const HANDLERS: Record<string, Handler> = {
  leads: {
    permission: "leads.manage",
    schema: leadSchema,
    entity: "Lead",
    load: (id) =>
      prisma.lead.findFirst({
        where: { id, department: DEPARTMENT },
        select: { reference: true, name: true, stage: true, priority: true, estimatedValue: true, lostReason: true, nextAction: true, ownerId: true, customerId: true },
      }),
    update: async (id, data, before) => {
      await prisma.lead.update({ where: { id }, data: data as Prisma.LeadUncheckedUpdateInput });
      // A won lead makes its customer an active customer.
      if (data.stage === "WON" && before.customerId) {
        await prisma.customer.updateMany({
          where: { id: before.customerId as string, department: DEPARTMENT },
          data: { status: "ACTIVE", lastInteractionAt: new Date() },
        });
      }
    },
    link: (id) => `/admin/crm/leads/${id}`,
    label: (row) => `lead ${row.reference} (${row.name})`,
    assignee: { field: "ownerId", needs: ["leads.manage"] },
  },
  tickets: {
    permission: "tickets.manage",
    schema: ticketSchema,
    entity: "Ticket",
    load: (id) =>
      prisma.ticket.findFirst({
        where: { id, department: DEPARTMENT },
        select: { reference: true, subject: true, status: true, priority: true, resolution: true, assigneeId: true },
      }),
    update: (id, data, before) => {
      const now = new Date();
      const patch: Prisma.TicketUncheckedUpdateInput = { ...(data as Prisma.TicketUncheckedUpdateInput) };
      // Assigning an untouched ticket moves it to Assigned.
      if (data.assigneeId && before.status === "OPEN" && !data.status) patch.status = "ASSIGNED";
      const status = (patch.status ?? before.status) as string;
      if (status === "TECHNICIAN_DISPATCHED" && before.status !== "TECHNICIAN_DISPATCHED") patch.dispatchedAt = now;
      if (status === "RESOLVED" && before.status !== "RESOLVED") patch.resolvedAt = now;
      if (status === "CLOSED" && before.status !== "CLOSED") patch.closedAt = now;
      return prisma.ticket.update({ where: { id }, data: patch });
    },
    link: (id) => `/admin/service/tickets/${id}`,
    label: (row) => `ticket ${row.reference}`,
    assignee: { field: "assigneeId", needs: ["tickets.manage", "tickets.update_assigned"] },
  },
  quotes: {
    permission: "quotes.manage",
    schema: quoteSchema,
    entity: "Quote",
    load: (id) =>
      prisma.quote.findFirst({
        where: { id, department: DEPARTMENT },
        select: { reference: true, title: true, status: true, ownerId: true, notes: true, total: true, leadId: true },
      }),
    update: async (id, data, before) => {
      const now = new Date();
      const patch: Prisma.QuoteUncheckedUpdateInput = { ...(data as Prisma.QuoteUncheckedUpdateInput) };
      if (data.status === "SENT" && before.status !== "SENT") patch.sentAt = now;
      if ((data.status === "ACCEPTED" || data.status === "REJECTED") && before.status !== data.status) patch.decidedAt = now;
      await prisma.quote.update({ where: { id }, data: patch });
      // Sending the quotation moves its lead along the pipeline.
      if (data.status === "SENT" && before.leadId) {
        await prisma.lead.updateMany({
          where: { id: before.leadId as string, department: DEPARTMENT, stage: { in: ["NEW", "CONTACTED", "QUALIFIED", "QUOTE_REQUESTED"] } },
          data: { stage: "QUOTED" },
        });
      }
    },
    link: () => `/admin/quotes`,
    label: (row) => `quote request ${row.reference}`,
    assignee: { field: "ownerId", needs: ["quotes.manage"] },
  },
  meetings: {
    permission: "appointments.manage",
    schema: meetingSchema,
    entity: "Meeting",
    load: (id) =>
      prisma.meeting.findFirst({
        where: { id, department: DEPARTMENT },
        select: { reference: true, status: true, meetingLink: true, notes: true },
      }),
    update: (id, data) =>
      prisma.meeting.update({
        where: { id },
        data: { ...(data as Prisma.MeetingUpdateInput), ...(data.status === "CONFIRMED" ? { confirmedAt: new Date() } : {}) },
      }),
    link: () => `/admin/appointments`,
    label: (row) => `appointment ${row.reference}`,
  },
  knowledge: {
    permission: "knowledge.manage",
    schema: knowledgeSchema,
    entity: "KnowledgeArticle",
    load: (id) =>
      prisma.knowledgeArticle.findFirst({
        where: { id, department: DEPARTMENT },
        select: { slug: true, question: true, state: true },
      }),
    update: async (id, data) => {
      await prisma.knowledgeArticle.update({ where: { id }, data: { ...(data as Prisma.KnowledgeArticleUpdateInput), indexedAt: new Date() } });
      invalidateKnowledge();
    },
    link: () => `/admin/knowledge`,
    label: (row) => `knowledge entry "${row.question}"`,
  },
};

/** Whether the proposed assignee may hold this kind of record. */
async function validAssignee(userId: string, needs: Permission[]): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: userId, department: DEPARTMENT, isActive: true },
    select: { role: true },
  });
  return Boolean(user && can(user.role, needs));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const guard = await requireApiStaff(req);
  if ("response" in guard) return guard.response;
  const staff: Staff = guard.staff;

  const { entity, id: recordId } = await params;
  const handler = HANDLERS[entity];
  if (!handler) return Response.json({ error: "Unknown resource." }, { status: 404 });

  // Refuse before touching the record, so a role without access learns nothing
  // about which ids exist. Only a technician's own-ticket case needs the record.
  const technicianCase = entity === "tickets" && hasPermission(staff, "tickets.update_assigned");
  if (!hasPermission(staff, handler.permission) && !technicianCase) {
    return Response.json({ error: "Your role does not allow this." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  try {
    const before = await handler.load(recordId);
    if (!before) return Response.json({ error: "Record not found." }, { status: 404 });

    // Full permission, or a technician working their own ticket.
    let schema = handler.schema;
    if (!hasPermission(staff, handler.permission)) {
      const ownTicket =
        entity === "tickets" && hasPermission(staff, "tickets.update_assigned") && before.assigneeId === staff.id;
      if (!ownTicket) return Response.json({ error: "Your role does not allow this." }, { status: 403 });
      schema = technicianTicketSchema;
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid update." }, { status: 400 });
    }
    const data = parsed.data as Row;
    if (!Object.keys(data).length) return Response.json({ error: "Nothing to update." }, { status: 400 });

    const assigneeField = handler.assignee?.field;
    const newAssignee = assigneeField ? (data[assigneeField] as string | null | undefined) : undefined;
    if (assigneeField && newAssignee && !(await validAssignee(newAssignee, handler.assignee!.needs))) {
      return Response.json({ error: "That person cannot be assigned this record." }, { status: 400 });
    }

    await handler.update(recordId, data, before);

    const label = handler.label(before);
    await audit({
      action: `${handler.entity.toLowerCase()}.updated`,
      entity: handler.entity,
      entityId: recordId,
      userId: staff.id,
      message: `${staff.name} updated ${label}.`,
      before,
      after: data,
      req,
    });

    // Timeline entries for the changes people look for later.
    const statusField = "stage" in data ? "stage" : "status" in data ? "status" : null;
    const timelineEntity = { Lead: "Lead", Ticket: "Ticket", Quote: "Quote" }[handler.entity];
    if (timelineEntity && statusField && data[statusField] !== before[statusField]) {
      await prisma.crmActivity.create({
        data: {
          department: DEPARTMENT,
          type: handler.entity === "Lead" ? "STAGE_CHANGE" : "STATUS_CHANGE",
          entityType: timelineEntity,
          entityId: recordId,
          body: `${humanise(String(before[statusField]))} → ${humanise(String(data[statusField]))}`,
          ownerId: staff.id,
        },
      });
    }
    if (timelineEntity && assigneeField && newAssignee !== undefined && newAssignee !== before[assigneeField]) {
      const person = newAssignee
        ? await prisma.user.findUnique({ where: { id: newAssignee }, select: { name: true } })
        : null;
      await prisma.crmActivity.create({
        data: {
          department: DEPARTMENT,
          type: "ASSIGNMENT",
          entityType: timelineEntity,
          entityId: recordId,
          body: person ? `Assigned to ${person.name}` : "Unassigned",
          ownerId: staff.id,
        },
      });
    }

    // Notifications: the new assignee, and whoever holds the record when its status changes.
    if (newAssignee && newAssignee !== before[assigneeField!]) {
      await notifyStaff({
        userIds: [newAssignee],
        exceptUserId: staff.id,
        subject: `${staff.name} assigned you ${label}`,
        link: handler.link(recordId),
      });
    }
    if (statusField && data[statusField] !== before[statusField]) {
      const holder = assigneeField ? ((newAssignee ?? before[assigneeField]) as string | null) : null;
      await notifyStaff({
        userIds: [holder],
        exceptUserId: staff.id,
        subject: `${label[0].toUpperCase()}${label.slice(1)} is now ${humanise(String(data[statusField]))}`,
        body: `Changed by ${staff.name}.`,
        link: handler.link(recordId),
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error(`[admin:${entity}] update failed:`, error);
    return Response.json({ error: "Update failed." }, { status: 500 });
  }
}
