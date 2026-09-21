import { NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { saveCompanyProfile } from "@/lib/company";
import { fail, ok } from "@/lib/admin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save the company profile — the only source of the contact details the site
 * and the assistant give customers. Empty fields are simply not shown.
 */
export async function PUT(req: NextRequest) {
  const guard = await requireApiPermission("settings.manage", req);
  if ("response" in guard) return guard.response;

  const result = await saveCompanyProfile(await req.json().catch(() => null));
  if (!result.ok) {
    // Issues read "offices.0.phone: Too long" — the part before the colon is the field.
    const fields: Record<string, string> = {};
    for (const issue of result.issues) {
      const [path, ...message] = issue.split(": ");
      fields[path] ??= message.join(": ");
    }
    return fail(result.issues[0] ?? "Check the form.", 400, fields);
  }

  await audit({
    action: "settings.company_updated",
    entity: "Setting",
    entityId: "proslink.company",
    userId: guard.staff.id,
    message: `${guard.staff.name} updated the company profile.`,
    before: result.before as unknown as Record<string, unknown>,
    after: result.after as unknown as Record<string, unknown>,
    req,
  });
  return ok();
}
