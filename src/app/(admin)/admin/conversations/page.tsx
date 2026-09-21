import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import {
  ChannelBadge,
  DataTable,
  DbNotice,
  FilterChip,
  PageHeader,
  StatCard,
} from "@/components/admin/ui";
import { MessageCircle, MessagesSquare, PhoneForwarded, Star } from "lucide-react";
import { formatDateTime, truncate } from "@/lib/utils";

export const metadata = { title: "Live Conversations" };

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requirePagePermission("conversations.view", "/admin/conversations");
  const { filter } = await searchParams;

  const filters: Record<string, Prisma.ConversationWhereInput> = {
    handoff: { handedOff: true },
    whatsapp: { channel: "WHATSAPP" },
    web: { channel: "WEB" },
  };
  const where = { ...OWN, ...(filters[filter ?? ""] ?? {}) };

  const { data, error } = await safeQuery(
    async () => {
      const [conversations, total, handoffs, whatsapp, rated] = await Promise.all([
        prisma.conversation.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: 60,
          include: {
            _count: { select: { messages: true, leads: true } },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { content: true, role: true },
            },
          },
        }),
        prisma.conversation.count({ where: OWN }),
        prisma.conversation.count({ where: { ...OWN, handedOff: true } }),
        prisma.conversation.count({ where: { ...OWN, channel: "WHATSAPP" } }),
        prisma.conversation.aggregate({
          where: { ...OWN, rating: { not: null } },
          _avg: { rating: true },
        }),
      ]);
      return { conversations, total, handoffs, whatsapp, rating: rated._avg.rating ?? 0 };
    },
    { conversations: [], total: 0, handoffs: 0, whatsapp: 0, rating: 0 }
  );

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Live Conversations"
        description="Every conversation the assistant has handled across the web widget and WhatsApp, newest first. Handed-off chats are the ones waiting on a human."
      />

      {error && <DbNotice error={error} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Conversations" value={data.total} icon={MessagesSquare} />
        <StatCard
          label="On WhatsApp"
          value={data.whatsapp}
          hint="Inbound to the business number"
          icon={MessageCircle}
          href="/admin/conversations?filter=whatsapp"
        />
        <StatCard
          label="Handed off"
          value={data.handoffs}
          hint="Escalated to a human"
          icon={PhoneForwarded}
          href="/admin/conversations?filter=handoff"
        />
        <StatCard
          label="Average rating"
          value={data.rating ? `${Number(data.rating).toFixed(1)} / 5` : "—"}
          icon={Star}
        />
      </div>

      <div className="scroll-slim mb-4 flex gap-2 overflow-x-auto pb-1">
        <FilterChip href="/admin/conversations" label="All" active={!filter} />
        <FilterChip
          href="/admin/conversations?filter=whatsapp"
          label="🟢 WhatsApp"
          active={filter === "whatsapp"}
        />
        <FilterChip
          href="/admin/conversations?filter=web"
          label="💬 Web chat"
          active={filter === "web"}
        />
        <FilterChip
          href="/admin/conversations?filter=handoff"
          label="Needs a human"
          active={filter === "handoff"}
        />
      </div>

      <DataTable
        rows={data.conversations}
        rowKey={(row) => row.id}
        empty="No conversations yet."
        columns={[
          {
            header: "Reference",
            cell: (row) => (
              <Link
                href={`/admin/conversations/${row.id}`}
                className="font-mono text-xs font-medium text-primary hover:underline"
              >
                {row.reference}
              </Link>
            ),
          },
          {
            header: "Channel",
            cell: (row) => (
              <div className="space-y-1">
                <ChannelBadge value={row.channel} />
                {row.contactPhone && (
                  <p className="text-[11px] text-muted-foreground">
                    {row.contactName ? `${row.contactName} · ` : ""}
                    {row.contactPhone}
                  </p>
                )}
              </div>
            ),
          },
          {
            header: "Last message",
            cell: (row) => (
              <div className="max-w-md">
                <p className="text-xs text-muted-foreground">
                  {row.messages[0]
                    ? `${row.messages[0].role === "USER" ? "Visitor" : "Assistant"}: ${truncate(
                        row.messages[0].content,
                        110
                      )}`
                    : "—"}
                </p>
              </div>
            ),
          },
          {
            header: "Messages",
            cell: (row) => <span className="text-xs">{row._count.messages}</span>,
          },
          {
            header: "Status",
            cell: (row) =>
              row.handedOff ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  Handed off
                </span>
              ) : row._count.leads > 0 ? (
                <span className="whitespace-nowrap rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  Lead captured
                </span>
              ) : (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                  Assistant
                </span>
              ),
          },
          {
            header: "Updated",
            cell: (row) => (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(row.updatedAt)}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
