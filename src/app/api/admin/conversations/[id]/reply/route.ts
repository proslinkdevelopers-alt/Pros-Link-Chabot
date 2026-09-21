import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { isOwn } from "@/lib/admin/queries";
import { audit } from "@/lib/notify";
import { sendText } from "@/lib/whatsapp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 24 * 60 * 60 * 1000;

const bodySchema = z.object({
  text: z.string().trim().min(1, "Write a message first.").max(4000),
  /** Keep the assistant quiet while a person is talking. */
  pauseBot: z.boolean().default(true),
});

/**
 * A person on the team replies to a customer from the console.
 *
 *  • WhatsApp: sent through the Cloud API. Free-form messages are allowed only
 *    inside the 24-hour customer service window, so the route checks the
 *    customer's last message first and says so plainly.
 *  • Web: stored on the conversation; the customer's open chat picks it up.
 *
 * Replying takes the conversation over from the assistant.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiPermission("conversations.reply", req);
  if ("response" in guard) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Write a message first." }, { status: 400 });

  const { id } = await params;
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, channel: true, contactPhone: true, department: true, assigneeId: true },
  });
  if (!conversation || !isOwn(conversation.department)) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  let externalId: string | undefined;
  if (conversation.channel === "WHATSAPP") {
    if (!conversation.contactPhone) return Response.json({ error: "This conversation has no WhatsApp number." }, { status: 400 });
    const waId = conversation.contactPhone.replace(/\D/g, "");
    const contact = await prisma.whatsappContact.findUnique({ where: { waId }, select: { lastInboundAt: true, isBlocked: true } });
    if (contact?.isBlocked) return Response.json({ error: "This number is blocked." }, { status: 400 });
    if (!contact?.lastInboundAt || Date.now() - contact.lastInboundAt.getTime() > WINDOW_MS) {
      return Response.json(
        { error: "The 24-hour reply window has closed. Send an approved template from WhatsApp → Broadcasts instead." },
        { status: 409 }
      );
    }
    const result = await sendText(waId, parsed.data.text);
    if (!result.ok) {
      return Response.json({ error: result.error ?? "WhatsApp did not accept the message." }, { status: 502 });
    }
    externalId = result.messageId;
    await prisma.whatsappContact.update({ where: { waId }, data: { lastOutboundAt: new Date() } }).catch(() => {});
  }

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: id,
        role: "ASSISTANT",
        content: parsed.data.text,
        department: DEPARTMENT,
        externalId,
        authorId: guard.staff.id,
      },
    }),
    prisma.conversation.update({
      where: { id },
      data: {
        handedOff: true,
        readAt: new Date(),
        status: "OPEN",
        // Whoever replies first owns the thread, unless someone already does.
        ...(conversation.assigneeId ? {} : { assigneeId: guard.staff.id }),
        ...(parsed.data.pauseBot ? { botPaused: true } : {}),
      },
    }),
  ]);

  await audit({
    action: "conversation.replied",
    entity: "Conversation",
    entityId: id,
    userId: guard.staff.id,
    message: `${guard.staff.name} replied on ${conversation.channel === "WHATSAPP" ? "WhatsApp" : "the web assistant"}.`,
    req,
  });

  return Response.json({ ok: true });
}
