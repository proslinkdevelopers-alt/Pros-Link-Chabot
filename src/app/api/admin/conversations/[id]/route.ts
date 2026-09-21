import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiPermission } from "@/lib/staff";
import { isOwn } from "@/lib/admin/queries";
import { logEvent } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ botPaused: z.boolean().optional(), handedOff: z.boolean().optional() })
  .refine((body) => body.botPaused !== undefined || body.handedOff !== undefined, "Nothing to update.");

/** Pause or resume the assistant on a conversation, and open or close its handover. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiPermission("conversations.reply", req);
  if ("response" in guard) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid update." }, { status: 400 });

  const { id } = await params;
  const conversation = await prisma.conversation.findUnique({ where: { id }, select: { department: true, capture: true } });
  if (!conversation || !isOwn(conversation.department)) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const data: { botPaused?: boolean; handedOff?: boolean; handoverTeam?: null } = { ...parsed.data };
  if (parsed.data.handedOff === false) data.handoverTeam = null;

  await prisma.conversation.update({ where: { id }, data });

  await logEvent({
    action: "conversation.updated",
    entity: "Conversation",
    entityId: id,
    message: `${guard.staff.name} ${parsed.data.botPaused === false ? "resumed" : parsed.data.botPaused ? "paused" : "updated"} the assistant.`,
    metadata: parsed.data,
    userId: guard.staff.id,
  });
  return Response.json({ ok: true });
}
