import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { DbNotice, EmptyState, PageHeader, StatusBadge } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { Star } from "lucide-react";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  await requireAdmin("/admin/catalogue/portfolio");

  const { data, error } = await safeQuery(
    async () => {
      const [items, reviews] = await Promise.all([
        prisma.legacyPortfolioItem.findMany({
          where: OWN,
          orderBy: { sortOrder: "asc" },
          include: { service: { select: { name: true } } },
        }),
        prisma.legacyReview.findMany({ where: OWN, orderBy: { createdAt: "desc" }, take: 20 }),
      ]);
      return { items, reviews };
    },
    { items: [], reviews: [] }
  );

  return (
    <>
      <PageHeader
        eyebrow="Practice"
        title="Portfolio & reviews"
        description="Case studies and client testimonials the assistant references when a prospect asks for proof."
      />

      {error && <DbNotice error={error} />}

      <h2 className="mb-3 text-sm font-semibold">Case studies</h2>
      {data.items.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <StatusBadge value={item.isPublished ? "PUBLISHED" : "DRAFT"} />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{item.summary}</p>
              {item.outcome && (
                <p className="mt-2 text-xs font-medium text-accent">{item.outcome}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2">
                {item.service && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                    {item.service.name}
                  </span>
                )}
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          message="No portfolio items yet."
          hint="Run `npm run db:seed` to load starter case studies from the service catalogue."
        />
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold">Client reviews</h2>
      {data.reviews.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.reviews.map((review) => (
            <Card key={review.id} className="p-5">
              <div className="mb-2 flex items-center gap-1 text-amber-500">
                {Array.from({ length: review.rating }).map((_, i) => (
                  <Star key={i} className="size-3.5 fill-current" />
                ))}
              </div>
              <p className="text-sm leading-relaxed">“{review.body}”</p>
              <p className="mt-2 text-xs text-muted-foreground">
                — {review.author}
                {review.role ? `, ${review.role}` : ""}
                {review.company ? ` (${review.company})` : ""}
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState message="No reviews published yet." />
      )}
    </>
  );
}
