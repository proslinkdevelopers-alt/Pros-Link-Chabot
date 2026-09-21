import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { catalogOptions } from "@/lib/admin/catalog-options";
import { PUBLISH_STATE_LABEL } from "@/lib/admin/labels";
import { DbNotice, PageHeader, StatusBadge } from "@/components/admin/ui";
import { ProductForm, type ProductFormValues } from "@/components/admin/catalog/ProductForm";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Product" };

function pairs<A extends string, B extends string>(value: unknown, a: A, b: B): Array<Record<A | B, string>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({ [a]: String(item[a] ?? ""), [b]: String(item[b] ?? "") }) as Record<A | B, string>);
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requirePagePermission("products.view", `/admin/products/${id}`);

  const { data, error } = await safeQuery(
    async () => {
      const [product, options] = await Promise.all([prisma.product.findFirst({ where: { id, ...OWN } }), catalogOptions()]);
      return { product, options };
    },
    { product: null, options: { categories: [], brands: [], products: [] } }
  );
  if (!error && !data.product) notFound();
  const product = data.product;

  const initial: ProductFormValues | null = product
    ? {
        name: product.name,
        slug: product.slug,
        sku: product.sku ?? "",
        model: product.model ?? "",
        categoryId: product.categoryId ?? "",
        brandId: product.brandId ?? "",
        summary: product.summary ?? "",
        description: product.description ?? "",
        images: product.images,
        features: product.features,
        specifications: pairs(product.specifications, "label", "value"),
        documents: pairs(product.documents, "title", "url"),
        availability: product.availability,
        status: product.status,
        isFeatured: product.isFeatured,
        sortOrder: product.sortOrder,
        keywords: product.keywords,
        relatedIds: product.relatedIds,
      }
    : null;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/products", label: "Products" }}
        title={product?.name ?? "Product"}
        description={product ? <>Last changed {formatDateTime(product.updatedAt)}</> : undefined}
        actions={product && <StatusBadge value={product.status} label={PUBLISH_STATE_LABEL[product.status]} />}
      />
      <DbNotice error={error} />
      {initial && (
        <ProductForm
          productId={id}
          initial={initial}
          categories={data.options.categories}
          brands={data.options.brands}
          products={data.options.products}
          canEdit={hasPermission(staff, "products.manage")}
        />
      )}
    </>
  );
}
