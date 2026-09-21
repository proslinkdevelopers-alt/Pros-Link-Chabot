import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { safeQuery } from "@/lib/admin/queries";
import { Callout, DbNotice, PageHeader, StatusBadge } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { MARKETING_SERVICES } from "@/data/marketing/services";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  await requirePagePermission("settings.manage", "/admin/catalogue/services");

  // The database is the live source; the file catalogue is the fallback so the
  // page is still useful before the first `db:seed`.
  const { data: stored, error } = await safeQuery(
    () => prisma.legacyService.findMany({ orderBy: { sortOrder: "asc" } }),
    []
  );

  const services = stored.length
    ? stored.map((service) => ({
        slug: service.slug,
        name: service.name,
        group: service.group,
        tagline: service.tagline,
        priceFrom: service.priceFrom ?? "—",
        priceModel: service.priceModel ?? "—",
        priceNote: service.priceNote ?? "",
        features: service.features.length,
        process: service.process.length,
        isActive: service.isActive,
      }))
    : MARKETING_SERVICES.map((service) => ({
        slug: service.slug,
        name: service.name,
        group: service.group,
        tagline: service.tagline,
        priceFrom: service.pricing.startingAt,
        priceModel: service.pricing.model,
        priceNote: service.pricing.note,
        features: service.features.length,
        process: service.process.length,
        isActive: true,
      }));

  const groups = Array.from(new Set(services.map((s) => s.group)));

  return (
    <>
      <PageHeader
        eyebrow="Practice"
        title="Services"
        description="The service catalogue the assistant answers from. Edits here change what clients are told."
      />

      {error && <DbNotice error={error} />}

      <Callout title="Pricing is a placeholder">
        Every figure below is an indicative starting point. The assistant is instructed never to
        present these as final and always to offer a written quotation instead. Replace them once
        the rate card is approved.
      </Callout>

      <div className="mt-6 space-y-8">
        {groups.map((group) => (
          <section key={group}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {services
                .filter((service) => service.group === group)
                .map((service) => (
                  <Card key={service.slug} className="flex flex-col p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold">{service.name}</h3>
                      <StatusBadge value={service.isActive ? "PUBLISHED" : "ARCHIVED"} />
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {service.tagline}
                    </p>

                    <dl className="mt-3 space-y-1 text-[11px]">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">From</dt>
                        <dd className="font-medium">{service.priceFrom}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Model</dt>
                        <dd className="text-right">{service.priceModel}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Content</dt>
                        <dd>
                          {service.features} features · {service.process} steps
                        </dd>
                      </div>
                    </dl>

                    <p className="mt-3 border-t pt-2 font-mono text-[10px] text-muted-foreground">
                      {service.slug}
                    </p>
                  </Card>
                ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
