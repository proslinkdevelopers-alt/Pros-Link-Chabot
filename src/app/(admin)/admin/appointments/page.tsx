import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { peopleWith } from "@/lib/admin/people";
import { MEETING_MODE_LABEL, MEETING_STATUSES, MEETING_STATUS_LABEL } from "@/lib/admin/labels";
import { DataTable, DbNotice, FilterBar, FilterChip, Muted, PageHeader, RowTitle, StatusBadge } from "@/components/admin/ui";
import { InlineSelect } from "@/components/admin/client/controls";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const staff = await requirePagePermission("appointments.view", "/admin/appointments");
  const { view } = await searchParams;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const status = (MEETING_STATUSES as readonly string[]).includes(view ?? "") ? view : undefined;

  const where: Prisma.MeetingWhereInput = {
    ...OWN,
    ...(view === "past"
      ? { preferredDate: { lt: today } }
      : status
        ? { status: status as Prisma.EnumMeetingStatusFilter["equals"] }
        : view === "all"
          ? {}
          : { preferredDate: { gte: today }, status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] } }),
  };

  const { data, error } = await safeQuery(
    async () => {
      const [rows, people] = await Promise.all([
        prisma.meeting.findMany({
          where,
          orderBy: view === "past" ? { preferredDate: "desc" } : { preferredDate: "asc" },
          take: 200,
          select: {
            id: true, reference: true, name: true, phone: true, businessName: true, topic: true, mode: true, status: true, preferredDate: true,
            preferredTime: true, hostId: true, lead: { select: { id: true, reference: true } },
          },
        }),
        peopleWith(["appointments.manage"]),
      ]);
      return { rows, people };
    },
    { rows: [], people: [] }
  );
  const canManage = hasPermission(staff, "appointments.manage");

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Appointments"
        description="Demonstrations, site visits and calls customers booked through the assistant, or the team arranged. Confirm each one with the customer before the day."
      />
      <DbNotice error={error} />
      <FilterBar>
        <FilterChip href="/admin/appointments" label="Upcoming" active={!view} />
        {MEETING_STATUSES.map((value) => (
          <FilterChip key={value} href={`/admin/appointments?view=${value}`} label={MEETING_STATUS_LABEL[value]} active={view === value} />
        ))}
        <FilterChip href="/admin/appointments?view=past" label="Past" active={view === "past"} />
        <FilterChip href="/admin/appointments?view=all" label="All" active={view === "all"} />
      </FilterBar>
      <DataTable
        rows={data.rows}
        rowKey={(row) => row.id}
        empty="No appointments here."
        columns={[
          {
            header: "When",
            className: "whitespace-nowrap",
            cell: (row) => (
              <div>
                <p className="font-semibold">{formatDate(row.preferredDate)}</p>
                <p className="text-xs text-muted-foreground">{row.preferredTime}</p>
              </div>
            ),
          },
          { header: "Customer", cell: (row) => <RowTitle title={row.businessName ? `${row.name} · ${row.businessName}` : row.name} sub={row.phone} /> },
          { header: "Type", cell: (row) => <span className="text-[13px]">{MEETING_MODE_LABEL[row.mode] ?? row.mode}</span> },
          {
            header: "About",
            cell: (row) => (
              <div className="max-w-xs text-[13px]">
                {row.topic ?? <Muted>—</Muted>}
                {row.lead && (
                  <Link href={`/admin/leads/${row.lead.id}`} className="block text-xs text-primary hover:underline">
                    {row.lead.reference}
                  </Link>
                )}
              </div>
            ),
          },
          {
            header: "Status",
            cell: (row) =>
              canManage ? (
                <InlineSelect url={`/api/admin/meetings/${row.id}`} field="status" label="Status" value={row.status} options={MEETING_STATUSES.map((value) => ({ value, label: MEETING_STATUS_LABEL[value] }))} />
              ) : (
                <StatusBadge value={row.status} label={MEETING_STATUS_LABEL[row.status]} />
              ),
          },
          {
            header: "Handled by",
            cell: (row) =>
              canManage ? (
                <InlineSelect url={`/api/admin/meetings/${row.id}`} field="hostId" label="Handled by" value={row.hostId} empty="Nobody yet" options={data.people} />
              ) : (
                data.people.find((person) => person.value === row.hostId)?.label ?? <Muted>Nobody yet</Muted>
              ),
          },
        ]}
      />
    </>
  );
}
