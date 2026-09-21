import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { safeQuery } from "@/lib/admin/queries";
import { DataTable, DbNotice, PageHeader, StatCard, StatusBadge } from "@/components/admin/ui";
import { FolderKanban, Truck, Wallet } from "lucide-react";
import { formatDate, formatPkr, truncate } from "@/lib/utils";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await requireAdmin("/admin/catalogue/projects");

  const { data, error } = await safeQuery(
    async () => {
      const [projects, inFlight, delivered, value] = await Promise.all([
        prisma.legacyProject.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            customer: { select: { name: true, company: true } },
            service: { select: { name: true } },
          },
        }),
        prisma.legacyProject.count({
          where: { status: { in: ["DISCOVERY", "IN_PROGRESS", "REVIEW"] } },
        }),
        prisma.legacyProject.count({ where: { status: "DELIVERED" } }),
        prisma.legacyProject.aggregate({ _sum: { value: true } }),
      ]);
      return { projects, inFlight, delivered, value: Number(value._sum.value ?? 0) };
    },
    { projects: [], inFlight: 0, delivered: 0, value: 0 }
  );

  return (
    <>
      <PageHeader
        eyebrow="Practice"
        title="Projects"
        description="Delivery pipeline for won work — what's in discovery, in build, in review and shipped."
      />

      {error && <DbNotice error={error} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="In flight" value={data.inFlight} icon={FolderKanban} />
        <StatCard label="Delivered" value={data.delivered} icon={Truck} />
        <StatCard
          label="Total contracted"
          value={formatPkr(data.value)}
          icon={Wallet}
        />
      </div>

      <DataTable
        rows={data.projects}
        rowKey={(row) => row.id}
        empty="No projects yet. Convert a won lead into a project to start tracking delivery."
        columns={[
          {
            header: "Reference",
            cell: (row) => <span className="font-mono text-xs">{row.reference}</span>,
          },
          {
            header: "Project",
            cell: (row) => (
              <div className="min-w-0 max-w-xs">
                <p className="font-medium">{row.title}</p>
                {row.summary && (
                  <p className="text-xs text-muted-foreground">{truncate(row.summary, 90)}</p>
                )}
              </div>
            ),
          },
          {
            header: "Customer",
            cell: (row) => (
              <div className="text-xs">
                <p className="font-medium">{row.customer?.name ?? "—"}</p>
                <p className="text-muted-foreground">{row.customer?.company ?? ""}</p>
              </div>
            ),
          },
          {
            header: "Service",
            cell: (row) => (
              <span className="text-xs text-muted-foreground">{row.service?.name ?? "—"}</span>
            ),
          },
          { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
          {
            header: "Value",
            cell: (row) => (
              <span className="text-xs font-medium">{formatPkr(Number(row.value ?? 0))}</span>
            ),
          },
          {
            header: "Due",
            cell: (row) => (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDate(row.dueDate)}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
