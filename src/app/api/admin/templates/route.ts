import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { canAccessAdmin } from "@/lib/auth";
import { DEPARTMENT } from "@/config/brand";
import { logEvent } from "@/lib/notify";
import { config } from "@/lib/config";
import { countPlaceholders, submitTemplate } from "@/lib/whatsapp/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * =============================================================================
 *  Create a WhatsApp message template
 * =============================================================================
 *
 *  Writes the template to Meta first and stores it locally second, in that
 *  order and never the other way round. Meta is the authority on whether a
 *  template exists: a local row for a template Meta rejected at creation time
 *  would show up in the broadcast composer as a usable option and fail on
 *  every single recipient.
 *
 *  What comes back is always PENDING. Meta reviews templates in anything from
 *  a minute to a day, and the console learns the verdict on the next sync.
 * =============================================================================
 */

const schema = z.object({
  /** Meta's name: lowercase, digits, underscores. */
  metaName: z
    .string()
    .min(1)
    .max(512)
    .regex(
      /^[a-z0-9_]+$/,
      "Use lowercase letters, numbers and underscores only — Meta rejects anything else."
    ),
  name: z.string().min(1).max(120),
  languageCode: z.string().min(2).max(10),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  body: z.string().min(1).max(1024),
  headerText: z.string().max(60).optional(),
  footerText: z.string().max(60).optional(),
  /** Example value per `{{n}}`, in order — Meta will not review without them. */
  examples: z.array(z.string().max(200)).max(20).optional(),
  /** Local labels for the placeholders, shown in the broadcast composer. */
  variables: z.array(z.string().max(60)).max(20).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessAdmin(session)) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  if (!config.whatsapp.templatesEnabled) {
    return Response.json(
      {
        error:
          "Template management is not configured. Set WHATSAPP_WABA_ID and a token carrying `whatsapp_business_management`.",
      },
      { status: 400 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid template." },
      { status: 400 }
    );
  }
  const draft = parsed.data;

  // Meta's uniqueness is name + language, so the same check has to happen here
  // — otherwise the Graph call fails with an opaque duplicate-name error.
  const clash = await prisma.whatsappTemplate.findUnique({
    where: {
      metaName_languageCode: {
        metaName: draft.metaName,
        languageCode: draft.languageCode,
      },
    },
    select: { id: true },
  });
  if (clash) {
    return Response.json(
      { error: `A ${draft.languageCode} template named "${draft.metaName}" already exists.` },
      { status: 409 }
    );
  }

  const placeholders = countPlaceholders(draft.body);

  const submitted = await submitTemplate({
    metaName: draft.metaName,
    languageCode: draft.languageCode,
    category: draft.category,
    body: draft.body,
    headerText: draft.headerText,
    footerText: draft.footerText,
    examples: draft.examples,
  });

  if (!submitted.ok) {
    return Response.json({ error: submitted.error ?? "Meta rejected the template." }, { status: 502 });
  }

  try {
    const template = await prisma.whatsappTemplate.create({
      data: {
        key: `${draft.metaName}:${draft.languageCode}`,
        metaName: draft.metaName,
        metaId: submitted.data?.id ?? null,
        name: draft.name,
        department: DEPARTMENT,
        languageCode: draft.languageCode,
        language: draft.languageCode.toLowerCase().startsWith("ur")
          ? "UR"
          : draft.languageCode.toLowerCase().startsWith("pa")
            ? "PA"
            : "EN",
        // Meta may re-categorise a template during review; the next sync
        // records whatever it decided.
        category: (submitted.data?.category as typeof draft.category) ?? draft.category,
        status: "PENDING",
        body: draft.body,
        headerText: draft.headerText || null,
        headerFormat: draft.headerText ? "TEXT" : null,
        footerText: draft.footerText || null,
        variables: Array.from(
          { length: placeholders },
          (_, index) => draft.variables?.[index]?.trim() || `Variable ${index + 1}`
        ),
        syncedAt: new Date(),
      },
    });

    await logEvent({
      action: "template.submitted",
      entity: "whatsappTemplate",
      entityId: template.id,
      message: `${session.name} submitted the template "${draft.metaName}" (${draft.languageCode}) to Meta for approval.`,
      metadata: { metaName: draft.metaName, category: draft.category },
      userId: session.sub,
    });

    return Response.json({ ok: true, id: template.id, status: "PENDING" });
  } catch (error) {
    // The template now exists in Meta but not here. Say so plainly — a sync
    // will pick it up, and a silent 500 would have someone submitting it twice.
    console.error("[admin:templates] local save failed after Meta accepted:", error);
    return Response.json(
      {
        error:
          "Meta accepted the template but it could not be saved locally. Run a sync to pull it in.",
      },
      { status: 500 }
    );
  }
}
