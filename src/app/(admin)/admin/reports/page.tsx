import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { dashboardStats, OWN, OWN_OR_GLOBAL, safeQuery } from "@/lib/admin/queries";
import { DbNotice, PageHeader, StatCard } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { MessagesSquare, Percent, Timer, TrendingUp } from "lucide-react";
import { findService } from "@/data/marketing/services";
import { humanise } from "@/lib/utils";

export const metadata = { title: "Reports & Analytics" };

const DAYS = 30;

export default async function ReportsPage() {
  await requireAdmin("/admin/reports");
  const since = new Date();
  since.setDate(since.getDate() - DAYS);
  since.setHours(0, 0, 0, 0);

  const [{ data: stats, error: statsError }, { data: trends, error: trendError }] =
    await Promise.all([
      dashboardStats(),
      safeQuery(
        async () => {
          const [conversations, leadStages, leadSources, ticketStatuses, latency] =
            await Promise.all([
              prisma.conversation.findMany({
                where: { ...OWN_OR_GLOBAL, createdAt: { gte: since } },
                select: { createdAt: true },
              }),
              prisma.lead.groupBy({ by: ["stage"], _count: { _all: true } }),
              prisma.lead.groupBy({ by: ["source"], _count: { _all: true } }),
              prisma.ticket.groupBy({
                by: ["status"],
                _count: { _all: true },
                where: OWN,
              }),
              prisma.message.aggregate({
                where: {
                  role: "ASSISTANT",
                  createdAt: { gte: since },
                  latencyMs: { not: null },
                  ...OWN_OR_GLOBAL,
                },
                _avg: { latencyMs: true },
              }),
            ]);
          return {
            conversations,
            leadStages,
            leadSources,
            ticketStatuses,
            avgLatency: Math.round(latency._avg.latencyMs ?? 0),
          };
        },
        {
          conversations: [] as Array<{ createdAt: Date }>,
          leadStages: [] as Array<{ stage: string; _count: { _all: number } }>,
          leadSources: [] as Array<{ source: string; _count: { _all: number } }>,
          ticketStatuses: [] as Array<{ status: string; _count: { _all: number } }>,
          avgLatency: 0,
        }
      ),
    ]);

  // Bucket conversations per day for the bar chart.
  const buckets = new Map<string, number>();
  for (let i = DAYS - 1; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    buckets.set(day.toISOString().slice(0, 10), 0);
  }
  for (const conversation of trends.conversations) {
    const key = conversation.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const series = Array.from(buckets.entries());
  const peak = Math.max(1, ...series.map(([, count]) => count));

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Reports & Analytics"
        description={`Performance across the last ${DAYS} days.`}
      />

      {(statsError || trendError) && <DbNotice error={statsError ?? trendError} />}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Conversations"
          value={trends.conversations.length}
          hint={`Last ${DAYS} days`}
          icon={MessagesSquare}
        />
        <StatCard
          label="Win rate"
          value={`${stats.conversionRate}%`}
          hint="Won ÷ all leads"
          icon={TrendingUp}
        />
        <StatCard
          label="Avg response time"
          value={trends.avgLatency ? `${(trends.avgLatency / 1000).toFixed(1)}s` : "—"}
          hint="Assistant first-to-last token"
          icon={Timer}
        />
        <StatCard
          label="Satisfaction"
          value={stats.satisfaction ? `${stats.satisfaction.toFixed(1)} / 5` : "—"}
          icon={Percent}
        />
      </div>

      <Card className="mb-6 p-6">
        <h2 className="mb-5 text-sm font-semibold">Conversations per day</h2>
        <div className="flex h-36 items-end gap-[3px]">
          {series.map(([date, count]) => (
            <div
              key={date}
              title={`${date}: ${count}`}
              className="bg-brand flex-1 rounded-t opacity-75 transition-opacity hover:opacity-100"
              style={{ height: `${Math.max(2, (count / peak) * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          <span>{series[0]?.[0]}</span>
          <span>{series[series.length - 1]?.[0]}</span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Breakdown
          title="Sales pipeline"
          rows={trends.leadStages.map((r) => ({ label: r.stage, count: r._count._all }))}
        />
        <Breakdown
          title="Lead sources"
          rows={trends.leadSources.map((r) => ({ label: r.source, count: r._count._all }))}
        />
        <Breakdown
          title="Most requested services"
          rows={stats.popularServices.map((r) => ({
            label: findService(r.label)?.name ?? r.label,
            count: r.count,
          }))}
        />
        <Breakdown
          title="Support tickets"
          rows={trends.ticketStatuses.map((r) => ({ label: r.status, count: r._count._all }))}
        />
      </div>
    </>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0) || 1;

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{humanise(row.label)}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {row.count} · {Math.round((row.count / total) * 100)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="bg-brand h-full rounded-full"
                  style={{ width: `${(row.count / total) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      )}
    </Card>
  );
}
