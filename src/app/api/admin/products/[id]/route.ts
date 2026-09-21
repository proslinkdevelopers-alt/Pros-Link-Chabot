import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { invalidateCatalog } from "@/lib/catalog";
import { fail, notFound, ok, readBody, uniqueViolation } from "@/lib/admin/http";
import { productSchema } from "@/lib/admin/catalog-schemas";
import { productData, productReferenceProblems } from "@/lib/admin/catalog-writes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const AUDITED = {
  name: true, slug: true, sku: true, model: true, categoryId: true, brandId: true, summary: true, description: true,
  images: true, features: true, specifications: true, documents: true, availability: true, status: true,
  isFeatured: true, sortOrder: true, keywords: true, relatedIds: true,
} as const;

/** Update a product — the full form, or a single field such as its status. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireApiPermission("products.manage", req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const body = await readBody(req, productSchema.partial());
  if ("response" in body) return body.response;
  const input = body.data;

  const before = await prisma.product.findFirst({ where: { id, department: DEPARTMENT }, select: AUDITED });
  if (!before) return notFound();

  const problems = await productReferenceProblems(input, id);
  if (problems) return fail(Object.values(problems)[0], 400, problems);

  try {
    const data = productData(input);
    if (input.slug) data.slug = input.slug;
    await prisma.product.update({ where: { id }, data });
    invalidateCatalog();
    await audit({
      action: "product.updated",
      entity: "Product",
      entityId: id,
      userId: guard.staff.id,
      message: `${guard.staff.name} updated the product "${input.name ?? before.name}".`,
      before,
      after: { ...data } as Record<string, unknown>,
      req,
    });
    return ok({ id });
  } catch (error) {
    const fields = uniqueViolation(error);
    if (fields?.includes("sku")) return fail("Another product already has this SKU.", 409, { sku: "Already used by another product." });
    if (fields?.includes("slug")) return fail("Another product already uses this URL name.", 409, { slug: "Already used by another product." });
    console.error("[products] update failed:", error);
    return fail("The product could not be saved.", 500);
  }
}

/**
 * Delete a product that nothing refers to. A product named on a lead, quote,
 * ticket or customer's machine is kept for that history — archive it instead.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requireApiPermission("products.manage", req);
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, department: DEPARTMENT },
    select: { name: true, slug: true, status: true, _count: { select: { leads: true, quotes: true, tickets: true, assets: true } } },
  });
  if (!product) return notFound();
  const uses = Object.values(product._count).reduce((sum, count) => sum + count, 0);
  if (uses > 0) {
    return fail(`"${product.name}" is referenced by ${uses} lead, quote, ticket or customer record(s). Archive it instead, so that history stays intact.`, 409);
  }

  try {
    await prisma.$transaction([
      prisma.product.delete({ where: { id } }),
      // Drop it from other products' related lists.
      prisma.$executeRaw`UPDATE products SET "relatedIds" = array_remove("relatedIds", ${id}) WHERE "department"::text = ${DEPARTMENT} AND ${id} = ANY("relatedIds")`,
    ]);
    invalidateCatalog();
    await audit({
      action: "product.deleted",
      entity: "Product",
      entityId: id,
      userId: guard.staff.id,
      message: `${guard.staff.name} deleted the product "${product.name}".`,
      before: { name: product.name, slug: product.slug, status: product.status },
      after: { deleted: true },
      req,
    });
    return ok();
  } catch (error) {
    console.error("[products] delete failed:", error);
    return fail("The product could not be deleted.", 500);
  }
}
