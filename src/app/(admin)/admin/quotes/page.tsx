import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { safeQuery } from "@/lib/admin/queries";
import { DataTable, DbNotice, PageHeader, StatCard, StatusBadge } from "@/components/admin/ui";
import { FileCheck2, ReceiptText, Send } from "lucide-react";
import { formatDate, formatPkr } from "@/lib/utils";

export const metadata = { title: "Quotations" };

export default async function QuotesPage() {
  await requirePagePermission("quotes.view", "/admin/quotes");

  const { data, error } = await safeQuery(
    async () => {
      const [quotes, sent, accepted, pipeline] = await Promise.all([
        prisma.quote.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            customer: { select: { name: true, company: true } },
            lead: { select: { reference: true, name: true } },
          },
        }),
        prisma.quote.count({ where: { status: "SENT" } }),
        prisma.quote.count({ where: { status: "ACCEPTED" } }),
        prisma.quote.aggregate({
          where: { status: { in: ["SENT", "ACCEPTED"] } },
          _sum: { total: true },
        }),
      ]);
      return { quotes, sent, accepted, pipeline: Number(pipeline._sum.total ?? 0) };
    },
    { quotes: [], sent: 0, accepted: 0, pipeline: 0 }
  );

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Quotations"
        description="Written quotations raised against leads and customers. The assistant never quotes a final price — this is where the real number is issued."
      />

      {error && <DbNotice error={error} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Sent" value={data.sent} icon={Send} />
        <StatCard label="Accepted" value={data.accepted} icon={FileCheck2} />
        <StatCard
          label="Value in play"
          value={formatPkr(data.pipeline)}
          hint="Sent + accepted"
          icon={ReceiptText}
        />
      </div>

      <DataTable
        rows={data.quotes}
        rowKey={(row) => row.id}
        empty="No quotations raised yet."
        columns={[
          {
            header: "Reference",
            cell: (row) => <span className="font-mono text-xs">{row.reference}</span>,
          },
          {
            header: "Title",
            cell: (row) => <span className="text-sm font-medium">{row.title}</span>,
          },
          {
            header: "For",
            cell: (row) => (
              <div className="text-xs">
                <p className="font-medium">
                  {row.customer?.name ?? row.lead?.name ?? "—"}
                </p>
                <p className="text-muted-foreground">
                  {row.customer?.company ?? row.lead?.reference ?? ""}
                </p>
              </div>
            ),
          },
          { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
          {
            header: "Total",
            cell: (row) => (
              <span className="text-xs font-medium">
                {row.currency} {formatPkr(Number(row.total)).replace("PKR ", "")}
              </span>
            ),
          },
          {
            header: "Valid until",
            cell: (row) => (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDate(row.validUntil)}
              </span>
            ),
          },
          {
            header: "Created",
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
