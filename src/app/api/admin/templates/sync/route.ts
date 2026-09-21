import { requireApiPermission } from "@/lib/staff";
import { logEvent } from "@/lib/notify";
import { config } from "@/lib/config";
import { syncTemplates } from "@/lib/whatsapp/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pull the WhatsApp Business Account's templates into the local table.
 *
 * This is how the console learns that Meta approved (or rejected, or paused) a
 * template. Nothing else updates `status`, so a broadcast composer that shows
 * no approved templates usually means nobody has synced since the review.
 */
export async function POST(req: Request) {
  const guard = await requireApiPermission("whatsapp.manage", req);
  if ("response" in guard) return guard.response;
  const session = { sub: guard.staff.id, name: guard.staff.name };

  if (!config.whatsapp.templatesEnabled) {
    return Response.json(
      {
        error:
          "Set WHATSAPP_WABA_ID and a token carrying `whatsapp_business_management` to sync templates from Meta.",
      },
      { status: 400 }
    );
  }

  const outcome = await syncTemplates();

  if (!outcome.ok) {
    return Response.json({ error: outcome.error ?? "Sync failed." }, { status: 502 });
  }

  await logEvent({
    action: "template.synced",
    entity: "whatsappTemplate",
    message: `${session.name} synced templates from Meta: ${outcome.created} new, ${outcome.updated} updated.`,
    metadata: { created: outcome.created, updated: outcome.updated },
    userId: session.sub,
  });

  return Response.json({
    ok: true,
    created: outcome.created,
    updated: outcome.updated,
    localOnly: outcome.localOnly,
    // Present when the sync succeeded but had something to say — a paging cap,
    // typically. Worth surfacing rather than swallowing.
    warning: outcome.error,
  });
}
