import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { safeQuery } from "@/lib/admin/queries";
import { DbNotice, PageHeader } from "@/components/admin/ui";
import { NotificationList } from "@/components/admin/NotificationList";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const staff = await requirePagePermission("notifications.view", "/admin/notifications");
  const { data, error } = await safeQuery(
    () =>
      prisma.notification.findMany({
        where: { userId: staff.id, channel: "IN_APP" },
        orderBy: { createdAt: "desc" },
        take: 150,
        select: { id: true, subject: true, body: true, link: true, status: true, createdAt: true },
      }),
    []
  );

  return (
    <>
      <PageHeader eyebrow="Overview" title="Notifications" description="New leads, quote requests and tickets for your role, assignments to you, and changes to records you hold." />
      <DbNotice error={error} />
      <NotificationList
        rows={data.map((row) => ({ id: row.id, subject: row.subject ?? "Notification", body: row.body, link: row.link, read: row.status === "READ", createdAt: row.createdAt.toISOString() }))}
      />
    </>
  );
}
