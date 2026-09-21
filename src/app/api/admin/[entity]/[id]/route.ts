import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canAccessAdmin } from "@/lib/auth";
import { isOwn } from "@/lib/admin/queries";
import { logEvent } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * =============================================================================
 *  Admin record updates
 * =============================================================================
 *
 *  One PATCH endpoint serving the console's inline status controls. Safety
 *  comes from an explicit allow-list rather than from trusting the URL:
 *
 *   • only the entities in `HANDLERS` are reachable,
 *   • each has its own Zod schema, so no arbitrary field can be written,
 *   • a record archived from the retired BITSOL Institute is refused, even by
 *     id, so nothing hidden from the console can be edited through it,
 *   • every change is written to the audit log.
 * =============================================================================
 */

interface Handler {
  schema: z.ZodTypeAny;
  /** The record's `department`, or null for tables that have no such column. */
  load: (id: string) => Promise<{ department: string | null } | null>;
  update: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  action: string;
}

const leadSchema = z.object({
  stage: z
    .enum([
      "NEW", "CONTACTED", "QUALIFIED", "HOT", "PROPOSAL_SENT", "NEGOTIATION", "FOLLOW_UP",
      "WON", "LOST", "SUPPORT", "SPAM", "OPTED_OUT",
    ])
    .optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  estimatedValue: z.number().nonnegative().optional(),
  lostReason: z.string().max(500).optional(),
  ownerId: z.string().cuid().nullish(),
});

const ticketSchema = z.object({
  status: z
    .enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"])
    .optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  resolution: z.string().max(4000).optional(),
  assigneeId: z.string().cuid().nullish(),
});

const meetingSchema = z.object({
  status: z
    .enum(["REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"])
    .optional(),
  meetingLink: z.string().url().max(500).optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
});

const knowledgeSchema = z.object({
  state: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

const HANDLERS: Record<string, Handler> = {
  leads: {
    schema: leadSchema,
    load: async (id) =>
      (await prisma.lead.findUnique({ where: { id }, select: { id: true } }))
        ? { department: null }
        : null,
    update: (id, data) => prisma.lead.update({ where: { id }, data }),
    action: "lead.updated",
  },
  tickets: {
    schema: ticketSchema,
    load: (id) =>
      prisma.ticket.findUnique({ where: { id }, select: { department: true } }),
    update: (id, data) =>
      prisma.ticket.update({
        where: { id },
        data: {
          ...data,
          ...(data.status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
        },
      }),
    action: "ticket.updated",
  },
  meetings: {
    schema: meetingSchema,
    load: (id) =>
      prisma.meeting.findUnique({ where: { id }, select: { department: true } }),
    update: (id, data) =>
      prisma.meeting.update({
        where: { id },
        data: {
          ...data,
          ...(data.status === "CONFIRMED" ? { confirmedAt: new Date() } : {}),
        },
      }),
    action: "meeting.updated",
  },
  knowledge: {
    schema: knowledgeSchema,
    load: async (id) =>
      (await prisma.knowledgeArticle.findUnique({ where: { id }, select: { id: true } }))
        ? { department: null }
        : null,
    update: (id, data) =>
      prisma.knowledgeArticle.update({
        where: { id },
        data: { ...data, indexedAt: new Date() },
      }),
    action: "knowledge.updated",
  },
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> }
) {
  const session = await getSession();
  if (!session || !canAccessAdmin(session)) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  const { entity, id } = await params;
  const handler = HANDLERS[entity];
  if (!handler) {
    return Response.json({ error: "Unknown resource." }, { status: 404 });
  }

  const parsed = handler.schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid update payload." }, { status: 400 });
  }
  const data = parsed.data as Record<string, unknown>;
  if (Object.keys(data).length === 0) {
    return Response.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const record = await handler.load(id);
    if (!record || !isOwn(record.department)) {
      return Response.json({ error: "Record not found." }, { status: 404 });
    }

    await handler.update(id, data);

    await logEvent({
      action: handler.action,
      entity,
      entityId: id,
      message: `${session.name} updated ${entity} ${id}.`,
      metadata: data,
      userId: session.sub,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error(`[admin:${entity}] update failed:`, error);
    return Response.json({ error: "Update failed." }, { status: 500 });
  }
}
