import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { DbNotice, EmptyState, PageHeader } from "@/components/admin/ui";
import { CategoryManager } from "@/components/admin/catalog/CategoryManager";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const staff = await requirePagePermission("products.view", "/admin/categories");
  const { data, error } = await safeQuery(
    () =>
      prisma.productCategory.findMany({
        where: OWN,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { products: true } }, products: { where: { status: "PUBLISHED" }, select: { id: true } } },
      }),
    []
  );

  const rows = data.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    products: category._count.products,
    published: category.products.length,
  }));
  const canEdit = hasPermission(staff, "products.manage");

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Categories"
        description="The product groups shown on the site, in the assistant's Products menu and in quote requests. Hidden categories stay in the records but are not offered to customers."
      />
      <DbNotice error={error} />
      {rows.length || canEdit ? <CategoryManager rows={rows} canEdit={canEdit} /> : <EmptyState message="No categories yet." />}
    </>
  );
}
