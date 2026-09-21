import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCheck, Send, TriangleAlert, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { isOwn, safeQuery } from "@/lib/admin/queries";
import {
  DataTable,
  DbNotice,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/admin/ui";
import { BroadcastSendButton } from "@/components/admin/BroadcastSendButton";
import { Card } from "@/components/ui/card";
import { config } from "@/lib/config";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Broadcast" };

/**
 * One broadcast, recipient by recipient.
 *
 * The list page can only show totals. This is where a specific question gets
 * an answer — whether one number received the message, and what Meta said if
 * it did not. Failures are shown first, because they are the only rows anyone
 * opens this page to read.
 */
export default async function BroadcastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("whatsapp.manage", "/admin/messaging/broadcasts");
  const { id } = await params;

  const { data, error } = await safeQuery(
    async () => {
      const broadcast = await prisma.broadcast.findUnique({
        where: { id },
        include: {
          template: { select: { name: true, metaName: true, status: true, body: true } },
          createdBy: { select: { name: true } },
        },
      });
      if (!broadcast) return null;

      const [recipients, pending] = await Promise.all([
        prisma.broadcastRecipient.findMany({
          where: { broadcastId: id },
          // Failures first, then everyone still waiting, then the rest.
          orderBy: [{ status: "asc" }, { sentAt: "desc" }],
          take: 500,
        }),
        prisma.broadcastRecipient.count({
          where: { broadcastId: id, status: { in: ["PENDING", "FAILED"] } },
        }),
      ]);

      return { broadcast, recipients, pending };
    },
    null
  );

  if (error) {
    return (
      <>
        <PageHeader title="Broadcast" description="Campaign detail." />
        <DbNotice error={error} />
      </>
    );
  }

  if (!data || !isOwn(data.broadcast.department)) notFound();

  const { broadcast, recipients, pending } = data;

  return (
    <>
      <Link
        href="/admin/messaging/broadcasts"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" /> All broadcasts
      </Link>

      <PageHeader
        eyebrow="Broadcast"
        title={broadcast.title}
        description={`${broadcast.reference} · created by ${broadcast.createdBy?.name ?? "an earlier version of this console"} on ${formatDateTime(broadcast.createdAt)}`}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge value={broadcast.status} />
        {broadcast.templateName && (
          <span className="rounded-full border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {broadcast.templateName} · {broadcast.languageCode}
          </span>
        )}
        <div className="ml-auto">
          <BroadcastSendButton
            id={broadcast.id}
            status={broadcast.status}
            pending={pending}
            title={broadcast.title}
            canSend={config.whatsapp.enabled}
          />
        </div>
      </div>

      {broadcast.error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>{broadcast.error}</p>
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Targeted" value={broadcast.recipients} icon={Users} />
        <StatCard
          label="Accepted by Meta"
          value={broadcast.sent}
          hint="Handed over for delivery"
          icon={Send}
        />
        <StatCard
          label="Delivered"
          value={broadcast.delivered}
          hint={`${broadcast.readCount} read`}
          icon={CheckCheck}
        />
        <StatCard label="Failed" value={broadcast.failed} icon={TriangleAlert} />
      </div>

      <Card className="mb-5 p-4">
        <h2 className="mb-2 text-sm font-semibold">What was sent</h2>
        <p className="whitespace-pre-wrap rounded-xl bg-secondary/60 p-3 text-xs leading-relaxed">
          {broadcast.body}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Placeholders are shown filled with a sample contact&rsquo;s values. Each recipient
          received their own.
          {broadcast.startedAt && ` Started ${formatDateTime(broadcast.startedAt)}.`}
        </p>
      </Card>

      <DataTable
        rows={recipients}
        rowKey={(row) => row.id}
        empty="No recipients on this broadcast yet."
        columns={[
          {
            header: "Contact",
            cell: (row) => (
              <div className="min-w-0">
                <p className="font-medium">{row.name ?? "Unnamed"}</p>
                <a
                  href={`https://wa.me/${row.waId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  {row.phone}
                </a>
              </div>
            ),
          },
          { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
          {
            header: "Sent",
            cell: (row) => (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(row.sentAt)}
              </span>
            ),
          },
          {
            header: "Delivered",
            cell: (row) => (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(row.readAt ?? row.deliveredAt)}
              </span>
            ),
          },
          {
            header: "Detail",
            cell: (row) =>
              row.error ? (
                <span className="text-xs text-destructive">{row.error}</span>
              ) : (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {row.messageId ? `${row.messageId.slice(0, 22)}…` : "—"}
                </span>
              ),
          },
        ]}
      />

      {broadcast.recipients > recipients.length && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Showing the first {recipients.length} of {broadcast.recipients} recipients.
        </p>
      )}
    </>
  );
}
