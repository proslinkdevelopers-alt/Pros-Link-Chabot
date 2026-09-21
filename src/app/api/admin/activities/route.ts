import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { hasPermission, requireApiStaff, type Staff } from "@/lib/staff";
import { audit } from "@/lib/notify";
import type { Permission } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CRM timeline entries — notes, follow-ups, reminders, calls and messages
 * against a lead, customer, ticket, quote or conversation.
 *
 * The right to annotate a record follows the right to manage it, and the
 * record must exist in this tenant. A technician may annotate only tickets
 * assigned to them.
 */

const ACTIVITY_ENTITIES = ["Lead", "Customer", "Ticket", "Quote", "Conversation"] as const;
type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

const MANAGE: Record<ActivityEntity, Permission> = {
  Lead: "leads.manage",
  Customer: "customers.manage",
  Ticket: "tickets.manage",
  Quote: "quotes.manage",
  Conversation: "conversations.manage",
};

const schema = z.object({
  entityType: z.enum(ACTIVITY_ENTITIES),
  entityId: z.string().min(1).max(64),
  type: z.enum(["NOTE", "FOLLOW_UP", "REMINDER", "CALL", "EMAIL", "WHATSAPP", "MEETING"]),
  body: z.string().trim().min(1, "Write something first.").max(4000),
  dueAt: z.string().max(40).optional(),
});

/** Whether `staff` may annotate this record, and that it exists in this tenant. */
async function mayAnnotate(staff: Staff, entityType: ActivityEntity, entityId: string): Promise<boolean> {
  const manage = hasPermission(staff, MANAGE[entityType]);
  switch (entityType) {
    case "Lead":
      return manage && Boolean(await prisma.lead.findFirst({ where: { id: entityId, department: DEPARTMENT }, select: { id: true } }));
    case "Customer":
      return manage && Boolean(await prisma.customer.findFirst({ where: { id: entityId, department: DEPARTMENT }, select: { id: true } }));
    case "Quote":
      return manage && Boolean(await prisma.quote.findFirst({ where: { id: entityId, department: DEPARTMENT }, select: { id: true } }));
    case "Conversation":
      return manage && Boolean(await prisma.conversation.findFirst({ where: { id: entityId, department: DEPARTMENT }, select: { id: true } }));
    case "Ticket": {
      const ticket = await prisma.ticket.findFirst({
        where: { id: entityId, department: DEPARTMENT },
        select: { assigneeId: true },
      });
      if (!ticket) return false;
      return manage || (hasPermission(staff, "tickets.update_assigned") && ticket.assigneeId === staff.id);
    }
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireApiStaff(req);
  if ("response" in guard) return guard.response;
  const { staff } = guard;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid activity." }, { status: 400 });
  }
  const data = parsed.data;

  const dueAt = data.dueAt ? new Date(data.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    return Response.json({ error: "Invalid due date." }, { status: 400 });
  }

  try {
    if (!(await mayAnnotate(staff, data.entityType, data.entityId))) {
      return Response.json({ error: "Your role does not allow this, or the record does not exist." }, { status: 403 });
    }
    const activity = await prisma.crmActivity.create({
      data: {
        department: DEPARTMENT,
        type: data.type,
        entityType: data.entityType,
        entityId: data.entityId,
        body: data.body,
        dueAt,
        ownerId: staff.id,
      },
      select: { id: true },
    });
    await audit({
      action: "activity.created",
      entity: data.entityType,
      entityId: data.entityId,
      userId: staff.id,
      message: `${staff.name} added a ${data.type.toLowerCase().replace("_", " ")} to ${data.entityType.toLowerCase()} ${data.entityId}.`,
      extra: { activityId: activity.id, type: data.type },
      req,
    });
    return Response.json({ ok: true, id: activity.id }, { status: 201 });
  } catch (error) {
    console.error("[activities] create failed:", error);
    return Response.json({ error: "Could not save the activity." }, { status: 500 });
  }
}

/** Mark a follow-up or reminder complete (or not). */
export async function PATCH(req: NextRequest) {
  const guard = await requireApiStaff(req);
  if ("response" in guard) return guard.response;
  const { staff } = guard;

  const parsed = z
    .object({ id: z.string().min(1).max(64), completed: z.boolean() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  try {
    const activity = await prisma.crmActivity.findFirst({
      where: { id: parsed.data.id, department: DEPARTMENT },
      select: { entityType: true, entityId: true, completedAt: true },
    });
    const entity = activity?.entityType as ActivityEntity | undefined;
    if (!activity || !entity || !ACTIVITY_ENTITIES.includes(entity)) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    if (!(await mayAnnotate(staff, entity, activity.entityId))) {
      return Response.json({ error: "Your role does not allow this." }, { status: 403 });
    }

    const completedAt = parsed.data.completed ? new Date() : null;
    await prisma.crmActivity.update({ where: { id: parsed.data.id }, data: { completedAt } });
    await audit({
      action: "activity.updated",
      entity,
      entityId: activity.entityId,
      userId: staff.id,
      before: { completed: Boolean(activity.completedAt) },
      after: { completed: parsed.data.completed },
      extra: { activityId: parsed.data.id },
      req,
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[activities] update failed:", error);
    return Response.json({ error: "Update failed." }, { status: 500 });
  }
}
