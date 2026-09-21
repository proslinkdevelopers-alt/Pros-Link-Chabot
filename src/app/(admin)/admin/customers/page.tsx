import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { CUSTOMER_STATUSES, CUSTOMER_STATUS_LABEL } from "@/lib/admin/labels";
import { buttonVariants } from "@/components/ui/button";
import { DataTable, DbNotice, FilterBar, FilterChip, Muted, PageHeader, Pagination, RowTitle, SearchForm, StatusBadge } from "@/components/admin/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Customers" };

const PAGE_SIZE = 25;
type Search = { q?: string; status?: string; page?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await requirePagePermission("customers.view", "/admin/customers");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = (CUSTOMER_STATUSES as readonly string[]).includes(params.status ?? "") ? params.status : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const phone = q.replace(/\D/g, "");

  const where: Prisma.CustomerWhereInput = {
    ...OWN,
    ...(status ? { status: status as Prisma.EnumCustomerStatusFilter["equals"] } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { reference: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            ...(phone.length >= 4 ? [{ phone: { contains: phone.slice(-10) } }, { whatsapp: { contains: phone.slice(-10) } }] : []),
          ],
        }
      : {}),
  };

  const { data, error } = await safeQuery(
    async () => {
      const [rows, total, byStatus] = await Promise.all([
        prisma.customer.findMany({
          where,
          orderBy: [{ lastInteractionAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true, reference: true, name: true, company: true, phone: true, email: true, city: true, status: true, lastInteractionAt: true,
            owner: { select: { name: true } },
            _count: { select: { leads: true, tickets: true, quotes: true, assets: true } },
          },
        }),
        prisma.customer.count({ where }),
        prisma.customer.groupBy({ by: ["status"], where: OWN, _count: true }),
      ]);
      return { rows, total, byStatus };
    },
    { rows: [], total: 0, byStatus: [] }
  );

  const counts = Object.fromEntries(data.byStatus.map((entry) => [entry.status, entry._count])) as Record<string, number>;
  const all = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const href = (changes: Partial<Search>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, status, ...changes })) if (value) next.set(key, String(value));
    return `/admin/customers${next.size ? `?${next}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Customers"
        description="One profile per person or organisation, joining their enquiries, quotations, service tickets, machines and conversations."
        actions={
          hasPermission(staff, "customers.manage") && (
            <Link href="/admin/customers/new" className={buttonVariants({ variant: "brand", size: "sm" })}>
              <Plus /> Add customer
            </Link>
          )
        }
      />
      <DbNotice error={error} />
      <FilterBar>
        <FilterChip href={href({ status: undefined, page: undefined })} label="All" count={all} active={!status} />
        {CUSTOMER_STATUSES.map((value) => (
          <FilterChip key={value} href={href({ status: value, page: undefined })} label={CUSTOMER_STATUS_LABEL[value]} count={counts[value] ?? 0} active={status === value} />
        ))}
      </FilterBar>
      <SearchForm action="/admin/customers" query={q} placeholder="Search name, company, phone, email, city or reference" keep={{ status }} />
      <DataTable
        rows={data.rows}
        rowKey={(row) => row.id}
        empty={q ? "No customers match." : "No customers yet."}
        emptyHint="Profiles are created automatically from enquiries, or can be added by hand."
        columns={[
          { header: "Customer", cell: (row) => <RowTitle href={`/admin/customers/${row.id}`} title={row.company ? `${row.name} · ${row.company}` : row.name} sub={row.reference} /> },
          {
            header: "Contact",
            cell: (row) => (
              <div className="text-[13px]">
                <p>{row.phone}</p>
                {row.email && <p className="text-xs text-muted-foreground">{row.email}</p>}
              </div>
            ),
          },
          { header: "City", cell: (row) => row.city ?? <Muted>—</Muted> },
          { header: "Status", cell: (row) => <StatusBadge value={row.status} label={CUSTOMER_STATUS_LABEL[row.status]} /> },
          {
            header: "Records",
            cell: (row) => (
              <span className="text-xs text-muted-foreground">
                {row._count.leads} leads · {row._count.quotes} quotes · {row._count.tickets} tickets{row._count.assets ? ` · ${row._count.assets} machines` : ""}
              </span>
            ),
          },
          { header: "Owner", cell: (row) => row.owner?.name ?? <Muted>—</Muted> },
          { header: "Last contact", cell: (row) => <Muted>{formatDate(row.lastInteractionAt)}</Muted>, className: "whitespace-nowrap" },
        ]}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} href={(next) => href({ page: String(next) })} />
    </>
  );
}
