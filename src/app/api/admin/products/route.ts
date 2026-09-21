import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { invalidateCatalog } from "@/lib/catalog";
import { fail, ok, readBody, uniqueViolation } from "@/lib/admin/http";
import { productSchema } from "@/lib/admin/catalog-schemas";
import { freeSlug, productData, productReferenceProblems } from "@/lib/admin/catalog-writes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a product. New products start as drafts unless published explicitly. */
export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("products.manage", req);
  if ("response" in guard) return guard.response;
  const body = await readBody(req, productSchema);
  if ("response" in body) return body.response;
  const input = body.data;

  const problems = await productReferenceProblems(input);
  if (problems) return fail(Object.values(problems)[0], 400, problems);

  try {
    const slug = input.slug || (await freeSlug("product", input.name));
    const product = await prisma.product.create({
      data: { ...(productData(input) as Prisma.ProductUncheckedCreateInput), name: input.name, slug, department: DEPARTMENT },
      select: { id: true, name: true, slug: true, status: true },
    });
    invalidateCatalog();
    await audit({
      action: "product.created",
      entity: "Product",
      entityId: product.id,
      userId: guard.staff.id,
      message: `${guard.staff.name} added the product "${product.name}".`,
      after: { name: product.name, slug, status: product.status, availability: input.availability },
      req,
    });
    return ok({ id: product.id }, 201);
  } catch (error) {
    const fields = uniqueViolation(error);
    if (fields?.includes("sku")) return fail("Another product already has this SKU.", 409, { sku: "Already used by another product." });
    if (fields?.includes("slug")) return fail("Another product already uses this URL name.", 409, { slug: "Already used by another product." });
    console.error("[products] create failed:", error);
    return fail("The product could not be saved.", 500);
  }
}
