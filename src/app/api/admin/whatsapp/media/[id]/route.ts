import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { hasPermission, requireApiStaff } from "@/lib/staff";
import { downloadMedia } from "@/lib/whatsapp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Types shown in the browser; anything else downloads, so a file can never run as a page. */
const INLINE = /^(image\/(jpeg|png|webp|gif)|application\/pdf|audio\/(ogg|mpeg|aac|mp4)|video\/mp4)$/;

/**
 * A photo or document a customer sent on WhatsApp, relayed from Meta for the
 * console. The file must belong to a conversation or ticket in this tenant
 * that the signed-in person may see.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiStaff(req);
  if ("response" in guard) return guard.response;
  const { staff } = guard;
  const { id } = await params;

  const [message, tickets] = await Promise.all([
    hasPermission(staff, "conversations.view")
      ? prisma.message.findFirst({ where: { mediaId: id, conversation: { department: DEPARTMENT } }, select: { id: true } })
      : null,
    prisma.$queryRaw<Array<{ assigneeId: string | null }>>`
      SELECT "assigneeId" FROM tickets
      WHERE "department"::text = ${DEPARTMENT} AND attachments @> ${JSON.stringify([{ mediaId: id }])}::jsonb
      LIMIT 5`,
  ]);
  const viaTicket = tickets.some((ticket) => hasPermission(staff, "tickets.view") || (hasPermission(staff, "tickets.update_assigned") && ticket.assigneeId === staff.id));
  if (!message && !viaTicket) return Response.json({ error: "File not found." }, { status: 404 });

  const file = await downloadMedia(id);
  if (!file.ok) return Response.json({ error: file.error }, { status: file.status });

  const inline = INLINE.test(file.mime);
  return new Response(file.body, {
    headers: {
      "Content-Type": inline ? file.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="whatsapp-${id.slice(-12)}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
