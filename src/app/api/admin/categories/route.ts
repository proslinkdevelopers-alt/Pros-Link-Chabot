import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { invalidateCatalog } from "@/lib/catalog";
import { fail, ok, readBody, uniqueViolation } from "@/lib/admin/http";
import { categorySchema } from "@/lib/admin/catalog-schemas";
import { freeSlug } from "@/lib/admin/catalog-writes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("products.manage", req);
  if ("response" in guard) return guard.response;
  const body = await readBody(req, categorySchema);
  if ("response" in body) return body.response;
  const { slug: requested, ...input } = body.data;

  try {
    const slug = requested || (await freeSlug("productCategory", input.name));
    const category = await prisma.productCategory.create({ data: { ...input, slug, department: DEPARTMENT }, select: { id: true } });
    invalidateCatalog();
    await audit({
      action: "category.created",
      entity: "ProductCategory",
      entityId: category.id,
      userId: guard.staff.id,
      message: `${guard.staff.name} added the category "${input.name}".`,
      after: { ...input, slug },
      req,
    });
    return ok({ id: category.id }, 201);
  } catch (error) {
    if (uniqueViolation(error)) return fail("Another category already uses this URL name.", 409, { slug: "Already used." });
    console.error("[categories] create failed:", error);
    return fail("The category could not be saved.", 500);
  }
}
