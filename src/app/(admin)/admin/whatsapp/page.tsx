import Link from "next/link";
import { CheckCircle2, CircleDashed, ClipboardList, Megaphone, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { integrationStatus } from "@/lib/admin/integrations";
import { config } from "@/lib/config";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DbNotice, PageHeader, Section, StatCard } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "WhatsApp" };

export default async function WhatsAppPage() {
  await requirePagePermission("whatsapp.manage", "/admin/whatsapp");
  const week = new Date(Date.now() - 7 * 86_400_000);

  const { data, error } = await safeQuery(
    async () => {
      const [contacts, optedOut, conversations, inbound, outbound, lastInbound, templates, broadcasts, recent] = await Promise.all([
        prisma.whatsappContact.count({ where: OWN }),
        prisma.whatsappContact.count({ where: { ...OWN, optedOut: true } }),
        prisma.conversation.count({ where: { ...OWN, channel: "WHATSAPP", updatedAt: { gte: week } } }),
        prisma.message.count({ where: { conversation: { ...OWN, channel: "WHATSAPP" }, role: "USER", createdAt: { gte: week } } }),
        prisma.message.count({ where: { conversation: { ...OWN, channel: "WHATSAPP" }, role: "ASSISTANT", createdAt: { gte: week } } }),
        prisma.whatsappContact.findFirst({ where: { ...OWN, lastInboundAt: { not: null } }, orderBy: { lastInboundAt: "desc" }, select: { lastInboundAt: true } }),
        prisma.whatsappTemplate.groupBy({ by: ["status"], where: OWN, _count: true }),
        prisma.broadcast.count({ where: OWN }),
        prisma.conversation.findMany({
          where: { ...OWN, channel: "WHATSAPP" },
          orderBy: { updatedAt: "desc" },
          take: 8,
          select: { id: true, contactName: true, contactPhone: true, updatedAt: true, handedOff: true },
        }),
      ]);
      return { contacts, optedOut, conversations, inbound, outbound, lastInbound: lastInbound?.lastInboundAt ?? null, templates, broadcasts, recent };
    },
    { contacts: 0, optedOut: 0, conversations: 0, inbound: 0, outbound: 0, lastInbound: null, templates: [], broadcasts: 0, recent: [] }
  );

  const status = integrationStatus().filter((item) => item.name.startsWith("WhatsApp"));
  const approved = data.templates.find((entry) => entry.status === "APPROVED")?._count ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="WhatsApp"
        title="WhatsApp"
        description="The Pros-Link WhatsApp Business number, connected through Meta's Cloud API. The assistant answers here with the same menus and flows as on the website."
        actions={
          <>
            <Link href="/admin/messaging/templates" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ClipboardList /> Templates
            </Link>
            <Link href="/admin/messaging/broadcasts" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Megaphone /> Broadcasts
            </Link>
          </>
        }
      />
      <DbNotice error={error} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Conversations this week" value={data.conversations} href="/admin/conversations?channel=WHATSAPP" />
        <StatCard label="Messages this week" value={data.inbound + data.outbound} hint={`${data.inbound} received · ${data.outbound} sent`} />
        <StatCard label="Contacts" value={data.contacts} hint={`${data.optedOut} opted out of marketing`} />
        <StatCard label="Approved templates" value={approved} hint={`${data.broadcasts} broadcasts sent or drafted`} href="/admin/messaging/templates" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Section title="Connection" description="Read from the server's environment. Values are never shown.">
          <div className="space-y-3">
            {status.map((item) => (
              <div key={item.name} className="flex items-start gap-3">
                {item.state === "ready" ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Configured" />
                ) : item.state === "missing" ? (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-rose-600" aria-label="Not configured" />
                ) : (
                  <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Optional" />
                )}
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-[13px] text-muted-foreground">{item.detail}</p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {item.env.map((name) => (
                      <code key={name} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">
                        {name}
                      </code>
                    ))}
                  </p>
                </div>
              </div>
            ))}
            <Card className="bg-secondary/40 p-3 shadow-none">
              <p className="text-[11.5px] font-medium text-muted-foreground">Webhook callback URL to register in Meta</p>
              <code className="mt-1 block break-all text-sm">{config.whatsapp.webhookUrl}</code>
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                Subscribe to the <strong>messages</strong> field. Last message received: {data.lastInbound ? formatDateTime(data.lastInbound) : "none yet"}.
              </p>
            </Card>
          </div>
        </Section>

        <Section title="Latest WhatsApp conversations">
          {data.recent.length ? (
            <ul className="divide-y text-sm">
              {data.recent.map((conversation) => (
                <li key={conversation.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <Link href={`/admin/conversations/${conversation.id}`} className="min-w-0 truncate hover:text-primary hover:underline">
                    {conversation.contactName || conversation.contactPhone}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {conversation.handedOff ? "Waiting · " : ""}
                    {formatDateTime(conversation.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No WhatsApp conversations yet.</p>
          )}
        </Section>
      </div>
    </>
  );
}
