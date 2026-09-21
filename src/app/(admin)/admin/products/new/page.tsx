import { requirePagePermission } from "@/lib/staff";
import { safeQuery } from "@/lib/admin/queries";
import { catalogOptions } from "@/lib/admin/catalog-options";
import { DbNotice, PageHeader } from "@/components/admin/ui";
import { EMPTY_PRODUCT, ProductForm } from "@/components/admin/catalog/ProductForm";

export const metadata = { title: "Add product" };

export default async function NewProductPage() {
  await requirePagePermission("products.manage", "/admin/products/new");
  const { data, error } = await safeQuery(catalogOptions, { categories: [], brands: [], products: [] });

  return (
    <>
      <PageHeader
        back={{ href: "/admin/products", label: "Products" }}
        title="Add product"
        description="It is saved as a draft. Publish it when its details and specifications are confirmed."
      />
      <DbNotice error={error} />
      <ProductForm initial={EMPTY_PRODUCT} categories={data.categories} brands={data.brands} products={data.products} canEdit />
    </>
  );
}
