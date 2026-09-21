import Link from "next/link";
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
import { BellRing, CircleCheck, CircleX } from "lucide-react";
import { formatDateTime, truncate } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requirePagePermission("notifications.view", "/admin/notifications");

  const { data, error } = await safeQuery(
    async () => {
      const [notifications, queued, sent, failed] = await Promise.all([
        prisma.notification.findMany({
          where: OWN,
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        prisma.notification.count({ where: { ...OWN, status: "QUEUED" } }),
        prisma.notification.count({ where: { ...OWN, status: "SENT" } }),
        prisma.notification.count({ where: { ...OWN, status: "FAILED" } }),
      ]);
      return { notifications, queued, sent, failed };
    },
    { notifications: [], queued: 0, sent: 0, failed: 0 }
  );

  return (
    <>
      <PageHeader
        eyebrow="Support & Messaging"
        title="Notifications"
        description="The outbound queue. New leads, meetings and escalations land here for the team."
      />

      {error && <DbNotice error={error} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Queued" value={data.queued} icon={BellRing} />
        <StatCard label="Sent" value={data.sent} icon={CircleCheck} />
        <StatCard label="Failed" value={data.failed} icon={CircleX} />
      </div>

      <DataTable
        rows={data.notifications}
        rowKey={(row) => row.id}
        empty="Nothing in the queue."
        columns={[
          { header: "Channel", cell: (row) => <StatusBadge value={row.channel} /> },
          {
            header: "To",
            cell: (row) => <span className="break-all text-xs">{row.to}</span>,
          },
          {
            header: "Message",
            cell: (row) => (
              <div className="min-w-0 max-w-md">
                <p className="text-sm font-medium">{row.subject ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{truncate(row.body, 110)}</p>
              </div>
            ),
          },
          { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
          {
            header: "Link",
            cell: (row) =>
              row.link ? (
                <Link href={row.link} className="text-xs text-primary hover:underline">
                  Open
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
          {
            header: "Queued",
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
