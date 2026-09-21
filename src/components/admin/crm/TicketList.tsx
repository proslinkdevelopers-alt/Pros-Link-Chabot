import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { hasPermission, type Staff } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { peopleWith } from "@/lib/admin/people";
import {
  OPEN_TICKET_STATUSES,
  PRIORITIES,
  PRIORITY_LABEL,
  SERVICE_CATEGORIES,
  SUPPORT_CATEGORIES,
  TICKET_CATEGORY_LABEL,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
} from "@/lib/admin/labels";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { DataTable, DbNotice, FilterBar, FilterChip, Muted, PageHeader, Pagination, RowTitle, SearchForm, StatusBadge } from "../ui";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 25;
export type TicketSearch = { q?: string; status?: string; category?: string; priority?: string; assignee?: string; page?: string };

/**
 * The ticket list behind both Service Tickets (work on machines) and Support
 * (everything else customers raise). A technician sees only the tickets
 * assigned to them, whatever the filters say.
 */
export async function TicketList({ kind, staff, params }: { kind: "service" | "support"; staff: Staff; params: TicketSearch }) {
  const base = kind === "service" ? "/admin/tickets" : "/admin/support";
  const categories: readonly string[] = kind === "service" ? SERVICE_CATEGORIES : SUPPORT_CATEGORIES;
  const assignedOnly = !hasPermission(staff, "tickets.view");
  const q = params.q?.trim() ?? "";
  const status = ([...TICKET_STATUSES, "all"] as string[]).includes(params.status ?? "") ? params.status : undefined;
  const category = categories.includes(params.category ?? "") ? params.category : undefined;
  const priority = (PRIORITIES as readonly string[]).includes(params.priority ?? "") ? params.priority : undefined;
  const assignee = assignedOnly ? undefined : params.assignee || undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const phone = q.replace(/\D/g, "");

  const scope: Prisma.TicketWhereInput = {
    ...OWN,
    category: category ? (category as Prisma.EnumTicketCategoryFilter["equals"]) : { in: categories as Prisma.EnumTicketCategoryFilter["in"] },
    ...(assignedOnly ? { assigneeId: staff.id } : {}),
  };
  const where: Prisma.TicketWhereInput = {
    ...scope,
    ...(status === "all" ? {} : status ? { status: status as Prisma.EnumTicketStatusFilter["equals"] } : { status: { in: [...OPEN_TICKET_STATUSES] } }),
    ...(priority ? { priority: priority as Prisma.EnumPriorityFilter["equals"] } : {}),
    ...(assignee === "me" ? { assigneeId: staff.id } : assignee === "none" ? { assigneeId: null } : assignee ? { assigneeId: assignee } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { subject: { contains: q, mode: "insensitive" } },
            { contactName: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { serialNumber: { contains: q, mode: "insensitive" } },
            { machineModel: { contains: q, mode: "insensitive" } },
            ...(phone.length >= 4 ? [{ contactPhone: { contains: phone.slice(-10) } }] : []),
          ],
        }
      : {}),
  };

  const { data, error } = await safeQuery(
    async () => {
      const [rows, total, byStatus, people] = await Promise.all([
        prisma.ticket.findMany({
          where,
          orderBy: [{ createdAt: "desc" }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true, reference: true, subject: true, category: true, status: true, priority: true, contactName: true, company: true, city: true,
            machineModel: true, preferredDate: true, createdAt: true, assignee: { select: { name: true } },
          },
        }),
        prisma.ticket.count({ where }),
        prisma.ticket.groupBy({ by: ["status"], where: scope, _count: true }),
        assignedOnly ? Promise.resolve([]) : peopleWith(["tickets.manage", "tickets.update_assigned"]),
      ]);
      return { rows, total, byStatus, people };
    },
    { rows: [], total: 0, byStatus: [], people: [] }
  );

  const counts = Object.fromEntries(data.byStatus.map((entry) => [entry.status, entry._count])) as Record<string, number>;
  const open = OPEN_TICKET_STATUSES.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  const href = (changes: Partial<TicketSearch>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, status, category, priority, assignee, ...changes })) if (value) next.set(key, String(value));
    return `${base}${next.size ? `?${next}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow={kind === "service" ? "Service" : "Customer care"}
        title={kind === "service" ? (assignedOnly ? "My service tickets" : "Service Tickets") : "Support"}
        description={
          kind === "service"
            ? "Installation, maintenance, repair, technical support, service and parts requests."
            : "Questions, complaints, callbacks and billing matters raised by customers."
        }
        actions={
          hasPermission(staff, "tickets.manage") && (
            <Link href={`/admin/tickets/new?kind=${kind}`} className={buttonVariants({ variant: "brand", size: "sm" })}>
              <Plus /> New ticket
            </Link>
          )
        }
      />
      <DbNotice error={error} />
      <FilterBar>
        <FilterChip href={href({ status: undefined, page: undefined })} label="Open" count={open} active={!status} />
        {TICKET_STATUSES.map((value) => (
          <FilterChip key={value} href={href({ status: value, page: undefined })} label={TICKET_STATUS_LABEL[value]} count={counts[value] ?? 0} active={status === value} />
        ))}
        <FilterChip href={href({ status: "all", page: undefined })} label="All" active={status === "all"} />
      </FilterBar>
      <SearchForm action={base} query={q} placeholder="Search reference, customer, phone, model or serial number" keep={{ status }}>
        <Select name="category" defaultValue={category ?? ""} className="w-auto min-w-[10rem] bg-card" aria-label="Type">
          <option value="">All types</option>
          {categories.map((value) => (
            <option key={value} value={value}>
              {TICKET_CATEGORY_LABEL[value]}
            </option>
          ))}
        </Select>
        <Select name="priority" defaultValue={priority ?? ""} className="w-auto min-w-[9rem] bg-card" aria-label="Priority">
          <option value="">Any priority</option>
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {PRIORITY_LABEL[value]}
            </option>
          ))}
        </Select>
        {!assignedOnly && (
          <Select name="assignee" defaultValue={assignee ?? ""} className="w-auto min-w-[10rem] bg-card" aria-label="Assigned to">
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
            {data.people.map((person) => (
              <option key={person.value} value={person.value}>
                {person.label}
              </option>
            ))}
          </Select>
        )}
      </SearchForm>
      <DataTable
        rows={data.rows}
        rowKey={(row) => row.id}
        empty={q || category || priority ? "No tickets match these filters." : assignedOnly ? "No tickets are assigned to you." : "No open tickets."}
        columns={[
          { header: "Ticket", cell: (row) => <RowTitle href={`/admin/tickets/${row.id}`} title={row.subject} sub={`${row.reference} · ${TICKET_CATEGORY_LABEL[row.category]}`} /> },
          { header: "Customer", cell: (row) => <div className="text-[13px]">{row.contactName ?? "—"}{(row.company || row.city) && <p className="text-xs text-muted-foreground">{[row.company, row.city].filter(Boolean).join(" · ")}</p>}</div> },
          { header: "Status", cell: (row) => <StatusBadge value={row.status} label={TICKET_STATUS_LABEL[row.status]} /> },
          { header: "Priority", cell: (row) => <StatusBadge value={row.priority} label={PRIORITY_LABEL[row.priority]} /> },
          { header: "Assigned to", cell: (row) => row.assignee?.name ?? <Muted>Unassigned</Muted> },
          { header: "Visit", cell: (row) => (row.preferredDate ? formatDate(row.preferredDate) : <Muted>—</Muted>), className: "whitespace-nowrap" },
          { header: "Raised", cell: (row) => <Muted>{formatDate(row.createdAt)}</Muted>, className: "whitespace-nowrap" },
        ]}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} href={(next) => href({ page: String(next) })} />
    </>
  );
}
