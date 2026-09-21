import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canAccessAdmin } from "@/lib/auth";
import { DEPARTMENT } from "@/config/brand";
import { isOwn } from "@/lib/admin/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CRM timeline entries — notes, follow-ups, reminders, calls and messages
 * against a lead, customer, ticket or project.
 *
 * Follow-ups and reminders carry a `dueAt` and appear on the Follow-ups board
 * until they're marked complete.
 */
const schema = z.object({
  entityType: z.enum(["MarketingLead", "Customer", "Ticket", "Project"]),
  entityId: z.string().min(1).max(64),
  type: z.enum([
    "NOTE", "FOLLOW_UP", "REMINDER", "CALL", "EMAIL", "WHATSAPP", "MEETING",
  ]),
  body: z.string().min(1).max(4000),
  dueAt: z.string().datetime({ offset: true }).or(z.string().min(10)).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!canAccessAdmin(session)) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid activity." }, { status: 400 });
  }
  const data = parsed.data;

  const dueAt = data.dueAt ? new Date(data.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    return Response.json({ error: "Invalid due date." }, { status: 400 });
  }

  try {
    const activity = await prisma.crmActivity.create({
      data: {
        department: DEPARTMENT,
        type: data.type,
        entityType: data.entityType,
        entityId: data.entityId,
        body: data.body,
        dueAt,
        ownerId: session!.sub,
      },
      select: { id: true },
    });
    return Response.json({ ok: true, id: activity.id }, { status: 201 });
  } catch (error) {
    console.error("[activities] create failed:", error);
    return Response.json({ error: "Could not save the activity." }, { status: 500 });
  }
}

/** Mark a follow-up or reminder complete. */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!canAccessAdmin(session)) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  const parsed = z
    .object({ id: z.string().cuid(), completed: z.boolean() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const activity = await prisma.crmActivity.findUnique({
      where: { id: parsed.data.id },
      select: { department: true },
    });
    if (!activity || !isOwn(activity.department)) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }

    await prisma.crmActivity.update({
      where: { id: parsed.data.id },
      data: { completedAt: parsed.data.completed ? new Date() : null },
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[activities] update failed:", error);
    return Response.json({ error: "Update failed." }, { status: 500 });
  }
}
