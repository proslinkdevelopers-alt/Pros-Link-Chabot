import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import {
  Callout,
  DataTable,
  DbNotice,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/admin/ui";
import { BroadcastComposer, type ComposerTemplate } from "@/components/admin/BroadcastComposer";
import { BroadcastSendButton } from "@/components/admin/BroadcastSendButton";
import { Megaphone, Send, Users } from "lucide-react";
import { config } from "@/lib/config";
import { formatDateTime, truncate } from "@/lib/utils";

export const metadata = { title: "Broadcasts" };

/**
 * Broadcast campaigns.
 *
 * Every row is a Meta-approved template sent to an opted-in audience. The two
 * numbers worth reading are on each row: how many messages Meta accepted, and
 * how many actually arrived — they are different facts, and the gap between
 * them is the first thing to look at when a campaign underperforms.
 */
export default async function BroadcastsPage() {
  await requirePagePermission("whatsapp.manage", "/admin/messaging/broadcasts");

  const { data, error } = await safeQuery(
    async () => {
      const [broadcasts, sent, reach, templates, waiting] = await Promise.all([
        prisma.broadcast.findMany({
          where: OWN,
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { template: { select: { name: true, status: true } } },
        }),
        prisma.broadcast.count({ where: { ...OWN, status: "SENT" } }),
        prisma.broadcast.aggregate({
          where: { ...OWN, status: "SENT" },
          _sum: { delivered: true },
        }),
        // Only approved templates can open a conversation outside the 24-hour
        // window, so they are the only ones the composer is given.
        prisma.whatsappTemplate.findMany({
          where: { status: "APPROVED", metaId: { not: null }, ...OWN },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            metaName: true,
            languageCode: true,
            body: true,
            headerText: true,
            headerFormat: true,
            footerText: true,
            variables: true,
          },
        }),
        // Recipients still to be messaged, per broadcast — what the Send and
        // Retry buttons act on.
        prisma.broadcastRecipient.groupBy({
          by: ["broadcastId"],
          where: { status: { in: ["PENDING", "FAILED"] } },
          _count: { _all: true },
        }),
      ]);

      return {
        broadcasts,
        sent,
        reach: reach._sum.delivered ?? 0,
        templates: templates as ComposerTemplate[],
        pending: new Map(waiting.map((row) => [row.broadcastId, row._count._all])),
      };
    },
    {
      broadcasts: [],
      sent: 0,
      reach: 0,
      templates: [] as ComposerTemplate[],
      pending: new Map<string, number>(),
    }
  );

  return (
    <>
      <PageHeader
        eyebrow="WhatsApp"
        title="Broadcasts"
        description="Segmented WhatsApp campaigns sent through Meta-approved templates, always to opted-in audiences. Anyone who has sent STOP is excluded automatically."
      />

      {error && <DbNotice error={error} />}

      {!config.whatsapp.enabled && (
        <div className="mb-5">
          <Callout title="WhatsApp is not connected">
            Set <code>WHATSAPP_PHONE_ID</code> and <code>WHATSAPP_TOKEN</code> to send.
            Campaigns can still be drafted here.
          </Callout>
        </div>
      )}

      {config.whatsapp.enabled && !data.templates.length && (
        <div className="mb-5">
          <Callout title="No approved templates">
            A broadcast reaches people outside the 24-hour reply window, which Meta only allows
            through a template it has approved.{" "}
            <Link href="/admin/messaging/templates" className="text-primary hover:underline">
              Sync or submit one
            </Link>{" "}
            before composing a campaign.
          </Callout>
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Campaigns" value={data.broadcasts.length} icon={Megaphone} />
        <StatCard label="Sent" value={data.sent} icon={Send} />
        <StatCard
          label="Messages delivered"
          value={data.reach}
          hint="Confirmed by Meta, not just accepted"
          icon={Users}
        />
      </div>

      <div className="mb-5">
        <BroadcastComposer templates={data.templates} />
      </div>

      <DataTable
        rows={data.broadcasts}
        rowKey={(row) => row.id}
        empty="No broadcasts yet. Create one from an approved template and an audience filter."
        columns={[
          {
            header: "Reference",
            cell: (row) => (
              <Link
                href={`/admin/messaging/broadcasts/${row.id}`}
                className="font-mono text-xs text-primary hover:underline"
              >
                {row.reference}
              </Link>
            ),
          },
          {
            header: "Campaign",
            cell: (row) => (
              <div className="min-w-0 max-w-sm">
                <p className="text-sm font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">{truncate(row.body, 100)}</p>
              </div>
            ),
          },
          {
            header: "Template",
            cell: (row) => (
              <div className="min-w-0">
                <p className="text-xs">{row.template?.name ?? "Deleted template"}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {row.templateName ?? "—"}
                  {row.languageCode ? ` · ${row.languageCode}` : ""}
                </p>
              </div>
            ),
          },
          { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
          {
            header: "Reach",
            cell: (row) => (
              <div className="whitespace-nowrap text-xs">
                <p>
                  {row.delivered} delivered / {row.sent} sent
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {row.recipients} targeted
                  {row.failed > 0 ? ` · ${row.failed} failed` : ""}
                </p>
              </div>
            ),
          },
          {
            header: "When",
            cell: (row) => (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(row.sentAt ?? row.scheduledAt ?? row.createdAt)}
              </span>
            ),
          },
          {
            header: "",
            cell: (row) => (
              <BroadcastSendButton
                id={row.id}
                status={row.status}
                pending={data.pending.get(row.id) ?? 0}
                title={row.title}
                canSend={config.whatsapp.enabled}
              />
            ),
          },
        ]}
      />
    </>
  );
}
