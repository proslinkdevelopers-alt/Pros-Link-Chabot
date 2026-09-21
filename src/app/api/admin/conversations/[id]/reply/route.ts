import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { isOwn } from "@/lib/admin/queries";
import { logEvent } from "@/lib/notify";
import { sendText } from "@/lib/whatsapp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 24 * 60 * 60 * 1000;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(4000),
  /** Keep the assistant quiet while a person is talking. */
  pauseBot: z.boolean().default(true),
});

/**
 * A person on the team replies to a WhatsApp customer from the console.
 *
 * Free-form messages are only allowed inside WhatsApp's 24-hour customer
 * service window, so the route checks the customer's last message first and
 * says so plainly instead of letting Meta reject the send.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiPermission("conversations.reply", req);
  if ("response" in guard) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Write a message first." }, { status: 400 });

  const { id } = await params;
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, channel: true, contactPhone: true, department: true },
  });
  if (!conversation || !isOwn(conversation.department)) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  if (conversation.channel !== "WHATSAPP" || !conversation.contactPhone) {
    return Response.json({ error: "Only WhatsApp conversations can be replied to from here." }, { status: 400 });
  }

  const waId = conversation.contactPhone.replace(/\D/g, "");
  const contact = await prisma.whatsappContact.findUnique({ where: { waId }, select: { lastInboundAt: true, isBlocked: true } });
  if (contact?.isBlocked) return Response.json({ error: "This number is blocked." }, { status: 400 });
  if (!contact?.lastInboundAt || Date.now() - contact.lastInboundAt.getTime() > WINDOW_MS) {
    return Response.json(
      { error: "The 24-hour reply window has closed. Send an approved template from Broadcasts instead." },
      { status: 409 }
    );
  }

  const result = await sendText(waId, parsed.data.text);
  if (!result.ok) {
    return Response.json({ error: result.error ?? "WhatsApp did not accept the message." }, { status: 502 });
  }

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: id,
        role: "ASSISTANT",
        content: parsed.data.text,
        department: DEPARTMENT,
        externalId: result.messageId,
        authorId: guard.staff.id,
      },
    }),
    prisma.conversation.update({
      where: { id },
      data: { handedOff: true, ...(parsed.data.pauseBot ? { botPaused: true } : {}) },
    }),
    prisma.whatsappContact.update({ where: { waId }, data: { lastOutboundAt: new Date() } }),
  ]);

  await logEvent({
    action: "whatsapp.agent.replied",
    entity: "Conversation",
    entityId: id,
    message: `${guard.staff.name} replied on WhatsApp.`,
    userId: guard.staff.id,
  });

  return Response.json({ ok: true });
}
