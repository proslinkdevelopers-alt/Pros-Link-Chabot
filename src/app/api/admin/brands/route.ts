import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { invalidateCatalog } from "@/lib/catalog";
import { fail, ok, readBody, uniqueViolation } from "@/lib/admin/http";
import { brandSchema } from "@/lib/admin/catalog-schemas";
import { freeSlug } from "@/lib/admin/catalog-writes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("products.manage", req);
  if ("response" in guard) return guard.response;
  const body = await readBody(req, brandSchema);
  if ("response" in body) return body.response;
  const { slug: requested, ...input } = body.data;

  try {
    const slug = requested || (await freeSlug("brand", input.name));
    const brand = await prisma.brand.create({ data: { ...input, slug, department: DEPARTMENT }, select: { id: true } });
    invalidateCatalog();
    await audit({
      action: "brand.created",
      entity: "Brand",
      entityId: brand.id,
      userId: guard.staff.id,
      message: `${guard.staff.name} added the brand "${input.name}".`,
      after: { ...input, slug },
      req,
    });
    return ok({ id: brand.id }, 201);
  } catch (error) {
    if (uniqueViolation(error)) return fail("Another brand already uses this URL name.", 409, { slug: "Already used." });
    console.error("[brands] create failed:", error);
    return fail("The brand could not be saved.", 500);
  }
}
