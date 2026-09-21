import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiStaff } from "@/lib/staff";
import { fail, notFound, ok, readBody } from "@/lib/admin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ completed: z.boolean() });

/** Tick off (or reopen) a follow-up or reminder. Only the person it belongs to can. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiStaff(req);
  if ("response" in guard) return guard.response;
  const body = await readBody(req, schema);
  if ("response" in body) return body.response;
  const { id } = await params;

  const activity = await prisma.crmActivity.findFirst({ where: { id, department: DEPARTMENT }, select: { ownerId: true, type: true } });
  if (!activity) return notFound();
  if (activity.ownerId !== guard.staff.id) return fail("Only the person this follow-up belongs to can tick it off.", 403);
  if (activity.type !== "FOLLOW_UP" && activity.type !== "REMINDER") return fail("Only follow-ups and reminders can be completed.", 400);

  await prisma.crmActivity.update({ where: { id }, data: { completedAt: body.data.completed ? new Date() : null } });
  return ok();
}
