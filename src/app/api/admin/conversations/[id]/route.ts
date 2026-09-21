import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { hasPermission, requireApiStaff } from "@/lib/staff";
import { can } from "@/lib/permissions";
import { audit, notifyStaff } from "@/lib/notify";
import { fail, notFound, ok, readBody } from "@/lib/admin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    /** Assistant on or off for this thread. */
    botPaused: z.boolean(),
    /** Close the handover once the team has dealt with it. */
    handedOff: z.boolean(),
    status: z.enum(["OPEN", "CLOSED"]),
    assigneeId: z.string().trim().min(1).max(64).nullable(),
    tags: z.array(z.string().trim().min(1).max(30)).max(12),
    read: z.literal(true),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");

/**
 * Work a conversation from the inbox. Replying staff may pause the assistant
 * and mark the thread read; assigning, tagging, closing and reopening need
 * conversations.manage.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiStaff(req);
  if ("response" in guard) return guard.response;
  const { staff } = guard;
  const body = await readBody(req, schema);
  if ("response" in body) return body.response;
  const input = body.data;

  const needsManage = input.status !== undefined || input.assigneeId !== undefined || input.tags !== undefined;
  if (needsManage ? !hasPermission(staff, "conversations.manage") : !hasPermission(staff, "conversations.reply")) {
    return fail("Your role does not allow this.", 403);
  }

  const { id } = await params;
  const before = await prisma.conversation.findFirst({
    where: { id, department: DEPARTMENT },
    select: { reference: true, contactName: true, contactPhone: true, botPaused: true, handedOff: true, status: true, assigneeId: true, tags: true, readAt: true },
  });
  if (!before) return notFound();

  if (input.assigneeId) {
    const person = await prisma.user.findFirst({ where: { id: input.assigneeId, department: DEPARTMENT, isActive: true }, select: { role: true } });
    if (!person || !can(person.role, "conversations.reply")) return fail("That person cannot handle conversations.", 400);
  }

  const now = new Date();
  const data = {
    ...(input.botPaused !== undefined ? { botPaused: input.botPaused } : {}),
    ...(input.handedOff !== undefined ? { handedOff: input.handedOff, ...(input.handedOff ? {} : { handoverTeam: null }) } : {}),
    ...(input.status ? { status: input.status, closedAt: input.status === "CLOSED" ? now : null } : {}),
    ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
    ...(input.tags ? { tags: [...new Set(input.tags.map((tag) => tag.toLowerCase()))] } : {}),
    ...(input.read ? { readAt: now } : {}),
  };
  await prisma.conversation.update({ where: { id }, data });

  // Reading a thread is not worth an audit entry; everything else is.
  const changed = { ...data } as Record<string, unknown>;
  delete changed.readAt;
  if (Object.keys(changed).length) {
    const who = before.contactName || before.contactPhone || before.reference;
    await audit({
      action: "conversation.updated",
      entity: "Conversation",
      entityId: id,
      userId: staff.id,
      message: `${staff.name} updated the conversation with ${who}.`,
      before,
      after: changed,
      req,
    });
    if (input.assigneeId && input.assigneeId !== before.assigneeId) {
      await notifyStaff({ userIds: [input.assigneeId], exceptUserId: staff.id, subject: `${staff.name} assigned you the conversation with ${who}`, link: `/admin/conversations/${id}` });
    }
  }
  return ok();
}
