import type { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import {
  DataTable,
  DbNotice,
  FilterChip,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/admin/ui";
import { StatusSelect } from "@/components/admin/StatusSelect";
import { CircleAlert, LifeBuoy, ShieldAlert } from "lucide-react";
import { formatDateTime, humanise, truncate } from "@/lib/utils";

export const metadata = { title: "Support Tickets" };

const STATUSES: TicketStatus[] = [
  "OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED",
];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePagePermission(["tickets.view", "tickets.view_assigned"], "/admin/support/tickets");
  const { status } = await searchParams;
  const active = STATUSES.includes(status as TicketStatus)
    ? (status as TicketStatus)
    : undefined;

  const { data, error } = await safeQuery(
    async () => {
      const where = { ...OWN, ...(active ? { status: active } : {}) };
      const [tickets, counts, urgent] = await Promise.all([
        prisma.ticket.findMany({
          where,
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 100,
          include: { assignee: { select: { name: true } } },
        }),
        prisma.ticket.groupBy({
          by: ["status"],
          _count: { _all: true },
          where: OWN,
        }),
        prisma.ticket.count({
          where: {
            ...OWN,
            priority: { in: ["HIGH", "URGENT"] },
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        }),
      ]);
      return { tickets, counts, urgent };
    },
    {
      tickets: [],
      counts: [] as Array<{ status: TicketStatus; _count: { _all: number } }>,
      urgent: 0,
    }
  );

  const countFor = (value: TicketStatus) =>
    data.counts.find((c) => c.status === value)?._count._all ?? 0;
  const total = data.counts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Support Tickets"
        description="Technical, billing, sales, complaint and general enquiries — every one with a reference the client already has."
      />

      {error && <DbNotice error={error} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="All tickets" value={total} icon={LifeBuoy} />
        <StatCard
          label="Open + in progress"
          value={countFor("OPEN") + countFor("IN_PROGRESS")}
          icon={CircleAlert}
        />
        <StatCard label="High / urgent" value={data.urgent} icon={ShieldAlert} />
      </div>

      <div className="scroll-slim mb-4 flex gap-2 overflow-x-auto pb-1">
        <FilterChip href="/admin/support/tickets" label="All" count={total} active={!active} />
        {STATUSES.map((value) => (
          <FilterChip
            key={value}
            href={`/admin/support/tickets?status=${value}`}
            label={humanise(value)}
            count={countFor(value)}
            active={active === value}
          />
        ))}
      </div>

      <DataTable
        rows={data.tickets}
        rowKey={(row) => row.id}
        empty="No tickets in this state."
        columns={[
          {
            header: "Reference",
            cell: (row) => <span className="font-mono text-xs">{row.reference}</span>,
          },
          {
            header: "Subject",
            cell: (row) => (
              <div className="min-w-0 max-w-sm">
                <p className="text-sm font-medium">{row.subject}</p>
                <p className="text-xs text-muted-foreground">{truncate(row.description, 100)}</p>
              </div>
            ),
          },
          {
            header: "Category",
            cell: (row) => <StatusBadge value={row.category} />,
          },
          {
            header: "Contact",
            cell: (row) => (
              <div className="text-xs text-muted-foreground">
                <p>{row.contactName ?? "—"}</p>
                <p>{row.contactPhone ?? row.contactEmail ?? ""}</p>
              </div>
            ),
          },
          {
            header: "Status",
            cell: (row) => (
              <StatusSelect
                entity="tickets"
                id={row.id}
                field="status"
                value={row.status}
                options={STATUSES}
              />
            ),
          },
          {
            header: "Priority",
            cell: (row) => (
              <StatusSelect
                entity="tickets"
                id={row.id}
                field="priority"
                value={row.priority}
                options={PRIORITIES}
              />
            ),
          },
          {
            header: "Assignee",
            cell: (row) => (
              <span className="text-xs text-muted-foreground">
                {row.assignee?.name ?? "Unassigned"}
              </span>
            ),
          },
          {
            header: "Raised",
            cell: (row) => (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(row.createdAt)}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
