import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { slugify } from "./http";
import type { ProductInput } from "./catalog-schemas";

/**
 * Checks and conversions shared by the catalogue routes: references must
 * point at this tenant's records, and slugs stay unique within it.
 */

/** A problem with the references in a product, keyed by field, or null. */
export async function productReferenceProblems(input: Partial<ProductInput>, selfId?: string): Promise<Record<string, string> | null> {
  const problems: Record<string, string> = {};
  const [category, brand, related] = await Promise.all([
    input.categoryId ? prisma.productCategory.findFirst({ where: { id: input.categoryId, department: DEPARTMENT }, select: { id: true } }) : true,
    input.brandId ? prisma.brand.findFirst({ where: { id: input.brandId, department: DEPARTMENT }, select: { id: true } }) : true,
    input.relatedIds?.length
      ? prisma.product.count({ where: { id: { in: input.relatedIds }, department: DEPARTMENT } })
      : input.relatedIds?.length ?? 0,
  ]);
  if (!category) problems.categoryId = "Choose a category from the list.";
  if (!brand) problems.brandId = "Choose a brand from the list.";
  if (input.relatedIds?.length) {
    if (selfId && input.relatedIds.includes(selfId)) problems.relatedIds = "A product cannot be related to itself.";
    else if (related !== new Set(input.relatedIds).size) problems.relatedIds = "One of the related products no longer exists.";
  }
  return Object.keys(problems).length ? problems : null;
}

/** A slug for `name` that no other row of `table` in this tenant uses. */
export async function freeSlug(table: "product" | "productCategory" | "brand", name: string, exceptId?: string): Promise<string> {
  const base = slugify(name) || "item";
  for (let n = 1; n < 200; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const where = { department: DEPARTMENT, slug, ...(exceptId ? { NOT: { id: exceptId } } : {}) };
    const taken =
      table === "product"
        ? await prisma.product.count({ where })
        : table === "productCategory"
          ? await prisma.productCategory.count({ where })
          : await prisma.brand.count({ where });
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Form values as Prisma column values. */
export function productData(input: Partial<ProductInput>): Prisma.ProductUncheckedUpdateInput {
  const data: Prisma.ProductUncheckedUpdateInput = {};
  const assign = <K extends keyof ProductInput>(key: K, value: unknown) => {
    if (input[key] !== undefined) (data as Record<string, unknown>)[key] = value;
  };
  assign("name", input.name);
  assign("sku", input.sku);
  assign("model", input.model);
  assign("categoryId", input.categoryId);
  assign("brandId", input.brandId);
  assign("summary", input.summary);
  assign("description", input.description);
  assign("images", input.images);
  assign("features", input.features);
  assign("specifications", input.specifications as Prisma.InputJsonValue);
  assign("documents", input.documents as Prisma.InputJsonValue);
  assign("availability", input.availability);
  assign("status", input.status);
  assign("isFeatured", input.isFeatured);
  assign("sortOrder", input.sortOrder);
  assign("keywords", input.keywords?.map((keyword) => keyword.toLowerCase()));
  assign("relatedIds", input.relatedIds ? [...new Set(input.relatedIds)] : undefined);
  return data;
}
