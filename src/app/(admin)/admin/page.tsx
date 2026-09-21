import Link from "next/link";
import {
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  FolderKanban,
  GaugeCircle,
  LifeBuoy,
  MessagesSquare,
  Star,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { DbNotice, EmptyState, PageHeader, StatCard } from "@/components/admin/ui";
import { requirePagePermission } from "@/lib/staff";
import { dashboardStats } from "@/lib/admin/queries";
import { formatDateTime, formatPkr, humanise } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const session = await requirePagePermission("dashboard.view");
  const { data: stats, error } = await dashboardStats();

  return (
    <>
      <PageHeader
        eyebrow="BITSOL Marketing"
        title={`Good to see you, ${session.name.split(" ")[0]}`}
        description="The live state of the practice — conversations, pipeline, delivery and service, in one view."
        actions={
          <Link
            href="/chat"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-xs font-semibold shadow-soft transition hover:border-foreground/20"
          >
            Open assistant <ArrowUpRight className="size-3.5" />
          </Link>
        }
      />

      {error && <DbNotice error={error} />}

      {/* Headline figures */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="dark brand-gradient relative overflow-hidden border-white/[0.06] p-6 text-foreground lg:col-span-2">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
          <div className="relative grid gap-6 sm:grid-cols-3">
            <Headline
              label="Won pipeline value"
              value={formatPkr(stats.revenue)}
              hint={`${stats.wonLeads} deals won`}
            />
            <Headline
              label="Open pipeline"
              value={formatPkr(stats.openPipeline)}
              hint="Estimated value still in play"
            />
            <Headline
              label="Win rate"
              value={`${stats.conversionRate}%`}
              hint={`${stats.leads} leads all time`}
            />
          </div>
        </Card>

        <Card className="flex flex-col justify-between p-6">
          <div className="flex items-center gap-2">
            <Star className="size-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Client satisfaction</h2>
          </div>
          {stats.satisfaction > 0 ? (
            <div className="mt-4">
              <p className="text-4xl font-bold tracking-tight tabular-nums">
                {stats.satisfaction.toFixed(1)}
                <span className="text-base font-medium text-muted-foreground"> / 5</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Average rating across rated conversations.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              No ratings yet. Ratings are captured at the end of a conversation.
            </p>
          )}
          <Link
            href="/admin/reports"
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <GaugeCircle className="size-3.5" /> Open full reports
          </Link>
        </Card>
      </div>

      {/* Operating widgets */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Chats today"
          value={stats.todayChats}
          hint={`${stats.totalConversations} conversations all time`}
          icon={MessagesSquare}
          href="/admin/conversations"
        />
        <StatCard
          label="New leads"
          value={stats.newLeads}
          hint="Waiting for first contact"
          icon={Briefcase}
          href="/admin/crm/leads?stage=NEW"
        />
        <StatCard
          label="Upcoming meetings"
          value={stats.upcomingMeetings}
          icon={CalendarClock}
          href="/admin/meetings"
        />
        <StatCard
          label="Active projects"
          value={stats.activeProjects}
          icon={FolderKanban}
          href="/admin/catalogue/projects"
        />
        <StatCard
          label="Open tickets"
          value={stats.openTickets}
          icon={LifeBuoy}
          href="/admin/support/tickets"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        {/* Demand by service */}
        <Card className="p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Most requested services</h2>
            <TrendingUp className="size-4 text-muted-foreground" />
          </div>
          <RankedList rows={stats.popularServices} />
        </Card>

        {/* Activity feed */}
        <Card className="p-0 lg:col-span-3">
          <div className="flex items-center justify-between gap-2 border-b px-6 py-4">
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <Wallet className="size-4 text-muted-foreground" />
          </div>
          {stats.recentActivity.length ? (
            <ul className="divide-y">
              {stats.recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-6 py-3.5">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-cyan shadow-glow-cyan"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{humanise(entry.action)}</p>
                    {entry.message && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{entry.message}</p>
                    )}
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-6">
              <EmptyState
                message="No activity recorded yet."
                hint="Leads, tickets, meetings and escalations appear here as they happen."
              />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Headline({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-white">{value}</p>
      <p className="mt-1.5 text-xs text-white/55">{hint}</p>
    </div>
  );
}

function RankedList({ rows }: { rows: Array<{ label: string; count: number }> }) {
  if (!rows.length) {
    return <p className="text-xs text-muted-foreground">No service requests captured yet.</p>;
  }

  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-medium">
              {humanise(row.label)}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
              {row.count}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="bg-brand h-full rounded-full"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
