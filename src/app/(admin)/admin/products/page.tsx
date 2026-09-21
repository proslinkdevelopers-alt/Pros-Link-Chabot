import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePagePermission, hasPermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { PUBLISH_STATE_LABEL } from "@/lib/admin/labels";
import { AVAILABILITY_LABEL } from "@/lib/catalog-types";
import { AVAILABILITY } from "@/lib/admin/catalog-schemas";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Callout, DataTable, DbNotice, FilterBar, FilterChip, Muted, PageHeader, Pagination, RowTitle, SearchForm, StatusBadge } from "@/components/admin/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Products" };

const PAGE_SIZE = 25;

type Search = { q?: string; status?: string; category?: string; availability?: string; page?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await requirePagePermission("products.view", "/admin/products");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(params.status ?? "") ? params.status : undefined;
  const availability = (AVAILABILITY as readonly string[]).includes(params.availability ?? "") ? params.availability : undefined;
  const category = params.category || undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.ProductWhereInput = {
    ...OWN,
    ...(status ? { status: status as Prisma.EnumPublishStateFilter["equals"] } : { status: { not: "ARCHIVED" } }),
    ...(availability ? { availability: availability as Prisma.EnumProductAvailabilityFilter["equals"] } : {}),
    ...(category ? { categoryId: category === "none" ? null : category } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { model: { contains: q, mode: "insensitive" } },
            { keywords: { has: q.toLowerCase() } },
          ],
        }
      : {}),
  };

  const { data, error } = await safeQuery(
    async () => {
      const [rows, total, byStatus, categories] = await Promise.all([
        prisma.product.findMany({
          where,
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true, name: true, sku: true, model: true, availability: true, status: true, isFeatured: true, updatedAt: true, images: true,
            category: { select: { name: true } },
            brand: { select: { name: true, isVerified: true, isActive: true } },
          },
        }),
        prisma.product.count({ where }),
        prisma.product.groupBy({ by: ["status"], where: OWN, _count: true }),
        prisma.productCategory.findMany({ where: OWN, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
      ]);
      return { rows, total, byStatus, categories };
    },
    { rows: [], total: 0, byStatus: [], categories: [] }
  );

  const counts = Object.fromEntries(data.byStatus.map((entry) => [entry.status, entry._count])) as Record<string, number>;
  const published = counts.PUBLISHED ?? 0;
  const keep = { status, category, availability };
  const href = (changes: Partial<Search>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, ...keep, ...changes })) if (value) next.set(key, String(value));
    const query = next.toString();
    return `/admin/products${query ? `?${query}` : ""}`;
  };
  const canEdit = hasPermission(staff, "products.manage");

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="The products customers see on the site and the assistant can describe. Only published products are shown, with exactly the details entered here."
        actions={
          canEdit && (
            <Link href="/admin/products/new" className={buttonVariants({ variant: "brand", size: "sm" })}>
              <Plus /> Add product
            </Link>
          )
        }
      />
      <DbNotice error={error} />
      {!error && published === 0 && (
        <div className="mb-5">
          <Callout title="No products are published yet">
            Customers currently see the categories only, and the assistant offers a quotation instead of listing products. Add products with their confirmed
            specifications, then set them to Published.
          </Callout>
        </div>
      )}

      <FilterBar>
        <FilterChip href={href({ status: undefined, page: undefined })} label="Active" count={(counts.PUBLISHED ?? 0) + (counts.DRAFT ?? 0)} active={!status} />
        {(["PUBLISHED", "DRAFT", "ARCHIVED"] as const).map((value) => (
          <FilterChip key={value} href={href({ status: value, page: undefined })} label={PUBLISH_STATE_LABEL[value]} count={counts[value] ?? 0} active={status === value} />
        ))}
      </FilterBar>

      <SearchForm action="/admin/products" query={q} placeholder="Search name, model, SKU or search word" keep={{ status }}>
        <Select name="category" defaultValue={category ?? ""} className="w-auto min-w-[11rem] bg-card" aria-label="Category">
          <option value="">All categories</option>
          {data.categories.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
          <option value="none">No category</option>
        </Select>
        <Select name="availability" defaultValue={availability ?? ""} className="w-auto min-w-[11rem] bg-card" aria-label="Availability">
          <option value="">Any availability</option>
          {AVAILABILITY.map((value) => (
            <option key={value} value={value}>
              {AVAILABILITY_LABEL[value]}
            </option>
          ))}
        </Select>
      </SearchForm>

      <DataTable
        rows={data.rows}
        rowKey={(row) => row.id}
        empty={q || category || availability ? "No products match these filters." : "No products yet."}
        emptyHint={canEdit && !q ? "Add the first product with its confirmed specifications and availability." : undefined}
        columns={[
          {
            header: "Product",
            cell: (row) => (
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border bg-secondary text-[10px] text-muted-foreground">
                  {row.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- staff-entered URLs on any host
                    <img src={row.images[0]} alt="" className="size-full object-cover" />
                  ) : (
                    "—"
                  )}
                </span>
                <RowTitle href={`/admin/products/${row.id}`} title={row.name} sub={[row.model && `Model ${row.model}`, row.sku && `SKU ${row.sku}`].filter(Boolean).join(" · ") || undefined} />
              </div>
            ),
          },
          { header: "Category", cell: (row) => row.category?.name ?? <Muted>—</Muted> },
          {
            header: "Brand",
            cell: (row) =>
              row.brand ? (
                <span>
                  {row.brand.name}
                  {!(row.brand.isVerified && row.brand.isActive) && <span className="block text-[11px] text-amber-700">Not shown to customers</span>}
                </span>
              ) : (
                <Muted>—</Muted>
              ),
          },
          { header: "Availability", cell: (row) => <StatusBadge value={row.availability} label={AVAILABILITY_LABEL[row.availability]} /> },
          { header: "Status", cell: (row) => <StatusBadge value={row.status} label={`${PUBLISH_STATE_LABEL[row.status]}${row.isFeatured ? " · Featured" : ""}`} /> },
          { header: "Updated", cell: (row) => <Muted>{formatDate(row.updatedAt)}</Muted>, className: "whitespace-nowrap" },
        ]}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} href={(next) => href({ page: String(next) })} />
    </>
  );
}
