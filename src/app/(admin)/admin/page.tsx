import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { delta, lastDays, perDay } from "@/lib/admin/metrics";
import {
  MEETING_MODE_LABEL,
  OPEN_STAGES,
  OPEN_TICKET_STATUSES,
  PIPELINE_STAGES,
  PRIORITY_LABEL,
  SOURCE_LABEL,
  STAGE_LABEL,
  TICKET_STATUS_LABEL,
} from "@/lib/admin/labels";
import { DbNotice, PageHeader, Section, StatCard, StatusBadge } from "@/components/admin/ui";
import { BarList, TrendChart } from "@/components/admin/charts";
import { CompleteButton } from "@/components/admin/client/controls";
import { formatDate, formatDateTime, formatPkr } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

const DAYS = 30;

export default async function DashboardPage() {
  const staff = await requirePagePermission("dashboard.view", "/admin");
  const may = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(staff, permission);
  const sales = may("leads.view");
  const service = may("tickets.view") || may("tickets.view_assigned");
  const ownTicketsOnly = !may("tickets.view");
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const labels = lastDays(DAYS);
  const ticketScope: Prisma.TicketWhereInput = { ...OWN, ...(ownTicketsOnly ? { assigneeId: staff.id } : {}) };

  const { data, error } = await safeQuery(
    async () => {
      const [
        leadsThisWeek, leadsLastWeek, openQuotes, openTickets, urgentTickets, unread, wonThisMonth, leadsDaily, ticketsDaily, byStage, bySource,
        latestLeads, attention, appointments, followUps,
      ] = await Promise.all([
        sales ? prisma.lead.count({ where: { ...OWN, createdAt: { gte: weekAgo } } }) : 0,
        sales ? prisma.lead.count({ where: { ...OWN, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }) : 0,
        may("quotes.view") ? prisma.quote.count({ where: { ...OWN, status: { in: ["REQUESTED", "DRAFT"] } } }) : 0,
        service ? prisma.ticket.count({ where: { ...ticketScope, status: { in: [...OPEN_TICKET_STATUSES] } } }) : 0,
        service ? prisma.ticket.count({ where: { ...ticketScope, status: { in: [...OPEN_TICKET_STATUSES] }, priority: { in: ["URGENT", "HIGH"] } } }) : 0,
        may("conversations.view")
          ? prisma.$queryRaw<Array<{ count: bigint }>>`
              SELECT count(*) AS count FROM conversations WHERE "department"::text = ${DEPARTMENT} AND status = 'OPEN'
                AND "lastInboundAt" IS NOT NULL AND ("readAt" IS NULL OR "readAt" < "lastInboundAt")`.then((rows) => Number(rows[0]?.count ?? 0))
          : 0,
        sales ? prisma.lead.aggregate({ where: { ...OWN, stage: "WON", updatedAt: { gte: monthStart } }, _count: true, _sum: { estimatedValue: true } }) : null,
        sales ? perDay("leads", DAYS) : [],
        service ? perDay("tickets", DAYS, ownTicketsOnly ? Prisma.sql`"assigneeId" = ${staff.id}` : undefined) : [],
        sales ? prisma.lead.groupBy({ by: ["stage"], where: { ...OWN, stage: { in: [...PIPELINE_STAGES] } }, _count: true }) : [],
        sales ? prisma.lead.groupBy({ by: ["source"], where: { ...OWN, createdAt: { gte: new Date(now.getTime() - DAYS * 86_400_000) } }, _count: true }) : [],
        sales
          ? prisma.lead.findMany({
              where: { ...OWN, stage: { in: [...OPEN_STAGES] } },
              orderBy: { createdAt: "desc" },
              take: 6,
              select: { id: true, name: true, company: true, subService: true, stage: true, createdAt: true },
            })
          : [],
        service
          ? prisma.ticket.findMany({
              where: { ...ticketScope, status: { in: [...OPEN_TICKET_STATUSES] } },
              orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
              take: 6,
              select: { id: true, reference: true, subject: true, status: true, priority: true, city: true, createdAt: true },
            })
          : [],
        may("appointments.view")
          ? prisma.meeting.findMany({
              where: { ...OWN, preferredDate: { gte: new Date(labels.at(-1)! + "T00:00:00Z") }, status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] } },
              orderBy: { preferredDate: "asc" },
              take: 5,
              select: { id: true, name: true, businessName: true, mode: true, status: true, preferredDate: true, preferredTime: true },
            })
          : [],
        prisma.crmActivity.findMany({
          where: { department: DEPARTMENT, ownerId: staff.id, type: { in: ["FOLLOW_UP", "REMINDER"] }, completedAt: null, dueAt: { lte: new Date(now.getTime() + 3 * 86_400_000) } },
          orderBy: { dueAt: "asc" },
          take: 8,
          select: { id: true, body: true, dueAt: true, entityType: true, entityId: true },
        }),
      ]);
      return { leadsThisWeek, leadsLastWeek, openQuotes, openTickets, urgentTickets, unread, wonThisMonth, leadsDaily, ticketsDaily, byStage, bySource, latestLeads, attention, appointments, followUps };
    },
    null
  );

  const stageCounts = new Map((data?.byStage ?? []).map((entry) => [entry.stage, entry._count]));
  const recordHref: Record<string, string> = { Lead: "/admin/leads/", Customer: "/admin/customers/", Ticket: "/admin/tickets/", Quote: "/admin/quotes/", Conversation: "/admin/conversations/" };
  const trendSeries = [
    ...(sales ? [{ name: "Enquiries", values: data?.leadsDaily ?? [], color: "blue" as const }] : []),
    ...(service ? [{ name: ownTicketsOnly ? "My tickets" : "Tickets", values: data?.ticketsDaily ?? [], color: "orange" as const }] : []),
  ];

  return (
    <>
      <PageHeader eyebrow="Pros-Link Admin" title={`Welcome, ${staff.name.split(" ")[0]}`} description="What needs attention today across sales, service and conversations." />
      <DbNotice error={error ?? undefined} />

      <div className="mb-6 grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
        {sales && <StatCard label="New enquiries · 7 days" value={data?.leadsThisWeek ?? 0} hint={delta(data?.leadsThisWeek ?? 0, data?.leadsLastWeek ?? 0) ?? "None in the previous week either"} href="/admin/leads" />}
        {may("quotes.view") && <StatCard label="Quotes to prepare" value={data?.openQuotes ?? 0} hint="Requested or in preparation" href="/admin/quotes" />}
        {service && (
          <StatCard label={ownTicketsOnly ? "My open tickets" : "Open service & support tickets"} value={data?.openTickets ?? 0} hint={`${data?.urgentTickets ?? 0} urgent or high priority`} href="/admin/tickets" />
        )}
        {may("conversations.view") && <StatCard label="Unread conversations" value={data?.unread ?? 0} hint="Customers waiting for a reply" href="/admin/conversations?view=unread" />}
        {sales && (
          <StatCard
            label="Won this month"
            value={data?.wonThisMonth?._count ?? 0}
            hint={data?.wonThisMonth?._sum.estimatedValue ? `${formatPkr(Number(data.wonThisMonth._sum.estimatedValue))} estimated` : "Estimated values not entered"}
            href="/admin/leads?stage=WON"
          />
        )}
      </div>

      {trendSeries.length > 0 && (
        <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Section title={`New ${trendSeries.map((entry) => entry.name.toLowerCase()).join(" and ")} per day`} description={`Last ${DAYS} days, Pakistan time`}>
            <TrendChart labels={labels} series={trendSeries} label={`${trendSeries.map((entry) => entry.name).join(" and ")} per day over the last ${DAYS} days`} />
          </Section>
          {sales && (
            <Section title="Pipeline" description="Leads at each stage now">
              <BarList
                label="Leads by pipeline stage"
                rows={PIPELINE_STAGES.map((stage) => ({ label: STAGE_LABEL[stage], value: stageCounts.get(stage) ?? 0, href: `/admin/leads?stage=${stage}` }))}
                unit="leads"
                empty="No leads yet."
              />
            </Section>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {data?.followUps && data.followUps.length > 0 && (
          <Section title="My follow-ups" description="Due now or in the next three days">
            <ul className="divide-y text-sm">
              {data.followUps.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`${recordHref[item.entityType] ?? "/admin/"}${item.entityId}`} className="line-clamp-2 hover:text-primary hover:underline">
                      {item.body}
                    </Link>
                    <p className={item.dueAt && item.dueAt < now ? "text-xs font-medium text-rose-600" : "text-xs text-muted-foreground"}>
                      {item.dueAt ? `Due ${formatDateTime(item.dueAt)}` : ""} · {item.entityType.toLowerCase()}
                    </p>
                  </div>
                  <CompleteButton activityId={item.id} />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {service && (
          <Section title={ownTicketsOnly ? "My tickets" : "Tickets needing attention"} actions={<Link href="/admin/tickets" className="text-xs font-medium text-primary hover:underline">All tickets</Link>}>
            {data?.attention.length ? (
              <ul className="divide-y text-sm">
                {data.attention.map((ticket) => (
                  <li key={ticket.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/admin/tickets/${ticket.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                        {ticket.subject}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {ticket.reference}
                        {ticket.city ? ` · ${ticket.city}` : ""} · {formatDate(ticket.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge value={ticket.status} label={TICKET_STATUS_LABEL[ticket.status]} />
                      {(ticket.priority === "URGENT" || ticket.priority === "HIGH") && <StatusBadge value={ticket.priority} label={PRIORITY_LABEL[ticket.priority]} />}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No open tickets.</p>
            )}
          </Section>
        )}

        {sales && (
          <Section title="Latest open leads" actions={<Link href="/admin/leads" className="text-xs font-medium text-primary hover:underline">All leads</Link>}>
            {data?.latestLeads.length ? (
              <ul className="divide-y text-sm">
                {data.latestLeads.map((lead) => (
                  <li key={lead.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/admin/leads/${lead.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                        {lead.company ? `${lead.name} · ${lead.company}` : lead.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{lead.subService ?? "General enquiry"} · {formatDate(lead.createdAt)}</p>
                    </div>
                    <StatusBadge value={lead.stage} label={STAGE_LABEL[lead.stage]} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No open leads.</p>
            )}
          </Section>
        )}

        {sales && (
          <Section title="Where enquiries come from" description={`Last ${DAYS} days`}>
            <BarList
              label="Enquiries by source"
              rows={(data?.bySource ?? []).map((entry) => ({ label: SOURCE_LABEL[entry.source] ?? entry.source, value: entry._count })).sort((a, b) => b.value - a.value)}
              unit="enquiries"
              empty="No enquiries in this period."
            />
          </Section>
        )}

        {data?.appointments && data.appointments.length > 0 && (
          <Section title="Upcoming appointments" actions={<Link href="/admin/appointments" className="text-xs font-medium text-primary hover:underline">All</Link>}>
            <ul className="divide-y text-sm">
              {data.appointments.map((meeting) => (
                <li key={meeting.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{meeting.businessName ? `${meeting.name} · ${meeting.businessName}` : meeting.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(meeting.preferredDate)} {meeting.preferredTime} · {MEETING_MODE_LABEL[meeting.mode] ?? meeting.mode}
                    </p>
                  </div>
                  <StatusBadge value={meeting.status} />
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {!sales && !service && !may("conversations.view") && (
        <p className="text-sm text-muted-foreground">Use the menu to open the parts of the console your role covers.</p>
      )}
    </>
  );
}
