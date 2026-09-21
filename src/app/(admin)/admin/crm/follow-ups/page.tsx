import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import {
  DataTable,
  DbNotice,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/admin/ui";
import { CalendarClock, CheckCircle2, TimerReset } from "lucide-react";
import { formatDateTime, humanise, truncate } from "@/lib/utils";

export const metadata = { title: "Follow-ups" };

/** Where a timeline entry links back to, per entity type. */
const LINKS: Record<string, (id: string) => string | null> = {
  Lead: (id) => `/admin/crm/leads/${id}`,
  Ticket: () => "/admin/support/tickets",
  Customer: () => "/admin/crm/customers",
  Project: () => "/admin/catalogue/projects",
};

/** Record types as people say them. */
const RECORD_LABELS: Record<string, string> = { Lead: "Lead" };

export default async function FollowUpsPage() {
  await requirePagePermission("leads.view", "/admin/crm/follow-ups");
  const now = new Date();

  const { data, error } = await safeQuery(
    async () => {
      const base: Prisma.CrmActivityWhereInput = {
        ...OWN,
        type: { in: ["FOLLOW_UP", "REMINDER"] },
        completedAt: null,
      };

      const [pending, overdue, completed] = await Promise.all([
        prisma.crmActivity.findMany({
          where: base,
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
          take: 100,
          include: { owner: { select: { name: true } } },
        }),
        prisma.crmActivity.count({ where: { ...base, dueAt: { lt: now } } }),
        prisma.crmActivity.count({
          where: { ...OWN, completedAt: { not: null } },
        }),
      ]);
      return { pending, overdue, completed };
    },
    { pending: [], overdue: 0, completed: 0 }
  );

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Follow-ups & reminders"
        description="Everything your team promised to do next. Overdue items float to the top."
      />

      {error && <DbNotice error={error} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Open follow-ups" value={data.pending.length} icon={CalendarClock} />
        <StatCard label="Overdue" value={data.overdue} icon={TimerReset} />
        <StatCard label="Completed" value={data.completed} icon={CheckCircle2} />
      </div>

      <DataTable
        rows={data.pending}
        rowKey={(row) => row.id}
        empty="Nothing outstanding — every follow-up is done."
        columns={[
          {
            header: "Due",
            cell: (row) => (
              <span
                className={`whitespace-nowrap text-xs font-medium ${
                  row.dueAt && row.dueAt < now ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {row.dueAt ? formatDateTime(row.dueAt) : "No date"}
              </span>
            ),
          },
          { header: "Type", cell: (row) => <StatusBadge value={row.type} /> },
          {
            header: "Note",
            cell: (row) => (
              <p className="max-w-md text-xs">{truncate(row.body, 140)}</p>
            ),
          },
          {
            header: "Record",
            cell: (row) => {
              const href = LINKS[row.entityType]?.(row.entityId);
              const label = RECORD_LABELS[row.entityType] ?? humanise(row.entityType);
              return href ? (
                <Link href={href} className="text-xs font-medium text-primary hover:underline">
                  {label}
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">{label}</span>
              );
            },
          },
          {
            header: "Owner",
            cell: (row) => (
              <span className="text-xs text-muted-foreground">
                {row.owner?.name ?? "Unassigned"}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
