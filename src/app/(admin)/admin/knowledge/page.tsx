import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { KNOWLEDGE_CATEGORIES } from "@/data/knowledge";
import { Callout, DbNotice, PageHeader } from "@/components/admin/ui";
import { KnowledgeManager, type KnowledgeRow } from "@/components/admin/KnowledgeManager";

export const metadata = { title: "Knowledge Base" };

export default async function KnowledgePage() {
  const staff = await requirePagePermission("knowledge.view", "/admin/knowledge");
  const { data, error } = await safeQuery(
    () =>
      prisma.knowledgeArticle.findMany({
        where: OWN,
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, category: true, question: true, answer: true, keywords: true, kind: true, state: true, sortOrder: true, updatedAt: true },
      }),
    []
  );
  const rows: KnowledgeRow[] = data.map((row) => ({ ...row, kind: row.kind === "COURSE" ? "ARTICLE" : row.kind, updatedAt: row.updatedAt.toISOString() }));

  return (
    <>
      <PageHeader
        eyebrow="Assistant"
        title="Knowledge Base"
        description="What the assistant is allowed to tell customers about Pros-Link: company, products, services, support, FAQ, policies, contact, sales and technical topics. It answers only from published entries."
      />
      <DbNotice error={error} />
      <div className="mb-6">
        <Callout title="Keep entries factual">
          Enter prices, specifications, delivery times or warranty terms only once they are confirmed. Contact details belong in Settings → Company profile, where the
          site and the assistant both read them.
        </Callout>
      </div>
      <KnowledgeManager rows={rows} categories={KNOWLEDGE_CATEGORIES} canEdit={hasPermission(staff, "knowledge.manage")} />
    </>
  );
}
