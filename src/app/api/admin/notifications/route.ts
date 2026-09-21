import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiPermission } from "@/lib/staff";
import { ok, readBody } from "@/lib/admin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(200) }), z.object({ all: z.literal(true) })]);

/** Mark the signed-in person's own notifications as read. */
export async function PATCH(req: NextRequest) {
  const guard = await requireApiPermission("notifications.view", req);
  if ("response" in guard) return guard.response;
  const body = await readBody(req, schema);
  if ("response" in body) return body.response;

  const where = {
    userId: guard.staff.id,
    channel: "IN_APP" as const,
    status: { not: "READ" as const },
    ...("ids" in body.data ? { id: { in: body.data.ids } } : {}),
  };
  const result = await prisma.notification.updateMany({ where, data: { status: "READ" } });
  return ok({ updated: result.count });
}
