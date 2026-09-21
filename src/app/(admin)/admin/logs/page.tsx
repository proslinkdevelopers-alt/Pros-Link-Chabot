import type { LogLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import {
  DataTable,
  DbNotice,
  FilterChip,
  PageHeader,
  StatusBadge,
} from "@/components/admin/ui";
import { formatDateTime, humanise, truncate } from "@/lib/utils";

export const metadata = { title: "System Logs" };

const LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  await requirePagePermission("audit.view", "/admin/logs");
  const { level } = await searchParams;
  const active = LEVELS.includes(level as LogLevel) ? (level as LogLevel) : undefined;

  const { data, error } = await safeQuery(
    async () => {
      const where = { ...OWN, ...(active ? { level: active } : {}) };
      const [logs, counts] = await Promise.all([
        prisma.systemLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 150,
          include: { user: { select: { name: true } } },
        }),
        prisma.systemLog.groupBy({
          by: ["level"],
          _count: { _all: true },
          where: OWN,
        }),
      ]);
      return { logs, counts };
    },
    { logs: [], counts: [] as Array<{ level: LogLevel; _count: { _all: number } }> }
  );

  const countFor = (value: LogLevel) =>
    data.counts.find((c) => c.level === value)?._count._all ?? 0;
  const total = data.counts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="System Logs"
        description="Audit trail of every lead, ticket, meeting and record change — who did what, when, and from where."
      />

      {error && <DbNotice error={error} />}

      <div className="mb-4 flex gap-2">
        <FilterChip href="/admin/logs" label="All" count={total} active={!active} />
        {LEVELS.map((value) => (
          <FilterChip
            key={value}
            href={`/admin/logs?level=${value}`}
            label={humanise(value)}
            count={countFor(value)}
            active={active === value}
          />
        ))}
      </div>

      <DataTable
        rows={data.logs}
        rowKey={(row) => row.id}
        empty="No log entries yet."
        columns={[
          {
            header: "When",
            cell: (row) => (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(row.createdAt)}
              </span>
            ),
          },
          { header: "Level", cell: (row) => <StatusBadge value={row.level} /> },
          {
            header: "Action",
            cell: (row) => <span className="font-mono text-xs">{row.action}</span>,
          },
          {
            header: "Detail",
            cell: (row) => (
              <div className="min-w-0 max-w-md">
                <p className="text-xs">{row.message ?? "—"}</p>
                {row.entity && (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {row.entity}
                    {row.entityId ? ` · ${truncate(row.entityId, 24)}` : ""}
                  </p>
                )}
              </div>
            ),
          },
          {
            header: "Actor",
            cell: (row) => (
              <div className="text-xs text-muted-foreground">
                <p>{row.user?.name ?? "System"}</p>
                <p className="font-mono text-[10px]">{row.ipAddress ?? ""}</p>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
