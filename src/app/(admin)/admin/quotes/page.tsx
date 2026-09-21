import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, SOURCE_LABEL } from "@/lib/admin/labels";
import { DataTable, DbNotice, FilterBar, FilterChip, Muted, PageHeader, Pagination, RowTitle, SearchForm, StatusBadge } from "@/components/admin/ui";
import { formatDate, formatPkr } from "@/lib/utils";

export const metadata = { title: "Quote Requests" };

const PAGE_SIZE = 25;
type Search = { q?: string; status?: string; owner?: string; page?: string };
const OPEN = ["REQUESTED", "DRAFT", "SENT"] as const;

export default async function QuotesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await requirePagePermission("quotes.view", "/admin/quotes");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = ([...QUOTE_STATUSES, "all"] as string[]).includes(params.status ?? "") ? params.status : undefined;
  const mine = params.owner === "me";
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.QuoteWhereInput = {
    ...OWN,
    ...(status === "all" ? {} : status ? { status: status as Prisma.EnumQuoteStatusFilter["equals"] } : { status: { in: [...OPEN] } }),
    ...(mine ? { ownerId: staff.id } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { reference: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { customer: { company: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const { data, error } = await safeQuery(
    async () => {
      const [rows, total, byStatus] = await Promise.all([
        prisma.quote.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true, reference: true, title: true, status: true, quantity: true, total: true, currency: true, city: true, source: true, createdAt: true,
            customer: { select: { name: true, company: true } },
            productCategory: { select: { name: true } },
            product: { select: { name: true } },
            owner: { select: { name: true } },
          },
        }),
        prisma.quote.count({ where }),
        prisma.quote.groupBy({ by: ["status"], where: OWN, _count: true }),
      ]);
      return { rows, total, byStatus };
    },
    { rows: [], total: 0, byStatus: [] }
  );

  const counts = Object.fromEntries(data.byStatus.map((entry) => [entry.status, entry._count])) as Record<string, number>;
  const href = (changes: Partial<Search>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, status, owner: mine ? "me" : undefined, ...changes })) if (value) next.set(key, String(value));
    return `/admin/quotes${next.size ? `?${next}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Quote Requests"
        description="Quotations customers asked for through the assistant, WhatsApp or the website, and the ones the team has prepared. Prices are entered by the team on each quote."
      />
      <DbNotice error={error} />
      <FilterBar>
        <FilterChip href={href({ status: undefined, page: undefined })} label="Open" count={OPEN.reduce((sum, key) => sum + (counts[key] ?? 0), 0)} active={!status} />
        {QUOTE_STATUSES.map((value) => (
          <FilterChip key={value} href={href({ status: value, page: undefined })} label={QUOTE_STATUS_LABEL[value]} count={counts[value] ?? 0} active={status === value} />
        ))}
        <FilterChip href={href({ status: "all", page: undefined })} label="All" active={status === "all"} />
        <FilterChip href={href({ owner: mine ? undefined : "me", page: undefined })} label={mine ? "Mine ✓" : "Mine"} active={mine} />
      </FilterBar>
      <SearchForm action="/admin/quotes" query={q} placeholder="Search title, reference or customer" keep={{ status, owner: mine ? "me" : undefined }} />
      <DataTable
        rows={data.rows}
        rowKey={(row) => row.id}
        empty={q ? "No quote requests match." : "No quote requests here."}
        columns={[
          { header: "Request", cell: (row) => <RowTitle href={`/admin/quotes/${row.id}`} title={row.title} sub={row.reference} /> },
          { header: "Customer", cell: (row) => (row.customer ? `${row.customer.name}${row.customer.company ? ` · ${row.customer.company}` : ""}` : <Muted>—</Muted>) },
          { header: "Product", cell: (row) => row.product?.name ?? row.productCategory?.name ?? <Muted>—</Muted> },
          { header: "Qty", cell: (row) => row.quantity ?? <Muted>—</Muted> },
          { header: "Status", cell: (row) => <StatusBadge value={row.status} label={QUOTE_STATUS_LABEL[row.status]} /> },
          { header: "Total", cell: (row) => (Number(row.total) > 0 ? <span className="tabular-nums">{row.currency === "PKR" ? formatPkr(Number(row.total)) : `${row.currency} ${Number(row.total).toLocaleString()}`}</span> : <Muted>Not priced</Muted>) },
          { header: "Source", cell: (row) => <span className="text-[13px]">{row.source ? SOURCE_LABEL[row.source] : "—"}</span> },
          { header: "Owner", cell: (row) => row.owner?.name ?? <Muted>Unassigned</Muted> },
          { header: "Requested", cell: (row) => <Muted>{formatDate(row.createdAt)}</Muted>, className: "whitespace-nowrap" },
        ]}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} href={(next) => href({ page: String(next) })} />
    </>
  );
}
