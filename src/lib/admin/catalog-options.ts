import { prisma } from "@/lib/db";
import { OWN } from "./queries";

/** Choices for the product form: every category, brand and product in this tenant. */
export async function catalogOptions() {
  const [categories, brands, products] = await Promise.all([
    prisma.productCategory.findMany({ where: OWN, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, isActive: true } }),
    prisma.brand.findMany({ where: OWN, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, isActive: true, isVerified: true } }),
    prisma.product.findMany({ where: { ...OWN, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, note: c.isActive ? undefined : "hidden" })),
    brands: brands.map((b) => ({ id: b.id, name: b.name, note: b.isVerified && b.isActive ? undefined : "not shown to customers" })),
    products,
  };
}
