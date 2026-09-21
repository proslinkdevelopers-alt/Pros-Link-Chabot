import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Columns3, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { peopleWith } from "@/lib/admin/people";
import { LEAD_SOURCES, OPEN_STAGES, PIPELINE_STAGES, SOURCE_LABEL, STAGE_LABEL, TEMPERATURE_LABEL } from "@/lib/admin/labels";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { ChannelBadge, DataTable, DbNotice, FilterBar, FilterChip, Muted, PageHeader, Pagination, RowTitle, SearchForm, StatusBadge } from "@/components/admin/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Leads" };

const PAGE_SIZE = 25;
type Search = { q?: string; stage?: string; source?: string; owner?: string; page?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await requirePagePermission("leads.view", "/admin/leads");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const stage = params.stage && ([...PIPELINE_STAGES, "all", "SPAM"] as string[]).includes(params.stage) ? params.stage : undefined;
  const source = (LEAD_SOURCES as readonly string[]).includes(params.source ?? "") ? params.source : undefined;
  const owner = params.owner || undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.LeadWhereInput = {
    ...OWN,
    ...(stage === "all" ? {} : stage ? { stage: stage as Prisma.EnumLeadStageFilter["equals"] } : { stage: { in: [...OPEN_STAGES] } }),
    ...(source ? { source: source as Prisma.EnumLeadSourceFilter["equals"] } : {}),
    ...(owner === "me" ? { ownerId: staff.id } : owner === "none" ? { ownerId: null } : owner ? { ownerId: owner } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { reference: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            ...(q.replace(/\D/g, "").length >= 4 ? [{ phone: { contains: q.replace(/\D/g, "").slice(-10) } }] : []),
          ],
        }
      : {}),
  };

  const { data, error } = await safeQuery(
    async () => {
      const [rows, total, byStage, people] = await Promise.all([
        prisma.lead.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true, reference: true, name: true, company: true, city: true, subService: true, stage: true, temperature: true, score: true,
            source: true, createdAt: true, owner: { select: { name: true } }, conversation: { select: { channel: true } },
          },
        }),
        prisma.lead.count({ where }),
        prisma.lead.groupBy({ by: ["stage"], where: OWN, _count: true }),
        peopleWith(["leads.manage"]),
      ]);
      return { rows, total, byStage, people };
    },
    { rows: [], total: 0, byStage: [], people: [] }
  );

  const counts = Object.fromEntries(data.byStage.map((entry) => [entry.stage, entry._count])) as Record<string, number>;
  const openCount = OPEN_STAGES.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  const href = (changes: Partial<Search>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, stage, source, owner, ...changes })) if (value) next.set(key, String(value));
    return `/admin/leads${next.size ? `?${next}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Leads"
        description="Every enquiry — from the website assistant, WhatsApp, forms and the phone — with where it stands."
        actions={
          <>
            <Link href="/admin/pipeline" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Columns3 /> Pipeline
            </Link>
            {hasPermission(staff, "leads.manage") && (
              <Link href="/admin/leads/new" className={buttonVariants({ variant: "brand", size: "sm" })}>
                <Plus /> New lead
              </Link>
            )}
          </>
        }
      />
      <DbNotice error={error} />

      <FilterBar>
        <FilterChip href={href({ stage: undefined, page: undefined })} label="Open" count={openCount} active={!stage} />
        {PIPELINE_STAGES.map((key) => (
          <FilterChip key={key} href={href({ stage: key, page: undefined })} label={STAGE_LABEL[key]} count={counts[key] ?? 0} active={stage === key} />
        ))}
        <FilterChip href={href({ stage: "all", page: undefined })} label="All" active={stage === "all"} />
      </FilterBar>

      <SearchForm action="/admin/leads" query={q} placeholder="Search name, company, phone, email or reference" keep={{ stage }}>
        <Select name="source" defaultValue={source ?? ""} className="w-auto min-w-[10rem] bg-card" aria-label="Source">
          <option value="">Any source</option>
          {LEAD_SOURCES.map((value) => (
            <option key={value} value={value}>
              {SOURCE_LABEL[value]}
            </option>
          ))}
        </Select>
        <Select name="owner" defaultValue={owner ?? ""} className="w-auto min-w-[10rem] bg-card" aria-label="Owner">
          <option value="">Anyone</option>
          <option value="me">Mine</option>
          <option value="none">Unassigned</option>
          {data.people.map((person) => (
            <option key={person.value} value={person.value}>
              {person.label}
            </option>
          ))}
        </Select>
      </SearchForm>

      <DataTable
        rows={data.rows}
        rowKey={(row) => row.id}
        empty={q || source || owner ? "No leads match these filters." : "No leads here yet."}
        emptyHint="Leads arrive from the website assistant, WhatsApp and website forms, or can be added by hand."
        columns={[
          { header: "Lead", cell: (row) => <RowTitle href={`/admin/leads/${row.id}`} title={row.company ? `${row.name} · ${row.company}` : row.name} sub={[row.reference, row.city].filter(Boolean).join(" · ")} /> },
          { header: "Interest", cell: (row) => row.subService ?? <Muted>—</Muted> },
          { header: "Stage", cell: (row) => <StatusBadge value={row.stage} label={STAGE_LABEL[row.stage]} /> },
          {
            header: "Score",
            cell: (row) => (
              <span className="whitespace-nowrap">
                <StatusBadge value={row.temperature} label={TEMPERATURE_LABEL[row.temperature]} /> <span className="ml-1 text-xs tabular-nums text-muted-foreground">{row.score}</span>
              </span>
            ),
          },
          {
            header: "Source",
            cell: (row) =>
              row.conversation ? <ChannelBadge value={row.conversation.channel} /> : <span className="text-[13px]">{SOURCE_LABEL[row.source] ?? row.source}</span>,
          },
          { header: "Owner", cell: (row) => row.owner?.name ?? <Muted>Unassigned</Muted> },
          { header: "Created", cell: (row) => <Muted>{formatDate(row.createdAt)}</Muted>, className: "whitespace-nowrap" },
        ]}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} href={(next) => href({ page: String(next) })} />
    </>
  );
}
