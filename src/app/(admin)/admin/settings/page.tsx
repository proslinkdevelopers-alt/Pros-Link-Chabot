import Link from "next/link";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { requirePagePermission } from "@/lib/staff";
import { safeQuery } from "@/lib/admin/queries";
import { getCompanyProfile, EMPTY_COMPANY_PROFILE, hasContact } from "@/lib/company";
import { integrationStatus } from "@/lib/admin/integrations";
import { BRAND } from "@/config/brand";
import { Card } from "@/components/ui/card";
import { Callout, DbNotice, LinkTabs, PageHeader } from "@/components/admin/ui";
import { CompanyProfileForm } from "@/components/admin/CompanyProfileForm";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePagePermission("settings.manage", "/admin/settings");
  const { tab } = await searchParams;
  const integrations = tab === "integrations";
  const { data: profile, error } = await safeQuery(() => getCompanyProfile({ fresh: true }), EMPTY_COMPANY_PROFILE);

  return (
    <>
      <PageHeader eyebrow="Administration" title="Settings" description="Company details customers see, and the state of each integration. Secrets are set as environment variables on the server, never here." />
      <DbNotice error={error} />
      <LinkTabs
        active={integrations ? "integrations" : "company"}
        tabs={[
          { key: "company", label: "Company profile", href: "/admin/settings" },
          { key: "integrations", label: "Integrations", href: "/admin/settings?tab=integrations" },
        ]}
      />

      {integrations ? (
        <div className="space-y-3">
          {integrationStatus().map((item) => (
            <Card key={item.name} className="flex items-start gap-3 p-4">
              {item.state === "ready" ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Configured" />
              ) : item.state === "missing" ? (
                <XCircle className="mt-0.5 size-5 shrink-0 text-rose-600" aria-label="Not configured" />
              ) : (
                <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Optional, not configured" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{item.detail}</p>
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {item.env.map((name) => (
                    <code key={name} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">
                      {name}
                    </code>
                  ))}
                </p>
              </div>
            </Card>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">
            Assistant behaviour — menus, flows, business hours, teams and wording — is edited in <Link href="/admin/chatbot" className="text-primary hover:underline">Chatbot Studio</Link>.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {!hasContact(profile) && (
              <div className="mb-6">
                <Callout title="No contact details yet" tone="warning">
                  Until a phone number, WhatsApp number or email is entered, the website and the assistant offer a callback request instead of contact details.
                </Callout>
              </div>
            )}
            <CompanyProfileForm initial={profile} />
          </div>
          <Card className="h-fit bg-brand-ink p-5 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-sky">Brand</p>
            <p className="mt-2 text-lg font-bold">{BRAND.name}</p>
            <p className="text-sm text-white/65">{BRAND.tagline}</p>
            <dl className="mt-4 space-y-2 text-[13px]">
              <div>
                <dt className="text-white/50">Assistant</dt>
                <dd>{BRAND.assistant.name}</dd>
              </div>
              <div>
                <dt className="text-white/50">Console</dt>
                <dd>{BRAND.console.name}</dd>
              </div>
              <div>
                <dt className="text-white/50">Serving</dt>
                <dd>{BRAND.serviceArea}</dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] leading-relaxed text-white/50">The name, colours and wording are set in the code (src/config/brand.ts) so every surface stays consistent.</p>
          </Card>
        </div>
      )}
    </>
  );
}
