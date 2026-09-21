import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { invalidateCatalog } from "@/lib/catalog";
import { fail, notFound, ok, readBody, uniqueViolation } from "@/lib/admin/http";
import { categorySchema } from "@/lib/admin/catalog-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const FIELDS = { name: true, slug: true, description: true, icon: true, sortOrder: true, isActive: true } as const;

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireApiPermission("products.manage", req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const body = await readBody(req, categorySchema.partial());
  if ("response" in body) return body.response;
  const { slug, ...rest } = body.data;
  const data = { ...rest, ...(slug ? { slug } : {}) };

  const before = await prisma.productCategory.findFirst({ where: { id, department: DEPARTMENT }, select: FIELDS });
  if (!before) return notFound();

  try {
    await prisma.productCategory.update({ where: { id }, data });
    invalidateCatalog();
    await audit({
      action: "category.updated",
      entity: "ProductCategory",
      entityId: id,
      userId: guard.staff.id,
      message: `${guard.staff.name} updated the category "${data.name ?? before.name}".`,
      before,
      after: data,
      req,
    });
    return ok({ id });
  } catch (error) {
    if (uniqueViolation(error)) return fail("Another category already uses this URL name.", 409, { slug: "Already used." });
    console.error("[categories] update failed:", error);
    return fail("The category could not be saved.", 500);
  }
}

/** Delete an empty category. One with products, leads or quotes is hidden instead. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requireApiPermission("products.manage", req);
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const category = await prisma.productCategory.findFirst({
    where: { id, department: DEPARTMENT },
    select: { ...FIELDS, _count: { select: { products: true, leads: true, quotes: true } } },
  });
  if (!category) return notFound();
  const { products, leads, quotes } = category._count;
  if (products + leads + quotes > 0) {
    return fail(
      `"${category.name}" has ${products} product(s) and is named on ${leads + quotes} lead or quote record(s). Hide it (untick Active) instead, or move its products first.`,
      409
    );
  }

  await prisma.productCategory.delete({ where: { id } });
  invalidateCatalog();
  const { _count: _unused, ...before } = category;
  await audit({
    action: "category.deleted",
    entity: "ProductCategory",
    entityId: id,
    userId: guard.staff.id,
    message: `${guard.staff.name} deleted the category "${category.name}".`,
    before,
    after: { deleted: true },
    req,
  });
  return ok();
}
