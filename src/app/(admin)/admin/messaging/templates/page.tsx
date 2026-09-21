import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import {
  Callout,
  DbNotice,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { TemplateToolbar } from "@/components/admin/TemplateToolbar";
import { TemplateCardActions } from "@/components/admin/TemplateCardActions";
import { config } from "@/lib/config";
import { formatDateTime } from "@/lib/utils";
import { CheckCircle2, Clock, FileText } from "lucide-react";

export const metadata = { title: "WhatsApp Templates" };

/**
 * The WhatsApp Business Account's message templates, mirrored locally.
 *
 * Meta owns this list. Everything here is a reflection of what a sync last
 * read, which is why the sync time is printed on every card — a template shown
 * as approved that Meta rejected an hour ago would send nothing but errors.
 */
export default async function TemplatesPage() {
  await requirePagePermission("whatsapp.manage", "/admin/messaging/templates");

  const { data, error } = await safeQuery(
    async () => {
      // Templates synced from Meta arrive unassigned, and stay visible.
      const where = OWN;

      const [templates, approved, pending] = await Promise.all([
        prisma.whatsappTemplate.findMany({
          where,
          orderBy: [{ status: "asc" }, { name: "asc" }],
        }),
        prisma.whatsappTemplate.count({ where: { ...where, status: "APPROVED" } }),
        prisma.whatsappTemplate.count({ where: { ...where, status: "PENDING" } }),
      ]);
      return { templates, approved, pending };
    },
    { templates: [], approved: 0, pending: 0 }
  );

  const lastSync = data.templates.reduce<Date | null>(
    (latest, template) =>
      template.syncedAt && (!latest || template.syncedAt > latest) ? template.syncedAt : latest,
    null
  );

  return (
    <>
      <PageHeader
        eyebrow="Support & Messaging"
        title="WhatsApp Templates"
        description="Meta-approved message templates. Broadcasts, acknowledgements and reminders all send through these — a template Meta has not approved cannot reach anyone outside the 24-hour reply window."
      />

      {error && <DbNotice error={error} />}

      {!config.whatsapp.templatesEnabled && (
        <div className="mb-5">
          <Callout title="Meta's template list is not connected">
            Set <code>WHATSAPP_WABA_ID</code> to the WhatsApp Business Account ID (Meta ▸
            WhatsApp ▸ API Setup — the id above the phone number ID), and make sure{" "}
            <code>WHATSAPP_TOKEN</code> carries <code>whatsapp_business_management</code>.
            Until then templates cannot be synced or submitted from here, and broadcasts have
            nothing approved to send.
          </Callout>
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Templates" value={data.templates.length} icon={FileText} />
        <StatCard
          label="Approved"
          value={data.approved}
          hint="Ready to broadcast"
          icon={CheckCircle2}
        />
        <StatCard
          label="Awaiting Meta"
          value={data.pending}
          hint="Under review"
          icon={Clock}
        />
      </div>

      <div className="mb-5">
        <TemplateToolbar canSync={config.whatsapp.templatesEnabled} />
        {lastSync && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Last synced from Meta {formatDateTime(lastSync)}.
          </p>
        )}
      </div>

      {data.templates.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.templates.map((template) => (
            <Card key={template.id} className="flex flex-col p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{template.name}</h3>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {template.metaName} · {template.languageCode}
                  </p>
                </div>
                <StatusBadge value={template.status} />
              </div>

              <div className="rounded-xl bg-secondary/60 p-3 text-xs leading-relaxed">
                {template.headerText && (
                  <p className="mb-1.5 font-semibold">{template.headerText}</p>
                )}
                {template.headerFormat && template.headerFormat !== "TEXT" && (
                  <p className="mb-1.5 rounded-lg border border-dashed px-2 py-1 text-[11px] text-muted-foreground">
                    {template.headerFormat.toLowerCase()} header — Meta keeps the format but not
                    the file, so every broadcast on this template needs its own media URL.
                  </p>
                )}
                <p className="whitespace-pre-wrap">{template.body}</p>
                {template.footerText && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {template.footerText}
                  </p>
                )}
              </div>

              {template.status === "REJECTED" && template.rejectedReason && (
                <p className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                  Meta rejected this: {template.rejectedReason.replace(/_/g, " ").toLowerCase()}.
                  A rejected template cannot be edited — submit a new one under a different name.
                </p>
              )}

              {!template.metaId && (
                <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                  Never submitted to Meta, so it cannot be sent. It exists only in this console.
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2">
                <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {template.category.toLowerCase()}
                </span>
                {template.qualityScore && (
                  <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                    quality {template.qualityScore.toLowerCase()}
                  </span>
                )}
                {template.variables.map((variable, index) => (
                  <span
                    key={`${variable}-${index}`}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                  >
                    {`{{${index + 1}}}`} {variable}
                  </span>
                ))}
              </div>

              <div className="mt-2.5 border-t pt-2.5">
                <TemplateCardActions
                  id={template.id}
                  metaName={template.metaName}
                  inMeta={Boolean(template.metaId)}
                />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          message="No templates yet."
          hint={
            config.whatsapp.templatesEnabled
              ? "Sync from Meta to pull in the templates this business account already has, or submit a new one for approval."
              : "Set WHATSAPP_WABA_ID to connect Meta's template list."
          }
        />
      )}
    </>
  );
}
