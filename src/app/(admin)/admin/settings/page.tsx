import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { Callout, DbNotice, EmptyState, PageHeader } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { BRAND } from "@/config/brand";
import { formatDateTime, humanise } from "@/lib/utils";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePagePermission("settings.manage", "/admin/settings");

  const { data, error } = await safeQuery(
    () =>
      prisma.setting.findMany({
        where: { ...OWN, NOT: { key: { startsWith: "bot." } } },
        orderBy: [{ group: "asc" }, { key: "asc" }],
      }),
    []
  );

  const groups = Array.from(new Set(data.map((setting) => setting.group)));

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Branding, company details and behaviour. Secrets live in environment variables, not here."
      />

      {error && <DbNotice error={error} />}

      {/* Brand identity summary — what the assistant currently tells people. */}
      <Card className="dark brand-gradient mb-6 overflow-hidden border-white/[0.06] p-6 text-foreground">
        <p className="eyebrow">Brand identity</p>
        <h2 className="mt-3 text-xl font-bold tracking-tight text-white">{BRAND.name}</h2>
        <p className="mt-1 text-sm text-white/60">{BRAND.tagline}</p>

        <dl className="mt-6 grid gap-x-8 gap-y-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <Row label="Reference prefix" value={BRAND.referencePrefix} />
        </dl>
      </Card>

      <Callout title="Where these values come from">
        These are the defaults in <code>src/config/brand.ts</code>. The WhatsApp assistant and the
        website chat use the contact details, hours and prices from{" "}
        <a href="/admin/chatbot/contact" className="font-semibold text-primary hover:underline">
          Chatbot Studio
        </a>
        , which start from these values and can be changed there without a deploy. The assistant
        never gives contact information beyond those values.
      </Callout>

      <h2 className="mb-3 mt-8 text-sm font-semibold">Stored settings</h2>
      {data.length ? (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {humanise(group)}
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {data
                  .filter((setting) => setting.group === group)
                  .map((setting) => (
                    <Card key={setting.id} className="p-4">
                      <p className="mb-1.5 font-mono text-xs font-medium">{setting.key}</p>
                      {setting.description && (
                        <p className="mb-2 text-xs text-muted-foreground">
                          {setting.description}
                        </p>
                      )}
                      <pre className="scroll-slim overflow-x-auto rounded-lg bg-secondary/60 p-2.5 text-[11px] leading-relaxed">
                        {setting.isSecret
                          ? "•••••••• (write-only)"
                          : JSON.stringify(setting.value, null, 2)}
                      </pre>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Updated {formatDateTime(setting.updatedAt)}
                      </p>
                    </Card>
                  ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          message="No stored settings."
          hint="Run `npm run db:seed` to create the default branding, company and behaviour settings."
        />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-white/10 pl-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium text-white/85">{value}</dd>
    </div>
  );
}
