import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiPermission } from "@/lib/staff";
import { isOwn } from "@/lib/admin/queries";
import { logEvent } from "@/lib/notify";
import { config } from "@/lib/config";
import { prepareBroadcast, runBroadcast } from "@/lib/whatsapp/broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * =============================================================================
 *  Start, retry or delete a broadcast
 * =============================================================================
 *
 *  The send is started here and deliberately not awaited. A few thousand
 *  recipients at a polite pace takes longer than any reverse proxy will hold a
 *  request open, so the route's job is to refuse a bad run, flip the status to
 *  SENDING, and hand off. Progress is read from the database.
 *
 *  This works because the app runs as a long-lived Node server (the Docker
 *  image is a standalone build), not as per-request functions. If a redeploy
 *  interrupts a run mid-way, `POST` again: the recipient table records who has
 *  already been messaged, so a resumed run continues rather than repeats.
 * =============================================================================
 */

const actionSchema = z.object({
  action: z.enum(["send", "cancel"]).default("send"),
  /** Rebuild the recipient list first, picking up contacts added since. */
  refresh: z.boolean().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiPermission("whatsapp.manage", req);
  if ("response" in guard) return guard.response;
  const session = { sub: guard.staff.id, name: guard.staff.name };

  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid action." }, { status: 400 });
  }

  const broadcast = await prisma.broadcast.findUnique({
    where: { id },
    include: { template: { select: { name: true, status: true, metaId: true } } },
  });
  // A broadcast from before the Pros-Link platform is not this console's to send or cancel.
  if (!broadcast || !isOwn(broadcast.department)) {
    return Response.json({ error: "Broadcast not found." }, { status: 404 });
  }

  if (parsed.data.action === "cancel") {
    if (broadcast.status !== "SCHEDULED" && broadcast.status !== "DRAFT") {
      return Response.json(
        { error: "Only a draft or scheduled broadcast can be cancelled." },
        { status: 409 }
      );
    }
    await prisma.broadcast.update({
      where: { id },
      data: { status: "FAILED", error: `Cancelled by ${session.name}.` },
    });
    await logEvent({
      action: "broadcast.cancelled",
      entity: "broadcast",
      entityId: id,
      message: `${session.name} cancelled the broadcast "${broadcast.title}".`,
      userId: session.sub,
    });
    return Response.json({ ok: true, status: "CANCELLED" });
  }

  // --- send ---------------------------------------------------------------

  if (!config.whatsapp.enabled) {
    return Response.json(
      { error: "WhatsApp is not configured (WHATSAPP_PHONE_ID / WHATSAPP_TOKEN)." },
      { status: 400 }
    );
  }

  if (broadcast.status === "SENT" && broadcast.failed === 0) {
    return Response.json({ error: "This broadcast has already been sent." }, { status: 409 });
  }

  if (!broadcast.template) {
    return Response.json({ error: "This broadcast has no template attached." }, { status: 400 });
  }
  if (broadcast.template.status !== "APPROVED" || !broadcast.template.metaId) {
    return Response.json(
      {
        error: `"${broadcast.template.name}" is ${broadcast.template.status.toLowerCase()} in Meta. Sync templates and try again once it is approved.`,
      },
      { status: 400 }
    );
  }

  if (parsed.data.refresh) {
    const prepared = await prepareBroadcast(id);
    if (!prepared.ok) {
      return Response.json({ error: prepared.error ?? "Could not build the audience." }, { status: 400 });
    }
  }

  const pending = await prisma.broadcastRecipient.count({
    where: { broadcastId: id, status: { in: ["PENDING", "FAILED"] } },
  });
  if (pending === 0) {
    return Response.json(
      { error: "Every recipient on this broadcast has already been messaged." },
      { status: 409 }
    );
  }

  // Claim the run atomically. Checking the status and then setting it leaves a
  // window in which two clicks both pass the check, and both runs would then
  // read the same PENDING rows and message half the audience twice. The
  // conditional update closes it: exactly one caller can move the row out of
  // its current status, and the loser is told what happened.
  const { count: claimed } = await prisma.broadcast.updateMany({
    where: { id, status: { not: "SENDING" } },
    data: { status: "SENDING", startedAt: broadcast.startedAt ?? new Date(), error: null },
  });
  if (claimed === 0) {
    return Response.json({ error: "This broadcast is already sending." }, { status: 409 });
  }

  await logEvent({
    action: "broadcast.started",
    entity: "broadcast",
    entityId: id,
    message: `${session.name} started the broadcast "${broadcast.title}" to ${pending} contacts.`,
    metadata: { template: broadcast.templateName, pending },
    userId: session.sub,
  });

  // Not awaited on purpose — see the header. `runBroadcast` writes its own
  // failure to the row, so the catch here is only for the truly unexpected.
  void runBroadcast(id).catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[broadcast] run crashed:", message);
    await prisma.broadcast
      .update({ where: { id }, data: { status: "FAILED", error: message.slice(0, 500) } })
      .catch(() => undefined);
  });

  return Response.json({ ok: true, status: "SENDING", pending });
}

/**
 * Delete a broadcast that never went out.
 *
 * A sent broadcast is a record of messages real people received and stays.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiPermission("whatsapp.manage", req);
  if ("response" in guard) return guard.response;
  const session = { sub: guard.staff.id, name: guard.staff.name };

  const { id } = await params;
  const broadcast = await prisma.broadcast.findUnique({ where: { id } });
  if (!broadcast || !isOwn(broadcast.department)) {
    return Response.json({ error: "Broadcast not found." }, { status: 404 });
  }
  if (broadcast.status === "SENDING" || broadcast.sent > 0) {
    return Response.json(
      { error: "A broadcast that has messaged people cannot be deleted." },
      { status: 409 }
    );
  }

  // Recipient rows go with it — the relation cascades.
  await prisma.broadcast.delete({ where: { id } });

  await logEvent({
    level: "WARN",
    action: "broadcast.deleted",
    entity: "broadcast",
    entityId: id,
    message: `${session.name} deleted the unsent broadcast "${broadcast.title}".`,
    userId: session.sub,
  });

  return Response.json({ ok: true });
}
