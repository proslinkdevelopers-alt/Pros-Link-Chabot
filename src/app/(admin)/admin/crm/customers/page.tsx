import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { safeQuery } from "@/lib/admin/queries";
import { DataTable, DbNotice, PageHeader, StatusBadge } from "@/components/admin/ui";
import { formatDate, formatPkr } from "@/lib/utils";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requirePagePermission("customers.view", "/admin/crm/customers");

  const { data, error } = await safeQuery(
    () =>
      prisma.customer.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          _count: { select: { legacyProjects: true, leads: true, quotes: true } },
          legacyProjects: {
            select: { value: true, status: true },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
    []
  );

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Customers"
        description="Won leads become customers. Everything they've bought, been quoted and are currently having built sits here."
      />

      {error && <DbNotice error={error} />}

      <DataTable
        rows={data}
        rowKey={(row) => row.id}
        empty="No customers yet."
        columns={[
          {
            header: "Reference",
            cell: (row) => <span className="font-mono text-xs">{row.reference}</span>,
          },
          {
            header: "Customer",
            cell: (row) => (
              <div className="min-w-0">
                <p className="font-medium">{row.name}</p>
                {row.company && <p className="text-xs text-muted-foreground">{row.company}</p>}
              </div>
            ),
          },
          {
            header: "Contact",
            cell: (row) => (
              <div className="text-xs text-muted-foreground">
                <p>{row.phone}</p>
                <p className="break-all">{row.email ?? "—"}</p>
              </div>
            ),
          },
          {
            header: "Industry",
            cell: (row) => (
              <span className="text-xs text-muted-foreground">
                {row.industry ?? "—"}
                {row.city ? ` · ${row.city}` : ""}
              </span>
            ),
          },
          {
            header: "Engagement",
            cell: (row) => (
              <div className="text-xs text-muted-foreground">
                <p>{row._count.legacyProjects} projects</p>
                <p>
                  {row._count.leads} leads · {row._count.quotes} quotes
                </p>
              </div>
            ),
          },
          {
            header: "Lifetime value",
            cell: (row) => (
              <span className="text-xs font-medium">
                {formatPkr(
                  row.legacyProjects.reduce((sum, project) => sum + Number(project.value ?? 0), 0)
                )}
              </span>
            ),
          },
          {
            header: "Status",
            cell: (row) => <StatusBadge value={row.isActive ? "ACTIVE" : "INACTIVE"} />,
          },
          {
            header: "Since",
            cell: (row) => (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDate(row.createdAt)}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
