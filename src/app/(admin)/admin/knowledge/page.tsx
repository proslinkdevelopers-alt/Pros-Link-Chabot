import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { safeQuery } from "@/lib/admin/queries";
import {
  DataTable,
  DbNotice,
  FilterChip,
  PageHeader,
  StatCard,
} from "@/components/admin/ui";
import { StatusSelect } from "@/components/admin/StatusSelect";
import { BookOpen, FileQuestion, Layers } from "lucide-react";
import { formatDate, truncate } from "@/lib/utils";

export const metadata = { title: "Knowledge Base" };

const STATES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

/** Knowledge Base CMS — everything the assistant is allowed to say. */
export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireAdmin("/admin/knowledge");
  const { category } = await searchParams;

  const { data, error } = await safeQuery(
    async () => {
      const [entries, counts, categories] = await Promise.all([
        prisma.knowledgeArticle.findMany({
          where: category ? { category } : undefined,
          orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
          take: 200,
        }),
        prisma.knowledgeArticle.groupBy({ by: ["state"], _count: { _all: true } }),
        prisma.knowledgeArticle.groupBy({ by: ["category"], _count: { _all: true } }),
      ]);
      return {
        entries,
        counts: counts.map((c) => ({ state: c.state, count: c._count._all })),
        categories: categories.map((c) => ({ category: c.category, count: c._count._all })),
      };
    },
    { entries: [], counts: [], categories: [] }
  );

  const total = data.counts.reduce((sum, c) => sum + c.count, 0);
  const published = data.counts.find((c) => c.state === "PUBLISHED")?.count ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Knowledge Base"
        description="Everything the assistant is allowed to say about BITSOL Marketing. Answers are drawn from published entries only."
      />

      {error && <DbNotice error={error} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Entries" value={total} icon={BookOpen} />
        <StatCard label="Published" value={published} icon={FileQuestion} />
        <StatCard label="Categories" value={data.categories.length} icon={Layers} />
      </div>

      <div className="scroll-slim mb-4 flex gap-2 overflow-x-auto pb-1">
        <FilterChip href="/admin/knowledge" label="All" count={total} active={!category} />
        {data.categories.map((group) => (
          <FilterChip
            key={group.category}
            href={`/admin/knowledge?category=${encodeURIComponent(group.category)}`}
            label={group.category}
            count={group.count}
            active={category === group.category}
          />
        ))}
      </div>

      <DataTable
        rows={data.entries}
        rowKey={(row) => row.id}
        empty="No entries yet. Run `npm run db:seed` to load the starting knowledge base."
        columns={[
          {
            header: "Question",
            cell: (row) => (
              <div className="min-w-0 max-w-lg">
                <p className="text-sm font-medium">{row.question}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {truncate(row.answer.replace(/[*_#]/g, ""), 130)}
                </p>
              </div>
            ),
          },
          {
            header: "Category",
            cell: (row) => (
              <div className="space-y-1">
                <p className="text-xs font-medium">{row.category}</p>
                <p className="text-[11px] text-muted-foreground">{row.kind}</p>
              </div>
            ),
          },
          {
            header: "Keywords",
            cell: (row) => (
              <p className="max-w-[14rem] text-[11px] text-muted-foreground">
                {truncate(row.keywords.join(", "), 70)}
              </p>
            ),
          },
          {
            header: "State",
            cell: (row) => (
              <StatusSelect
                entity="knowledge"
                id={row.id}
                field="state"
                value={row.state}
                options={STATES}
              />
            ),
          },
          {
            header: "Version",
            cell: (row) => (
              <div className="text-[11px] text-muted-foreground">
                <p>v{row.version}</p>
                <p>{row.indexedAt ? `Indexed ${formatDate(row.indexedAt)}` : "Not indexed"}</p>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
