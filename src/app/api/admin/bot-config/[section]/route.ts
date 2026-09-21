import { NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/staff";
import { resetSection, saveSection } from "@/lib/bot/config";
import { SECTION_KEYS, type SectionKey } from "@/lib/bot/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chatbot Studio — save (PUT) or reset (DELETE) one configuration section.
 * Validation lives in `lib/bot/config.ts`; a refused save returns the reasons.
 */

function sectionOf(value: string): SectionKey | null {
  return SECTION_KEYS.includes(value as SectionKey) ? (value as SectionKey) : null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ section: string }> }) {
  const guard = await requireApiPermission("chatbot.manage", req);
  if ("response" in guard) return guard.response;

  const section = sectionOf((await params).section);
  if (!section) return Response.json({ error: "Unknown section." }, { status: 404 });

  const body = await req.json().catch(() => undefined);
  if (body === undefined) return Response.json({ ok: false, issues: ["The body is not valid JSON."] }, { status: 400 });

  try {
    const result = await saveSection(section, body, guard.staff.id);
    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    console.error("[bot-config] save failed:", error);
    return Response.json({ ok: false, issues: ["Could not save — is the database reachable?"] }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ section: string }> }) {
  const guard = await requireApiPermission("chatbot.manage", req);
  if ("response" in guard) return guard.response;

  const section = sectionOf((await params).section);
  if (!section) return Response.json({ error: "Unknown section." }, { status: 404 });

  try {
    await resetSection(section, guard.staff.id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[bot-config] reset failed:", error);
    return Response.json({ ok: false, issues: ["Could not reset — is the database reachable?"] }, { status: 500 });
  }
}
