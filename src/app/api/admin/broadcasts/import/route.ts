import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiPermission } from "@/lib/staff";
import { parseNumberList } from "@/lib/whatsapp/numbers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * =============================================================================
 *  Preview an uploaded number list
 * =============================================================================
 *
 *  Read-only. Parses the pasted text or CSV exactly as the create endpoint
 *  will, and reports what it found — so nobody discovers that half their file
 *  was a heading row and a column of names *after* committing to a send.
 *
 *  The counts that matter are the ones people get wrong: how many lines were
 *  not numbers, how many were the same number written differently, and how
 *  many are people who have already told this business to stop. That last one
 *  is subtracted here and again at send time, because an opt-out is not a
 *  preference to be weighed against a campaign.
 * =============================================================================
 */

const schema = z.object({
  /** Raw pasted block or the text of an uploaded CSV. */
  text: z.string().min(1).max(1_000_000),
  /** Country code for numbers written without one. */
  countryCode: z.string().regex(/^\d{1,4}$/).default("92"),
});

export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("whatsapp.manage", req);
  if ("response" in guard) return guard.response;
  const session = { sub: guard.staff.id, name: guard.staff.name };

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Could not read that list." }, { status: 400 });
  }

  const outcome = parseNumberList(parsed.data.text, parsed.data.countryCode);

  if (!outcome.valid.length) {
    return Response.json({
      ok: true,
      total: 0,
      valid: 0,
      invalid: outcome.invalid.length,
      duplicates: outcome.duplicates,
      optedOut: 0,
      blocked: 0,
      sendable: 0,
      known: 0,
      samples: outcome.invalid.slice(0, 5),
      preview: [],
    });
  }

  const waIds = outcome.valid.map((entry) => entry.waId);

  // Which of these numbers this business already knows, and in what state.
  // Someone who sent STOP stays out of every future broadcast, whether or not
  // they appear in a freshly uploaded list.
  const existing = await prisma.whatsappContact.findMany({
    where: { waId: { in: waIds } },
    select: { waId: true, optedOut: true, isBlocked: true, profileName: true },
  });

  const byWaId = new Map(existing.map((contact) => [contact.waId, contact]));
  const optedOut = existing.filter((contact) => contact.optedOut).length;
  const blocked = existing.filter((contact) => contact.isBlocked && !contact.optedOut).length;

  return Response.json({
    ok: true,
    total: outcome.valid.length + outcome.invalid.length + outcome.duplicates,
    valid: outcome.valid.length,
    invalid: outcome.invalid.length,
    duplicates: outcome.duplicates,
    optedOut,
    blocked,
    /** What will actually be messaged. */
    sendable: outcome.valid.length - optedOut - blocked,
    /** Already in the CRM — the rest will be added as new contacts. */
    known: existing.length,
    /** A few rejected lines, quoted back so the cause is obvious. */
    samples: outcome.invalid.slice(0, 5),
    /** First few accepted numbers, to confirm the columns were read right. */
    preview: outcome.valid.slice(0, 5).map((entry) => ({
      phone: entry.phone,
      // A name already on file beats one from the spreadsheet: it came from
      // the person's own WhatsApp profile.
      name: byWaId.get(entry.waId)?.profileName ?? entry.name ?? null,
    })),
  });
}
