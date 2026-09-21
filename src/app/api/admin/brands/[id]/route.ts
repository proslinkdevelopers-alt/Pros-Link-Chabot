import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { invalidateCatalog } from "@/lib/catalog";
import { fail, notFound, ok, readBody, uniqueViolation } from "@/lib/admin/http";
import { brandSchema } from "@/lib/admin/catalog-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const FIELDS = { name: true, slug: true, description: true, website: true, logoUrl: true, isVerified: true, isActive: true, sortOrder: true, notes: true } as const;

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireApiPermission("products.manage", req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const body = await readBody(req, brandSchema.partial());
  if ("response" in body) return body.response;
  const { slug, ...rest } = body.data;
  const data = { ...rest, ...(slug ? { slug } : {}) };

  const before = await prisma.brand.findFirst({ where: { id, department: DEPARTMENT }, select: FIELDS });
  if (!before) return notFound();

  try {
    await prisma.brand.update({ where: { id }, data });
    invalidateCatalog();
    await audit({
      action: data.isVerified === true && !before.isVerified ? "brand.verified" : "brand.updated",
      entity: "Brand",
      entityId: id,
      userId: guard.staff.id,
      message: `${guard.staff.name} updated the brand "${data.name ?? before.name}".`,
      before,
      after: data,
      req,
    });
    return ok({ id });
  } catch (error) {
    if (uniqueViolation(error)) return fail("Another brand already uses this URL name.", 409, { slug: "Already used." });
    console.error("[brands] update failed:", error);
    return fail("The brand could not be saved.", 500);
  }
}

/** Delete a brand no product uses. Otherwise deactivate it. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requireApiPermission("products.manage", req);
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const brand = await prisma.brand.findFirst({ where: { id, department: DEPARTMENT }, select: { ...FIELDS, _count: { select: { products: true } } } });
  if (!brand) return notFound();
  if (brand._count.products > 0) {
    return fail(`"${brand.name}" is used by ${brand._count.products} product(s). Deactivate it instead, or change those products first.`, 409);
  }

  await prisma.brand.delete({ where: { id } });
  invalidateCatalog();
  const { _count: _unused, ...before } = brand;
  await audit({
    action: "brand.deleted",
    entity: "Brand",
    entityId: id,
    userId: guard.staff.id,
    message: `${guard.staff.name} deleted the brand "${brand.name}".`,
    before,
    after: { deleted: true },
    req,
  });
  return ok();
}
