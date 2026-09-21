import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { Callout, DbNotice, PageHeader } from "@/components/admin/ui";
import { BrandManager } from "@/components/admin/catalog/BrandManager";

export const metadata = { title: "Brands" };

export default async function BrandsPage() {
  const staff = await requirePagePermission("products.view", "/admin/brands");
  const { data, error } = await safeQuery(
    () => prisma.brand.findMany({ where: OWN, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } }),
    []
  );
  const rows = data.map(({ _count, ...brand }) => ({ ...brand, products: _count.products }));
  const unverified = rows.filter((row) => !row.isVerified).length;

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Brands"
        description="Manufacturers Pros-Link carries. A brand appears on the site and in the assistant's answers only when it is verified and active."
      />
      <DbNotice error={error} />
      {unverified > 0 && (
        <div className="mb-5">
          <Callout title={`${unverified} brand${unverified === 1 ? " is" : "s are"} waiting for verification`} tone="warning">
            Confirm each partnership before ticking Verified and Active. Until then customers never see these names.
          </Callout>
        </div>
      )}
      <BrandManager rows={rows} canEdit={hasPermission(staff, "products.manage")} />
    </>
  );
}
