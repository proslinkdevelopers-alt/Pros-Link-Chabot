import { Download } from "lucide-react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { delta, lastDays, perDay, sum } from "@/lib/admin/metrics";
import { PIPELINE_STAGES, QUOTE_STATUS_LABEL, SOURCE_LABEL, STAGE_LABEL, TICKET_CATEGORY_LABEL, TICKET_STATUS_LABEL } from "@/lib/admin/labels";
import { buttonVariants } from "@/components/ui/button";
import { DataTable, DbNotice, FilterBar, FilterChip, PageHeader, Section, StatCard } from "@/components/admin/ui";
import { BarList, TrendChart } from "@/components/admin/charts";
import { formatPkr } from "@/lib/utils";

export const metadata = { title: "Reports" };

const RANGES = [7, 30, 90] as const;

function hours(value: number | null): string {
  if (value === null) return "—";
  if (value < 1) return `${Math.round(value * 60)} min`;
  if (value < 48) return `${value.toFixed(1)} h`;
  return `${(value / 24).toFixed(1)} days`;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const staff = await requirePagePermission("reports.view", "/admin/reports");
  const { days: raw } = await searchParams;
  const days = RANGES.find((range) => String(range) === raw) ?? 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const before = new Date(Date.now() - 2 * days * 86_400_000);
  const labels = lastDays(days);
  const inPeriod = { ...OWN, createdAt: { gte: since } };

  const { data, error } = await safeQuery(
    async () => {
      const [
        leads, previousLeads, won, lost, quotes, ticketsRaised, ticketsResolved, resolution, leadsDaily, ticketsDaily, webDaily, whatsappDaily,
        bySource, byCategory, byStage, ticketsByCategory, ticketsByStatus, quotesByStatus, workload,
      ] = await Promise.all([
        prisma.lead.count({ where: inPeriod }),
        prisma.lead.count({ where: { ...OWN, createdAt: { gte: before, lt: since } } }),
        prisma.lead.aggregate({ where: { ...OWN, stage: "WON", updatedAt: { gte: since } }, _count: true, _sum: { estimatedValue: true } }),
        prisma.lead.count({ where: { ...OWN, stage: "LOST", updatedAt: { gte: since } } }),
        prisma.quote.count({ where: inPeriod }),
        prisma.ticket.count({ where: inPeriod }),
        prisma.ticket.count({ where: { ...OWN, resolvedAt: { gte: since } } }),
        prisma.$queryRaw<Array<{ avg: number | null }>>`
          SELECT avg(extract(epoch FROM ("resolvedAt" - "createdAt")) / 3600)::float AS avg
          FROM tickets WHERE "department"::text = ${DEPARTMENT} AND "resolvedAt" >= ${since.toISOString()}::timestamp`,
        perDay("leads", days),
        perDay("tickets", days),
        perDay("conversations", days, Prisma.sql`channel = 'WEB'`),
        perDay("conversations", days, Prisma.sql`channel = 'WHATSAPP'`),
        prisma.lead.groupBy({ by: ["source"], where: inPeriod, _count: true }),
        prisma.lead.groupBy({ by: ["subService"], where: { ...inPeriod, subService: { not: null } }, _count: true, orderBy: { _count: { subService: "desc" } }, take: 8 }),
        prisma.lead.groupBy({ by: ["stage"], where: inPeriod, _count: true }),
        prisma.ticket.groupBy({ by: ["category"], where: inPeriod, _count: true }),
        prisma.ticket.groupBy({ by: ["status"], where: inPeriod, _count: true }),
        prisma.quote.groupBy({ by: ["status"], where: inPeriod, _count: true }),
        prisma.$queryRaw<Array<{ id: string; name: string; open: bigint; resolved: bigint; avg: number | null }>>`
          SELECT u.id, u.name,
            count(*) FILTER (WHERE t.status IN ('OPEN','ASSIGNED','IN_PROGRESS','WAITING_CUSTOMER','TECHNICIAN_DISPATCHED')) AS open,
            count(*) FILTER (WHERE t."resolvedAt" >= ${since.toISOString()}::timestamp) AS resolved,
            (avg(extract(epoch FROM (t."resolvedAt" - t."createdAt")) / 3600) FILTER (WHERE t."resolvedAt" >= ${since.toISOString()}::timestamp))::float AS avg
          FROM tickets t JOIN users u ON u.id = t."assigneeId"
          WHERE t."department"::text = ${DEPARTMENT}
          GROUP BY u.id, u.name
          ORDER BY open DESC, resolved DESC
          LIMIT 20`,
      ]);
      return {
        leads, previousLeads, won, lost, quotes, ticketsRaised, ticketsResolved, resolution: resolution[0]?.avg ?? null, leadsDaily, ticketsDaily, webDaily,
        whatsappDaily, bySource, byCategory, byStage, ticketsByCategory, ticketsByStatus, quotesByStatus, workload,
      };
    },
    null
  );

  const decided = (data?.won._count ?? 0) + (data?.lost ?? 0);
  const winRate = decided ? Math.round(((data?.won._count ?? 0) / decided) * 100) : null;
  const stageCounts = new Map((data?.byStage ?? []).map((entry) => [entry.stage, entry._count]));
  const canExportLeads = hasPermission(staff, "leads.view");
  const canExportTickets = hasPermission(staff, "tickets.view");

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        description="Enquiries, sales results, service performance and conversations over a period. All figures come from the records in the console."
        actions={
          <>
            {canExportLeads && (
              <a href={`/api/admin/reports/export?type=leads&days=${days}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Download /> Leads CSV
              </a>
            )}
            {canExportTickets && (
              <a href={`/api/admin/reports/export?type=tickets&days=${days}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Download /> Tickets CSV
              </a>
            )}
          </>
        }
      />
      <DbNotice error={error ?? undefined} />
      <FilterBar>
        {RANGES.map((range) => (
          <FilterChip key={range} href={`/admin/reports?days=${range}`} label={`Last ${range} days`} active={days === range} />
        ))}
      </FilterBar>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Enquiries" value={data?.leads ?? 0} hint={delta(data?.leads ?? 0, data?.previousLeads ?? 0) ?? "None in the previous period either"} />
        <StatCard label="Quote requests" value={data?.quotes ?? 0} />
        <StatCard
          label="Won"
          value={data?.won._count ?? 0}
          hint={`${winRate === null ? "No decided leads" : `${winRate}% of decided leads`}${data?.won._sum.estimatedValue ? ` · ${formatPkr(Number(data.won._sum.estimatedValue))}` : ""}`}
        />
        <StatCard label="Tickets raised" value={data?.ticketsRaised ?? 0} hint={`${data?.ticketsResolved ?? 0} resolved · average ${hours(data?.resolution ?? null)} to resolve`} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Section title="Enquiries and tickets per day" description={`Last ${days} days, Pakistan time`}>
          <TrendChart
            label={`Enquiries and tickets per day over the last ${days} days`}
            labels={labels}
            series={[
              { name: "Enquiries", values: data?.leadsDaily ?? [], color: "blue" },
              { name: "Tickets", values: data?.ticketsDaily ?? [], color: "orange" },
            ]}
          />
        </Section>
        <Section title="Conversations per day" description={`${sum(data?.webDaily ?? [])} on the website · ${sum(data?.whatsappDaily ?? [])} on WhatsApp`}>
          <TrendChart
            label={`Website and WhatsApp conversations per day over the last ${days} days`}
            labels={labels}
            series={[
              { name: "Website", values: data?.webDaily ?? [], color: "blue" },
              { name: "WhatsApp", values: data?.whatsappDaily ?? [], color: "orange" },
            ]}
          />
        </Section>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Section title="Where enquiries came from">
          <BarList label="Enquiries by source" unit="enquiries" rows={(data?.bySource ?? []).map((entry) => ({ label: SOURCE_LABEL[entry.source] ?? entry.source, value: entry._count })).sort((a, b) => b.value - a.value)} />
        </Section>
        <Section title="What customers asked for">
          <BarList label="Enquiries by product or service" unit="enquiries" rows={(data?.byCategory ?? []).map((entry) => ({ label: entry.subService ?? "—", value: entry._count }))} />
        </Section>
        <Section title="Where this period's enquiries are now">
          <BarList label="Enquiries by current stage" unit="enquiries" rows={PIPELINE_STAGES.map((stage) => ({ label: STAGE_LABEL[stage], value: stageCounts.get(stage) ?? 0 }))} />
        </Section>
        <Section title="Tickets by type">
          <BarList label="Tickets by type" unit="tickets" rows={(data?.ticketsByCategory ?? []).map((entry) => ({ label: TICKET_CATEGORY_LABEL[entry.category] ?? entry.category, value: entry._count })).sort((a, b) => b.value - a.value)} />
        </Section>
        <Section title="Tickets by status">
          <BarList label="Tickets by status" unit="tickets" rows={(data?.ticketsByStatus ?? []).map((entry) => ({ label: TICKET_STATUS_LABEL[entry.status] ?? entry.status, value: entry._count }))} />
        </Section>
        <Section title="Quote requests by status">
          <BarList label="Quote requests by status" unit="quotes" rows={(data?.quotesByStatus ?? []).map((entry) => ({ label: QUOTE_STATUS_LABEL[entry.status] ?? entry.status, value: entry._count }))} />
        </Section>
      </div>

      <Section title="Service workload" description="Tickets held by each person, and how quickly they resolved them in this period." bodyClassName="p-0">
        <DataTable
          rows={data?.workload ?? []}
          rowKey={(row) => row.id}
          empty="No tickets are assigned yet."
          minWidth={520}
          columns={[
            { header: "Person", cell: (row) => <span className="font-medium">{row.name}</span> },
            { header: "Open tickets", cell: (row) => <span className="tabular-nums">{Number(row.open)}</span>, className: "text-right" },
            { header: "Resolved in period", cell: (row) => <span className="tabular-nums">{Number(row.resolved)}</span>, className: "text-right" },
            { header: "Average time to resolve", cell: (row) => hours(row.avg), className: "text-right" },
          ]}
        />
      </Section>
    </>
  );
}
