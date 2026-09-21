import type { Prisma, WhatsappContact } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { DEPARTMENT } from "@/config/brand";
import { sendTemplate, type TemplateHeaderMedia } from "./client";
import { countPlaceholders, renderTemplate } from "./templates";

/**
 * =============================================================================
 *  Broadcasts
 * =============================================================================
 *
 *  A broadcast is a Meta-approved template sent to an audience of WhatsApp
 *  contacts. Three rules shape everything below, and all three come from how
 *  the WhatsApp Cloud API actually behaves:
 *
 *   1. **Only an approved template may go out.** Every recipient of a broadcast
 *      is, by definition, outside the 24-hour customer service window, so free
 *      text is not an option — Meta drops it. The send refuses to start unless
 *      the template is APPROVED and carries a Meta id.
 *
 *   2. **A send is a long loop, not a request.** Thousands of recipients at a
 *      polite pace outlives any HTTP request, so the route starts the run and
 *      returns; progress lives in the database. `whatsapp_broadcast_recipients`
 *      has a unique `(broadcastId, waId)`, which is what makes a run that was
 *      interrupted by a redeploy safe to start again: already-sent rows are
 *      skipped rather than messaged twice.
 *
 *   3. **"Sent" and "delivered" are different facts.** Meta's `/messages` call
 *      returns as soon as it has *accepted* the message. Whether it arrived is
 *      answered minutes later on the webhook, keyed by the `wamid` — so the
 *      wamid is stored per recipient and `applyStatusUpdate` reconciles it.
 * =============================================================================
 */

/**
 * Pause between sends.
 *
 * Meta's default throughput for a business number is comfortably above this;
 * the pacing exists so a broadcast does not saturate outbound connections on a
 * shared host and starve the webhook, which has to keep answering inbound
 * customer messages while the broadcast runs.
 */
const SEND_INTERVAL_MS = 250;

/** Recipients per broadcast run. A ceiling, not a target — see `resolveAudience`. */
const MAX_RECIPIENTS = 5_000;

// -------------------------------------------------------------- Audience ----

/**
 * An audience is either a segment of the people who have messaged this
 * business, or an explicit list of numbers someone uploaded.
 *
 * They converge before anything is sent: an uploaded number becomes a
 * `WhatsappContact` row like any other, so a later STOP from that person is
 * recorded against it and removes them from every future broadcast. Keeping
 * uploaded numbers outside the contact table would mean opt-outs silently did
 * not apply to them, which is the one failure mode that must not exist.
 */
export interface AudienceFilter {
  /** `segment` (a query) or `list` (uploaded numbers). Absent means segment. */
  kind?: "segment" | "list";
  /** For `list`: the numbers to message, already normalised to Meta's wa_id. */
  waIds?: string[];
  /**
   * Also include contacts from before BITSOL Institute was retired who never
   * picked a business in the old welcome menu. They are legitimate recipients,
   * but they never actually asked about BITSOL Marketing, so it is opt-in.
   */
  includeUnrouted?: boolean;
  /**
   * Only contacts who messaged within this many days. Null means no limit.
   * Worth setting: a number that has been silent for a year is more likely to
   * report the message as spam, and quality rating is per-number and shared.
   */
  activeWithinDays?: number | null;
  /** Hard cap on how many contacts the run will message. */
  limit?: number | null;
}

/**
 * The `where` clause behind every audience.
 *
 * Opted-out and blocked contacts are excluded here rather than at send time, so
 * the count shown in the composer is the count that will actually be messaged.
 * Someone who sent STOP must never appear in a broadcast again — that is the
 * whole contract of the keyword, and Meta enforces it with quality penalties.
 */
export function audienceWhere(filter: AudienceFilter): Prisma.WhatsappContactWhereInput {
  const where: Prisma.WhatsappContactWhereInput = {
    optedOut: false,
    isBlocked: false,
  };

  // An uploaded list is already the audience. It is still filtered by opt-out
  // and block above — the upload says who was *asked* for, not who may be
  // messaged — but business and activity do not apply: the person chose these
  // numbers explicitly.
  if (filter.kind === "list") {
    where.waId = { in: filter.waIds ?? [] };
    return where;
  }

  // Archived Institute contacts are never part of a segment.
  if (filter.includeUnrouted) {
    where.OR = [{ department: DEPARTMENT }, { department: null }];
  } else {
    where.department = DEPARTMENT;
  }

  if (filter.activeWithinDays && filter.activeWithinDays > 0) {
    const since = new Date(Date.now() - filter.activeWithinDays * 24 * 60 * 60 * 1000);
    where.lastInboundAt = { gte: since };
  }

  return where;
}

/** How many contacts this filter currently matches. */
export async function countAudience(filter: AudienceFilter): Promise<number> {
  const matched = await prisma.whatsappContact.count({ where: audienceWhere(filter) });
  const cap = Math.min(filter.limit ?? MAX_RECIPIENTS, MAX_RECIPIENTS);
  return Math.min(matched, cap);
}

/**
 * The contacts themselves, most recently active first.
 *
 * The order only matters when a limit truncates the audience, and then it
 * matters a lot: the people who messaged last week are likelier to welcome the
 * message than the ones who went quiet a year ago, and a broadcast's cost is
 * paid in quality rating as well as money.
 */
export async function resolveAudience(filter: AudienceFilter): Promise<WhatsappContact[]> {
  return prisma.whatsappContact.findMany({
    where: audienceWhere(filter),
    orderBy: { lastInboundAt: "desc" },
    take: Math.min(filter.limit ?? MAX_RECIPIENTS, MAX_RECIPIENTS),
  });
}

// ------------------------------------------------------- Uploaded numbers ---

/**
 * Add an uploaded list to the contact table, and return the wa_ids.
 *
 * `createMany` with `skipDuplicates` gives exactly the semantics wanted here in
 * one query: numbers this business has never seen become contacts, and numbers
 * it already knows are left completely alone. That second half matters —
 * an existing contact's WhatsApp profile name is better data than a name typed
 * into a spreadsheet, and an upload must never quietly clear someone's opt-out.
 *
 * New contacts get `lastInboundAt` of null, which is the truth: they have
 * never messaged this business. The inbox reads that as "no messages yet"
 * rather than pretending a conversation happened.
 */
export async function importContacts(
  entries: Array<{ waId: string; phone: string; name?: string }>
): Promise<string[]> {
  if (!entries.length) return [];

  await prisma.whatsappContact.createMany({
    data: entries.map((entry) => ({
      waId: entry.waId,
      phone: entry.phone,
      profileName: entry.name ?? null,
      department: DEPARTMENT,
    })),
    skipDuplicates: true,
  });

  return entries.map((entry) => entry.waId);
}

// ------------------------------------------------------------ Parameters ----

/**
 * How one `{{n}}` gets filled for a given recipient.
 *
 * Deliberately a small, closed set. Meta charges per conversation and a
 * template is approved with its placeholder count fixed, so a broadcast that
 * computes parameters from arbitrary expressions is a way to get a whole run
 * rejected mid-flight — every source here resolves to a string for every
 * contact, with no lookups that can fail.
 */
export type ParameterSource =
  | { kind: "static"; value: string }
  | { kind: "contactName"; fallback?: string }
  | { kind: "contactPhone" };

/** Validate whatever came off the wire into parameter sources. */
export function parseParameters(raw: unknown): ParameterSource[] {
  if (!Array.isArray(raw)) return [];
  const out: ParameterSource[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const kind = (entry as { kind?: unknown }).kind;

    if (kind === "static") {
      out.push({ kind: "static", value: String((entry as { value?: unknown }).value ?? "") });
    } else if (kind === "contactName") {
      const fallback = (entry as { fallback?: unknown }).fallback;
      out.push({
        kind: "contactName",
        fallback: typeof fallback === "string" ? fallback : undefined,
      });
    } else if (kind === "contactPhone") {
      out.push({ kind: "contactPhone" });
    }
  }

  return out;
}

/**
 * Resolve the parameter list for one contact.
 *
 * Never returns an empty string in a slot: Meta rejects a template parameter
 * that is blank, and a contact with no WhatsApp profile name is entirely
 * normal — so `contactName` falls back to whatever the composer set, and then
 * to a neutral greeting rather than sending "Hi ,".
 */
export function fillParameters(
  sources: ParameterSource[],
  contact: Pick<WhatsappContact, "profileName" | "phone">
): string[] {
  return sources.map((source) => {
    switch (source.kind) {
      case "static":
        return source.value.trim() || "—";
      case "contactName":
        return contact.profileName?.trim() || source.fallback?.trim() || "there";
      case "contactPhone":
        return contact.phone;
    }
  });
}

/**
 * Check the parameter list against the template before a single message goes
 * out.
 *
 * A count mismatch is Meta error #132000, and it fails per message — meaning a
 * misconfigured broadcast would otherwise burn through the whole audience
 * producing nothing but failures. Cheaper to refuse to start.
 */
export function validateParameters(
  body: string,
  sources: ParameterSource[]
): { ok: true } | { ok: false; error: string } {
  const required = countPlaceholders(body);
  if (sources.length !== required) {
    return {
      ok: false,
      error:
        `This template takes ${required} parameter${required === 1 ? "" : "s"}, ` +
        `but ${sources.length} ${sources.length === 1 ? "was" : "were"} configured.`,
    };
  }
  return { ok: true };
}

// --------------------------------------------------------- Media headers ----

/** Header formats that carry a file rather than words. */
const MEDIA_HEADERS = new Set(["IMAGE", "VIDEO", "DOCUMENT"]);

/**
 * Whether this template's header is a file that has to be sent with it.
 *
 * Meta approves the *format* of a media header, not the picture — the handle
 * stored on the template is only shown to the reviewer. Every send has to
 * carry the media again, so a broadcast on such a template needs a URL of its
 * own or it fails for every recipient with a parameter error.
 */
export function requiresHeaderMedia(headerFormat: string | null): boolean {
  return Boolean(headerFormat && MEDIA_HEADERS.has(headerFormat.toUpperCase()));
}

/** Build the header argument for `sendTemplate`, or nothing when not needed. */
export function headerMediaFor(
  headerFormat: string | null,
  url: string | null
): TemplateHeaderMedia | undefined {
  if (!requiresHeaderMedia(headerFormat) || !url?.trim()) return undefined;
  return {
    format: headerFormat!.toUpperCase() as TemplateHeaderMedia["format"],
    link: url.trim(),
  };
}

/** The body a person would read, with a sample contact's values substituted. */
export function previewBody(body: string, sources: ParameterSource[]): string {
  return renderTemplate(
    body,
    fillParameters(sources, { profileName: "Ali", phone: "+923001234567" })
  );
}

// ------------------------------------------------------------- Materialise --

export interface PrepareOutcome {
  ok: boolean;
  recipients: number;
  error?: string;
}

/**
 * Write one recipient row per contact in the audience.
 *
 * `createMany` with `skipDuplicates` leans on the unique `(broadcastId, waId)`:
 * re-preparing a broadcast adds contacts who have joined the audience since
 * and touches nobody who is already on the list, so a scheduled run picked up
 * twice cannot double-message anyone.
 */
export async function prepareBroadcast(broadcastId: string): Promise<PrepareOutcome> {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    include: { template: true },
  });

  if (!broadcast) return { ok: false, recipients: 0, error: "Broadcast not found." };
  if (!broadcast.template) {
    return { ok: false, recipients: 0, error: "This broadcast has no template attached." };
  }

  const filter = (broadcast.audience ?? {}) as Partial<AudienceFilter>;
  const contacts = await resolveAudience({
    kind: filter.kind ?? "segment",
    waIds: filter.waIds ?? [],
    includeUnrouted: filter.includeUnrouted ?? false,
    activeWithinDays: filter.activeWithinDays ?? null,
    limit: filter.limit ?? null,
  });

  const sources = parseParameters(broadcast.parameters);

  await prisma.broadcastRecipient.createMany({
    data: contacts.map((contact) => ({
      broadcastId,
      contactId: contact.id,
      waId: contact.waId,
      phone: contact.phone,
      name: contact.profileName,
      parameters: fillParameters(sources, contact),
    })),
    skipDuplicates: true,
  });

  const recipients = await prisma.broadcastRecipient.count({ where: { broadcastId } });
  await prisma.broadcast.update({ where: { id: broadcastId }, data: { recipients } });

  return { ok: true, recipients };
}

// ------------------------------------------------------------------ Send ----

export interface RunOutcome {
  ok: boolean;
  sent: number;
  failed: number;
  error?: string;
}

/**
 * Send a prepared broadcast.
 *
 * Long-running by design: it walks the pending recipients one at a time with a
 * pause between each. Callers start it and let it go — the database is the
 * progress report, not the return value.
 *
 * Safe to call again on a broadcast that died half-way. Only PENDING and
 * FAILED rows are picked up, so a resumed run continues where it stopped
 * instead of messaging the first half of the audience a second time.
 */
export async function runBroadcast(broadcastId: string): Promise<RunOutcome> {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    include: { template: true },
  });

  if (!broadcast) return { ok: false, sent: 0, failed: 0, error: "Broadcast not found." };

  const failRun = async (error: string): Promise<RunOutcome> => {
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: "FAILED", error },
    });
    return { ok: false, sent: 0, failed: 0, error };
  };

  if (!config.whatsapp.enabled) {
    return failRun("WhatsApp is not configured (WHATSAPP_PHONE_ID / WHATSAPP_TOKEN).");
  }

  const template = broadcast.template;
  if (!template) return failRun("This broadcast has no template attached.");
  if (template.status !== "APPROVED" || !template.metaId) {
    return failRun(
      `Template "${template.name}" is ${template.status.toLowerCase()} in Meta. ` +
        "Only an approved template can be broadcast."
    );
  }

  const sources = parseParameters(broadcast.parameters);
  const valid = validateParameters(template.body, sources);
  if (!valid.ok) return failRun(valid.error);

  // Checked once, before the loop, for the same reason the parameter count is:
  // a missing media header fails every single message, so discovering it on
  // recipient one is far better than on recipient five thousand.
  const headerMedia = headerMediaFor(template.headerFormat, broadcast.headerMediaUrl);
  if (requiresHeaderMedia(template.headerFormat) && !headerMedia) {
    return failRun(
      `"${template.name}" has a ${template.headerFormat?.toLowerCase()} header, which Meta ` +
        "requires on every send. Add the media URL to this broadcast and try again."
    );
  }

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      status: "SENDING",
      startedAt: broadcast.startedAt ?? new Date(),
      error: null,
      templateName: template.metaName,
      languageCode: template.languageCode,
    },
  });

  let sent = 0;
  let failed = 0;

  // Paged rather than loaded whole: a five-thousand-recipient audience should
  // not sit in memory for the length of the run.
  for (;;) {
    const batch = await prisma.broadcastRecipient.findMany({
      where: { broadcastId, status: { in: ["PENDING", "FAILED"] } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    if (!batch.length) break;

    for (const recipient of batch) {
      const result = await sendTemplate(
        recipient.waId,
        template.metaName,
        template.languageCode,
        recipient.parameters,
        headerMedia ? { media: headerMedia } : undefined
      );

      if (result.ok) {
        sent++;
        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "SENT",
            messageId: result.messageId ?? null,
            sentAt: new Date(),
            error: null,
          },
        });
      } else {
        failed++;
        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: { status: "FAILED", error: result.error?.slice(0, 500) ?? "Send failed." },
        });
      }

      await pause(SEND_INTERVAL_MS);
    }

    // Publish progress once per batch rather than once per run. A broadcast to
    // a few thousand people takes long enough that a detail page showing zero
    // until the very end reads as a hung job.
    await refreshCounters(broadcastId);

    // A batch where nothing was accepted means the number, the token or the
    // template is broken, not that a hundred people are individually
    // unreachable. Stopping there keeps a bad configuration from working its
    // way through the entire audience.
    if (batch.length >= 20 && sent === 0) {
      return failRun(
        "Stopped after the first batch: Meta rejected every message. " +
          "Check the template's approval status and the number's quality rating."
      );
    }
  }

  await refreshCounters(broadcastId);

  const total = sent + failed;
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      // A run in which nothing at all was accepted is a failure, not a send.
      status: total > 0 && sent === 0 ? "FAILED" : "SENT",
      sentAt: new Date(),
      error: total > 0 && sent === 0 ? "Meta rejected every message in this broadcast." : null,
    },
  });

  return { ok: sent > 0 || total === 0, sent, failed };
}

/** Recount the summary columns from the recipient rows they summarise. */
export async function refreshCounters(broadcastId: string): Promise<void> {
  const grouped = await prisma.broadcastRecipient.groupBy({
    by: ["status"],
    where: { broadcastId },
    _count: { _all: true },
  });

  const count = (status: string) =>
    grouped.find((row) => row.status === status)?._count._all ?? 0;

  const delivered = count("DELIVERED");
  const read = count("READ");

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      recipients: grouped.reduce((total, row) => total + row._count._all, 0),
      // Anything Meta accepted counts as sent, whatever happened to it after.
      sent: count("SENT") + delivered + read,
      // A read message was necessarily delivered; Meta does not re-send the
      // delivered receipt once it has sent the read one.
      delivered: delivered + read,
      readCount: read,
      failed: count("FAILED"),
    },
  });
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ------------------------------------------------------- Delivery receipts --

/**
 * Apply one of Meta's delivery receipts to the recipient it belongs to.
 *
 * Called from the webhook for every status Meta sends. Most of them belong to
 * ordinary assistant replies rather than to a broadcast, so a miss is the
 * common case and costs one indexed lookup on a unique column.
 *
 * Receipts arrive out of order — a `read` can land before the `delivered` that
 * logically precedes it — so status only ever moves forward, never back down
 * the ladder.
 */
const STATUS_RANK: Record<string, number> = {
  PENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};

export async function applyStatusUpdate(
  messageId: string,
  status: "sent" | "delivered" | "read" | "failed",
  error?: string
): Promise<void> {
  const recipient = await prisma.broadcastRecipient.findUnique({
    where: { messageId },
    select: { id: true, broadcastId: true, status: true },
  });

  // Not a broadcast message — an assistant reply, almost always.
  if (!recipient) return;

  const now = new Date();

  if (status === "failed") {
    await prisma.broadcastRecipient.update({
      where: { id: recipient.id },
      data: { status: "FAILED", error: error?.slice(0, 500) ?? "Delivery failed." },
    });
  } else {
    const next = status.toUpperCase() as "SENT" | "DELIVERED" | "READ";
    if ((STATUS_RANK[next] ?? 0) <= (STATUS_RANK[recipient.status] ?? 0)) return;

    await prisma.broadcastRecipient.update({
      where: { id: recipient.id },
      data: {
        status: next,
        ...(next === "DELIVERED" ? { deliveredAt: now } : {}),
        // A read receipt implies delivery, and Meta will not send the
        // delivered receipt separately once it has sent this one.
        ...(next === "READ" ? { readAt: now, deliveredAt: now } : {}),
      },
    });
  }

  await refreshCounters(recipient.broadcastId);
}
