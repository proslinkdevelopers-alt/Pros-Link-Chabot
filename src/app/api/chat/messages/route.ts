import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { rateLimit } from "@/lib/redis";
import { clientIpOf } from "@/lib/notify";
import type { StaffReply } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Replies a staff member has written from the console to a web conversation,
 * newer than `after`. The web assistant polls this while a person is handling
 * the conversation.
 *
 * Only messages written by staff are returned — never the transcript — and
 * only to whoever holds the conversation's random reference.
 */
export async function GET(req: NextRequest) {
  const { allowed } = await rateLimit(`chat-poll:${clientIpOf(req) ?? "anonymous"}`, 40, 60);
  if (!allowed) return Response.json({ replies: [] }, { status: 429 });

  const reference = req.nextUrl.searchParams.get("ref") ?? "";
  if (!/^PL-CONV-[A-Z2-9]{10}$/.test(reference)) return Response.json({ replies: [] }, { status: 400 });
  const after = new Date(req.nextUrl.searchParams.get("after") ?? 0);

  const conversation = await prisma.conversation
    .findFirst({ where: { reference, department: DEPARTMENT, channel: "WEB" }, select: { id: true } })
    .catch(() => null);
  if (!conversation) return Response.json({ replies: [] });

  const rows = await prisma.message.findMany({
    where: {
      conversationId: conversation.id,
      role: "ASSISTANT",
      authorId: { not: null },
      createdAt: { gt: Number.isNaN(after.getTime()) ? new Date(0) : after },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true, content: true, createdAt: true },
  });

  const replies: StaffReply[] = rows.map((row) => ({ id: row.id, body: row.content, at: row.createdAt.toISOString() }));
  return Response.json({ replies });
}
