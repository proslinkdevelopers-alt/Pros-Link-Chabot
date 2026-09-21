import type { MeetingStatus } from "@prisma/client";
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
import { StatusSelect } from "@/components/admin/StatusSelect";
import { CalendarCheck, CalendarClock, CalendarX } from "lucide-react";
import { formatDate, truncate } from "@/lib/utils";

export const metadata = { title: "Meetings" };

const STATUSES: MeetingStatus[] = [
  "REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW",
];

const MODE_LABEL: Record<string, string> = {
  OFFICE: "Office visit",
  ZOOM: "Zoom",
  GOOGLE_MEET: "Google Meet",
  WHATSAPP: "WhatsApp call",
};

export default async function MeetingsPage() {
  await requirePagePermission("appointments.view", "/admin/meetings");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await safeQuery(
    async () => {
      const [meetings, upcoming, confirmed, cancelled] = await Promise.all([
        prisma.meeting.findMany({
          where: OWN,
          orderBy: [{ preferredDate: "asc" }, { createdAt: "desc" }],
          take: 100,
        }),
        prisma.meeting.count({
          where: {
            ...OWN,
            preferredDate: { gte: today },
            status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] },
          },
        }),
        prisma.meeting.count({ where: { ...OWN, status: "CONFIRMED" } }),
        prisma.meeting.count({
          where: { ...OWN, status: { in: ["CANCELLED", "NO_SHOW"] } },
        }),
      ]);
      return { meetings, upcoming, confirmed, cancelled };
    },
    { meetings: [], upcoming: 0, confirmed: 0, cancelled: 0 }
  );

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Meetings"
        description="Consultations booked through the assistant and WhatsApp. Confirm them and the client keeps their reference."
      />

      {error && <DbNotice error={error} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Upcoming" value={data.upcoming} icon={CalendarClock} />
        <StatCard label="Confirmed" value={data.confirmed} icon={CalendarCheck} />
        <StatCard label="Cancelled / no-show" value={data.cancelled} icon={CalendarX} />
      </div>

      <DataTable
        rows={data.meetings}
        rowKey={(row) => row.id}
        empty="No meetings booked yet."
        columns={[
          {
            header: "Reference",
            cell: (row) => <span className="font-mono text-xs">{row.reference}</span>,
          },
          {
            header: "Requested by",
            cell: (row) => (
              <div className="min-w-0">
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.phone}</p>
                {row.businessName && (
                  <p className="text-xs text-muted-foreground">{row.businessName}</p>
                )}
              </div>
            ),
          },
          {
            header: "When",
            cell: (row) => (
              <div className="text-xs">
                <p className="font-medium">{formatDate(row.preferredDate)}</p>
                <p className="text-muted-foreground">{row.preferredTime}</p>
              </div>
            ),
          },
          {
            header: "Mode",
            cell: (row) => <StatusBadge value={MODE_LABEL[row.mode] ?? row.mode} />,
          },
          {
            header: "Topic",
            cell: (row) => (
              <p className="max-w-xs text-xs text-muted-foreground">
                {row.topic ? truncate(row.topic, 90) : "—"}
              </p>
            ),
          },
          {
            header: "Status",
            cell: (row) => (
              <StatusSelect
                entity="meetings"
                id={row.id}
                field="status"
                value={row.status}
                options={STATUSES}
              />
            ),
          },
        ]}
      />
    </>
  );
}
