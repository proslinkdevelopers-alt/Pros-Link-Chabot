import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canAccessAdmin } from "@/lib/auth";
import { DEPARTMENT } from "@/config/brand";
import { isOwn } from "@/lib/admin/queries";
import { logEvent } from "@/lib/notify";
import { generateReference } from "@/lib/utils";
import { parseNumberList } from "@/lib/whatsapp/numbers";
import {
  countAudience,
  importContacts,
  parseParameters,
  prepareBroadcast,
  previewBody,
  requiresHeaderMedia,
  validateParameters,
} from "@/lib/whatsapp/broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * =============================================================================
 *  Create a broadcast
 * =============================================================================
 *
 *  Creates the campaign as a DRAFT with its recipient list already built, and
 *  sends nothing. Sending is a separate, explicit call to
 *  `/api/admin/broadcasts/<id>` — because a broadcast is the one action in this
 *  console that cannot be undone once it starts, and a single POST that both
 *  creates and fires is a misclick away from messaging the whole audience.
 * =============================================================================
 */

const parameterSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("static"), value: z.string().min(1).max(600) }),
  z.object({ kind: z.literal("contactName"), fallback: z.string().max(60).optional() }),
  z.object({ kind: z.literal("contactPhone") }),
]);

const schema = z.object({
  title: z.string().min(1).max(160),
  templateId: z.string().min(1),
  /** One entry per `{{n}}` in the template body, in order. */
  parameters: z.array(parameterSchema).max(20).default([]),
  /** Required when the template header is an image, video or document. */
  headerMediaUrl: z.string().url().max(2000).optional(),
  /** Pasted numbers or CSV text, when the audience is an uploaded list. */
  numbers: z.string().max(1_000_000).optional(),
  countryCode: z.string().regex(/^\d{1,4}$/).default("92"),
  audience: z
    .object({
      kind: z.enum(["segment", "list"]).default("segment"),
      includeUnrouted: z.boolean().default(false),
      activeWithinDays: z.number().int().positive().max(3650).nullable().default(null),
      limit: z.number().int().positive().max(5000).nullable().default(null),
    })
    .default({ kind: "segment", includeUnrouted: false, activeWithinDays: null, limit: null }),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessAdmin(session)) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid broadcast." },
      { status: 400 }
    );
  }
  const draft = parsed.data;

  const template = await prisma.whatsappTemplate.findUnique({
    where: { id: draft.templateId },
  });
  if (!template || !isOwn(template.department)) {
    return Response.json({ error: "Template not found." }, { status: 404 });
  }

  // Checked at creation as well as at send, so a broadcast that can never go
  // out is refused while the person who wrote it is still looking at it.
  if (template.status !== "APPROVED" || !template.metaId) {
    return Response.json(
      {
        error: `"${template.name}" is ${template.status.toLowerCase()} in Meta. Only an approved template can be broadcast.`,
      },
      { status: 400 }
    );
  }
  const sources = parseParameters(draft.parameters);
  const valid = validateParameters(template.body, sources);
  if (!valid.ok) return Response.json({ error: valid.error }, { status: 400 });

  // Meta approves the format of a media header, never the file itself, so the
  // media has to travel with every message. Refusing here means the campaign
  // cannot be saved in a state where every send is guaranteed to fail.
  if (requiresHeaderMedia(template.headerFormat) && !draft.headerMediaUrl) {
    return Response.json(
      {
        error: `"${template.name}" has a ${template.headerFormat?.toLowerCase()} header. Meta requires the file on every send, so this broadcast needs a public media URL.`,
      },
      { status: 400 }
    );
  }

  // An uploaded list becomes contacts before it becomes an audience. That is
  // what makes opt-out work for these numbers from here on: a STOP reply is
  // recorded against a contact row, so without one the person could never
  // remove themselves from a later campaign.
  let waIds: string[] = [];
  if (draft.audience.kind === "list") {
    if (!draft.numbers?.trim()) {
      return Response.json(
        { error: "No numbers were uploaded for this broadcast." },
        { status: 400 }
      );
    }

    const list = parseNumberList(draft.numbers, draft.countryCode);
    if (!list.valid.length) {
      return Response.json(
        {
          error: `None of the ${list.invalid.length} line(s) in that list were usable phone numbers.`,
        },
        { status: 400 }
      );
    }

    waIds = await importContacts(list.valid);
  }

  const audience = {
    kind: draft.audience.kind,
    waIds,
    includeUnrouted: draft.audience.includeUnrouted,
    activeWithinDays: draft.audience.activeWithinDays,
    limit: draft.audience.limit,
  };

  const reach = await countAudience(audience);
  if (reach === 0) {
    return Response.json(
      {
        error:
          draft.audience.kind === "list"
            ? "Every number on that list has opted out or is blocked, so there is nobody left to message."
            : "That audience matches nobody right now. Contacts who opted out or were blocked are always excluded.",
      },
      { status: 400 }
    );
  }

  const scheduledAt = draft.scheduledAt ? new Date(draft.scheduledAt) : null;

  const broadcast = await prisma.broadcast.create({
    data: {
      reference: generateReference("BCAST"),
      department: DEPARTMENT,
      channel: "WHATSAPP",
      status: scheduledAt ? "SCHEDULED" : "DRAFT",
      title: draft.title,
      // The rendered body, so the list stays readable even after the template
      // is renamed or deleted in Meta.
      body: previewBody(template.body, sources),
      // Stored so the run can be rebuilt later — a resumed or refreshed
      // broadcast has to reach the same people, and for an uploaded list the
      // only record of who that was is the list itself.
      audience: {
        kind: audience.kind,
        ...(audience.kind === "list" ? { waIds } : {}),
        includeUnrouted: audience.includeUnrouted,
        activeWithinDays: audience.activeWithinDays,
        limit: audience.limit,
      },
      templateId: template.id,
      templateName: template.metaName,
      languageCode: template.languageCode,
      parameters: draft.parameters,
      headerMediaUrl: draft.headerMediaUrl ?? null,
      scheduledAt,
      createdById: session.sub,
    },
  });

  // Build the recipient list now rather than at send time: the number on the
  // confirm button should be the number of people who will be messaged.
  const prepared = await prepareBroadcast(broadcast.id);

  await logEvent({
    action: "broadcast.created",
    entity: "broadcast",
    entityId: broadcast.id,
    message: `${session.name} drafted the broadcast "${draft.title}" to ${prepared.recipients} contacts.`,
    metadata: { template: template.metaName, recipients: prepared.recipients },
    userId: session.sub,
  });

  return Response.json({
    ok: true,
    id: broadcast.id,
    reference: broadcast.reference,
    recipients: prepared.recipients,
  });
}
