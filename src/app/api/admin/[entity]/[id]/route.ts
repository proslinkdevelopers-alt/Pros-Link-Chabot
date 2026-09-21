import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { hasPermission, requireApiStaff, type Staff } from "@/lib/staff";
import { can, type Permission } from "@/lib/permissions";
import { audit, notifyStaff } from "@/lib/notify";
import {
  CUSTOMER_STATUSES,
  LEAD_SOURCES,
  LEAD_STAGES,
  MEETING_STATUSES,
  PRIORITIES,
  QUOTE_STATUSES,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  labelFor,
} from "@/lib/admin/labels";
import { dateField, money, optionalEmail, optionalPhone, phoneField, recordId, text } from "@/lib/admin/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * =============================================================================
 *  Record updates from the console
 * =============================================================================
 *
 *  One PATCH endpoint for leads, customers, tickets, quotes and appointments —
 *  inline controls (stage, status, assignment) and full detail edits alike.
 *  Safety comes from explicit allow-lists, not the URL:
 *
 *   • only the entities below are reachable, each with its own Zod schema, so
 *     no arbitrary field can be written;
 *   • each needs its own permission, checked against the role in the database,
 *     before the record is even looked up;
 *   • a technician may update only tickets assigned to them, and only the
 *     status and resolution;
 *   • an assignee must be an active member of this tenant whose role can work
 *     that kind of record, and linked catalogue records must be this tenant's;
 *   • the record must belong to this tenant, even when addressed by id;
 *   • every change is audited with its previous and new values; stage, status
 *     and assignment changes go on the record's timeline, and the people
 *     involved are notified.
 * =============================================================================
 */

const PRIORITY = z.enum(PRIORITIES);

const leadSchema = z
  .object({
    stage: z.enum(LEAD_STAGES),
    priority: PRIORITY,
    estimatedValue: money.nullable(),
    lostReason: text(500),
    nextAction: text(300),
    ownerId: recordId.nullable(),
    name: z.string().trim().min(2).max(120),
    company: text(160),
    phone: phoneField,
    whatsapp: optionalPhone,
    email: optionalEmail,
    city: text(80),
    businessType: text(80),
    productCategoryId: recordId.nullable(),
    productId: recordId.nullable(),
    quantity: text(60),
    budget: text(80),
    timeline: text(80),
    preferredContact: text(40),
    requirements: z.string().trim().min(1).max(4000),
    source: z.enum(LEAD_SOURCES),
  })
  .partial()
  .strict();

const customerSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    company: text(160),
    phone: phoneField,
    whatsapp: optionalPhone,
    email: optionalEmail,
    address: text(300),
    city: text(80),
    industry: text(80),
    notes: text(4000),
    status: z.enum(CUSTOMER_STATUSES),
    source: z.enum(LEAD_SOURCES).nullable(),
    ownerId: recordId.nullable(),
  })
  .partial()
  .strict();

const TICKET_STATUS = z.enum(TICKET_STATUSES);

const ticketSchema = z
  .object({
    status: TICKET_STATUS,
    priority: PRIORITY,
    category: z.enum(TICKET_CATEGORIES),
    resolution: text(4000),
    assigneeId: recordId.nullable(),
    subject: z.string().trim().min(3).max(160),
    description: z.string().trim().min(1).max(4000),
    contactName: text(120),
    contactPhone: optionalPhone,
    contactEmail: optionalEmail,
    company: text(160),
    city: text(80),
    address: text(300),
    machineType: text(80),
    machineBrand: text(60),
    machineModel: text(80),
    serialNumber: text(60),
    productId: recordId.nullable(),
    preferredDate: dateField,
    preferredTime: text(60),
  })
  .partial()
  .strict();

/** What a technician may change on a ticket assigned to them. */
const technicianTicketSchema = z
  .object({ status: TICKET_STATUS.exclude(["OPEN", "ASSIGNED"]), resolution: text(4000) })
  .partial()
  .strict();

const quoteItem = z.object({
  description: z.string().trim().min(1, "Describe the item.").max(300),
  quantity: z.coerce.number().positive().max(100_000),
  unitPrice: money,
});

const quoteSchema = z
  .object({
    status: z.enum(QUOTE_STATUSES),
    ownerId: recordId.nullable(),
    title: z.string().trim().min(2).max(180),
    notes: text(4000),
    items: z.array(quoteItem).max(50),
    discount: money,
    tax: money,
    total: money,
    currency: z.enum(["PKR", "USD"]),
    validUntil: dateField,
    quantity: text(60),
    requirements: text(4000),
    budget: text(80),
    preferredContact: text(40),
    city: text(80),
    productCategoryId: recordId.nullable(),
    productId: recordId.nullable(),
  })
  .partial()
  .strict();

const meetingSchema = z
  .object({
    status: z.enum(MEETING_STATUSES),
    meetingLink: z.union([z.string().trim().url().max(500), z.literal("")]),
    notes: z.string().max(2000),
    hostId: recordId.nullable(),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((value) => new Date(`${value}T00:00:00Z`)),
    preferredTime: z.string().trim().min(1).max(60),
    mode: z.enum(["SITE_VISIT", "PHONE_CALL", "WHATSAPP", "OFFICE", "ZOOM", "GOOGLE_MEET"]),
  })
  .partial()
  .strict();

type Row = Record<string, unknown>;

interface Handler {
  permission: Permission;
  schema: z.ZodTypeAny;
  entity: "Lead" | "Customer" | "Ticket" | "Quote" | "Meeting";
  load: (id: string) => Promise<Row | null>;
  update: (id: string, data: Row, before: Row) => Promise<unknown>;
  link: (id: string) => string;
  label: (row: Row) => string;
  /** Field holding the person responsible, and the permissions any of which they need. */
  assignee?: { field: string; needs: Permission[] };
  /** The field whose changes go on the timeline as stage or status changes. */
  statusField?: string;
}

/** The catalogue records a lead, quote or ticket points at, when they are this tenant's. */
async function catalogueNames(data: Row): Promise<{ problem?: string; category?: string | null; product?: string | null }> {
  const categoryId = data.productCategoryId as string | null | undefined;
  const productId = data.productId as string | null | undefined;
  const [category, product] = await Promise.all([
    categoryId ? prisma.productCategory.findFirst({ where: { id: categoryId, department: DEPARTMENT }, select: { name: true } }) : null,
    productId ? prisma.product.findFirst({ where: { id: productId, department: DEPARTMENT }, select: { name: true } }) : null,
  ]);
  if (categoryId && !category) return { problem: "Choose a category from the list." };
  if (productId && !product) return { problem: "Choose a product from the list." };
  return { category: category?.name ?? null, product: product?.name ?? null };
}

const HANDLERS: Record<string, Handler> = {
  leads: {
    permission: "leads.manage",
    schema: leadSchema,
    entity: "Lead",
    statusField: "stage",
    load: (id) =>
      prisma.lead.findFirst({
        where: { id, department: DEPARTMENT },
        select: {
          reference: true, name: true, stage: true, priority: true, estimatedValue: true, lostReason: true, nextAction: true, ownerId: true,
          customerId: true, company: true, phone: true, whatsapp: true, email: true, city: true, businessType: true, productCategoryId: true,
          productId: true, quantity: true, budget: true, timeline: true, preferredContact: true, requirements: true, source: true, subService: true,
        },
      }),
    update: async (id, data, before) => {
      const patch: Prisma.LeadUncheckedUpdateInput = { ...(data as Prisma.LeadUncheckedUpdateInput) };
      if ("productCategoryId" in data || "productId" in data) {
        const names = await catalogueNames(data);
        const product = "productId" in data ? names.product : null;
        const category = "productCategoryId" in data ? names.category : null;
        if (product || category) patch.subService = product ?? category;
      }
      await prisma.lead.update({ where: { id }, data: patch });
      // A won lead makes its customer an active customer.
      if (data.stage === "WON" && before.customerId) {
        await prisma.customer.updateMany({
          where: { id: before.customerId as string, department: DEPARTMENT },
          data: { status: "ACTIVE", lastInteractionAt: new Date() },
        });
      }
    },
    link: (id) => `/admin/leads/${id}`,
    label: (row) => `lead ${row.reference} (${row.name})`,
    assignee: { field: "ownerId", needs: ["leads.manage"] },
  },
  customers: {
    permission: "customers.manage",
    schema: customerSchema,
    entity: "Customer",
    statusField: "status",
    load: (id) =>
      prisma.customer.findFirst({
        where: { id, department: DEPARTMENT },
        select: {
          reference: true, name: true, company: true, phone: true, whatsapp: true, email: true, address: true, city: true, industry: true,
          notes: true, status: true, source: true, ownerId: true,
        },
      }),
    update: (id, data) => prisma.customer.update({ where: { id }, data: data as Prisma.CustomerUncheckedUpdateInput }),
    link: (id) => `/admin/customers/${id}`,
    label: (row) => `customer ${row.name}`,
    assignee: { field: "ownerId", needs: ["customers.manage"] },
  },
  tickets: {
    permission: "tickets.manage",
    schema: ticketSchema,
    entity: "Ticket",
    statusField: "status",
    load: (id) =>
      prisma.ticket.findFirst({
        where: { id, department: DEPARTMENT },
        select: {
          reference: true, subject: true, status: true, priority: true, category: true, resolution: true, assigneeId: true, description: true,
          contactName: true, contactPhone: true, contactEmail: true, company: true, city: true, address: true, machineType: true,
          machineBrand: true, machineModel: true, serialNumber: true, productId: true, preferredDate: true, preferredTime: true, customerId: true,
        },
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
    link: (id) => `/admin/tickets/${id}`,
    label: (row) => `ticket ${row.reference}`,
    assignee: { field: "assigneeId", needs: ["tickets.manage", "tickets.update_assigned"] },
  },
  quotes: {
    permission: "quotes.manage",
    schema: quoteSchema,
    entity: "Quote",
    statusField: "status",
    load: (id) =>
      prisma.quote.findFirst({
        where: { id, department: DEPARTMENT },
        select: {
          reference: true, title: true, status: true, ownerId: true, notes: true, items: true, subtotal: true, discount: true, tax: true, total: true,
          currency: true, validUntil: true, quantity: true, requirements: true, budget: true, preferredContact: true, city: true,
          productCategoryId: true, productId: true, leadId: true, customerId: true,
        },
      }),
    update: async (id, data, before) => {
      const now = new Date();
      const patch: Prisma.QuoteUncheckedUpdateInput = { ...(data as Prisma.QuoteUncheckedUpdateInput) };
      // Totals follow the line items: the team enters the prices, the server does the arithmetic.
      if (Array.isArray(data.items)) {
        const items = data.items as Array<{ quantity: number; unitPrice: number }>;
        const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
        const discount = Number(data.discount ?? before.discount ?? 0);
        const tax = Number(data.tax ?? before.tax ?? 0);
        patch.items = data.items as Prisma.InputJsonValue;
        patch.subtotal = subtotal;
        patch.total = Math.max(0, subtotal - discount + tax);
      }
      if (data.status === "SENT" && before.status !== "SENT") patch.sentAt = now;
      if ((data.status === "ACCEPTED" || data.status === "REJECTED") && before.status !== data.status) patch.decidedAt = now;
      await prisma.quote.update({ where: { id }, data: patch });
      // Sending the quotation moves its lead along the pipeline; an accepted one wins it.
      if (data.status === "SENT" && before.leadId) {
        await prisma.lead.updateMany({
          where: { id: before.leadId as string, department: DEPARTMENT, stage: { in: ["NEW", "CONTACTED", "QUALIFIED", "QUOTE_REQUESTED"] } },
          data: { stage: "QUOTED" },
        });
      }
      if (data.status === "ACCEPTED" && before.customerId) {
        await prisma.customer.updateMany({ where: { id: before.customerId as string, department: DEPARTMENT }, data: { status: "ACTIVE", lastInteractionAt: now } });
      }
    },
    link: (id) => `/admin/quotes/${id}`,
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
        select: { reference: true, status: true, meetingLink: true, notes: true, hostId: true, preferredDate: true, preferredTime: true, mode: true },
      }),
    update: (id, data, before) =>
      prisma.meeting.update({
        where: { id },
        data: {
          ...(data as Prisma.MeetingUncheckedUpdateInput),
          ...(data.status === "CONFIRMED" && before.status !== "CONFIRMED" ? { confirmedAt: new Date() } : {}),
        },
      }),
    link: () => `/admin/appointments`,
    label: (row) => `appointment ${row.reference}`,
    assignee: { field: "hostId", needs: ["appointments.manage"] },
  },
};

/** Whether the proposed assignee may hold this kind of record. */
async function validAssignee(userId: string, needs: Permission[]): Promise<boolean> {
  const user = await prisma.user.findFirst({ where: { id: userId, department: DEPARTMENT, isActive: true }, select: { role: true } });
  return Boolean(user && needs.some((permission) => can(user.role, permission)));
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

    let schema = handler.schema;
    if (!hasPermission(staff, handler.permission)) {
      const ownTicket = entity === "tickets" && before.assigneeId === staff.id;
      if (!ownTicket) return Response.json({ error: "Your role does not allow this." }, { status: 403 });
      schema = technicianTicketSchema;
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const fields: Record<string, string> = {};
      for (const entry of parsed.error.issues) fields[entry.path.join(".") || "_"] ??= entry.message;
      return Response.json({ error: `${issue?.path.length ? `${issue.path.join(".")}: ` : ""}${issue?.message ?? "Invalid update."}`, fields }, { status: 400 });
    }
    const data = parsed.data as Row;
    if (!Object.keys(data).length) return Response.json({ error: "Nothing to update." }, { status: 400 });

    if ("productCategoryId" in data || "productId" in data) {
      const { problem } = await catalogueNames(data);
      if (problem) return Response.json({ error: problem }, { status: 400 });
    }

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
    const statusField = handler.statusField;
    const statusChanged = statusField && statusField in data && data[statusField] !== before[statusField];
    if (statusChanged) {
      await prisma.crmActivity.create({
        data: {
          department: DEPARTMENT,
          type: handler.entity === "Lead" ? "STAGE_CHANGE" : "STATUS_CHANGE",
          entityType: handler.entity,
          entityId: recordId,
          body: `${labelFor(String(before[statusField!]))} → ${labelFor(String(data[statusField!]))}${data.lostReason ? ` — ${data.lostReason}` : ""}`,
          ownerId: staff.id,
        },
      });
    }
    const assigneeChanged = assigneeField && newAssignee !== undefined && newAssignee !== before[assigneeField];
    if (assigneeChanged && handler.entity !== "Meeting") {
      const person = newAssignee ? await prisma.user.findUnique({ where: { id: newAssignee }, select: { name: true } }) : null;
      await prisma.crmActivity.create({
        data: {
          department: DEPARTMENT,
          type: "ASSIGNMENT",
          entityType: handler.entity,
          entityId: recordId,
          body: person ? `Assigned to ${person.name}` : "Unassigned",
          ownerId: staff.id,
        },
      });
    }

    // Notifications: the new assignee, and whoever holds the record when its status changes.
    if (assigneeChanged && newAssignee) {
      await notifyStaff({ userIds: [newAssignee], exceptUserId: staff.id, subject: `${staff.name} assigned you ${label}`, link: handler.link(recordId) });
    }
    if (statusChanged) {
      const holder = assigneeField ? ((newAssignee ?? before[assigneeField]) as string | null) : null;
      await notifyStaff({
        userIds: [holder],
        exceptUserId: staff.id,
        subject: `${label[0].toUpperCase()}${label.slice(1)} is now ${labelFor(String(data[statusField!]))}`,
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
