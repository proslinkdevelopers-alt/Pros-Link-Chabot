import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { Card } from "@/components/ui/card";
import { ChannelBadge, DbNotice, EmptyState, FilterBar, FilterChip, PageHeader, Pagination, SearchForm } from "@/components/admin/ui";
import { cn, formatDateTime, truncate } from "@/lib/utils";

export const metadata = { title: "Conversations" };

const PAGE_SIZE = 30;
const VIEWS = {
  open: "Open",
  unread: "Unread",
  mine: "Assigned to me",
  team: "Waiting for the team",
  leads: "New leads",
  sales: "Sales",
  support: "Support",
  closed: "Closed",
} as const;
type View = keyof typeof VIEWS;
type Search = { view?: string; channel?: string; q?: string; page?: string };

const SALES_TEAMS = ["SALES", "CORPORATE"];
const SUPPORT_TEAMS = ["SUPPORT", "SERVICE", "PARTS", "ACCOUNTS"];

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await requirePagePermission("conversations.view", "/admin/conversations");
  const params = await searchParams;
  const view: View = (params.view && params.view in VIEWS ? params.view : "open") as View;
  const channel = params.channel === "WEB" || params.channel === "WHATSAPP" ? params.channel : undefined;
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const phone = q.replace(/\D/g, "");

  const { data, error } = await safeQuery(
    async () => {
      // "Unread" compares two columns, which Prisma cannot express; find those ids first.
      const unreadIds =
        view === "unread"
          ? (
              await prisma.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM conversations
                WHERE "department"::text = ${DEPARTMENT} AND status = 'OPEN' AND "lastInboundAt" IS NOT NULL
                  AND ("readAt" IS NULL OR "readAt" < "lastInboundAt")
                ORDER BY "lastInboundAt" DESC LIMIT 500`
            ).map((row) => row.id)
          : [];

      const byView: Record<View, Prisma.ConversationWhereInput> = {
        open: { status: "OPEN" },
        unread: { id: { in: unreadIds } },
        mine: { status: "OPEN", assigneeId: staff.id },
        team: { status: "OPEN", handedOff: true },
        leads: { status: "OPEN", leads: { some: { stage: "NEW" } } },
        sales: { status: "OPEN", OR: [{ handoverTeam: { in: SALES_TEAMS } }, { leads: { some: {} } }, { quotes: { some: {} } }] },
        support: { status: "OPEN", OR: [{ handoverTeam: { in: SUPPORT_TEAMS } }, { tickets: { some: {} } }] },
        closed: { status: "CLOSED" },
      };
      const where: Prisma.ConversationWhereInput = {
        ...OWN,
        ...byView[view],
        ...(channel ? { channel } : {}),
        ...(q
          ? {
              OR: [
                { reference: { contains: q, mode: "insensitive" } },
                { contactName: { contains: q, mode: "insensitive" } },
                ...(phone.length >= 4 ? [{ contactPhone: { contains: phone.slice(-10) } }] : []),
              ],
            }
          : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.conversation.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true, reference: true, channel: true, contactName: true, contactPhone: true, handedOff: true, handoverTeam: true, botPaused: true,
            status: true, tags: true, intent: true, lastInboundAt: true, readAt: true, updatedAt: true,
            assignee: { select: { name: true } },
            customer: { select: { name: true, company: true } },
            messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, role: true, authorId: true } },
          },
        }),
        prisma.conversation.count({ where }),
      ]);
      return { rows, total };
    },
    { rows: [], total: 0 }
  );

  const href = (changes: Partial<Search>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ view: view === "open" ? undefined : view, channel, q, ...changes })) if (value) next.set(key, String(value));
    return `/admin/conversations${next.size ? `?${next}` : ""}`;
  };

  return (
    <>
      <PageHeader eyebrow="Inbox" title="Conversations" description="Every conversation from the website assistant and WhatsApp in one place. Open one to reply, assign it, or turn it into a lead, quote or ticket." />
      <DbNotice error={error} />
      <FilterBar>
        {(Object.keys(VIEWS) as View[]).map((key) => (
          <FilterChip key={key} href={href({ view: key === "open" ? undefined : key, page: undefined })} label={VIEWS[key]} active={view === key} />
        ))}
      </FilterBar>
      <SearchForm action="/admin/conversations" query={q} placeholder="Search name, phone or reference" keep={{ view: view === "open" ? undefined : view }}>
        <div className="flex gap-1">
          <FilterChip href={href({ channel: undefined, page: undefined })} label="All channels" active={!channel} />
          <FilterChip href={href({ channel: "WHATSAPP", page: undefined })} label="WhatsApp" active={channel === "WHATSAPP"} />
          <FilterChip href={href({ channel: "WEB", page: undefined })} label="Website" active={channel === "WEB"} />
        </div>
      </SearchForm>

      {data.rows.length ? (
        <Card className="divide-y overflow-hidden p-0">
          {data.rows.map((row) => {
            const unread = Boolean(row.lastInboundAt && (!row.readAt || row.readAt < row.lastInboundAt)) && row.status === "OPEN";
            const last = row.messages[0];
            const who = row.customer?.name || row.contactName || row.contactPhone || "Website visitor";
            return (
              <Link key={row.id} href={`/admin/conversations/${row.id}`} className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/40">
                <span className={cn("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-primary" : "bg-transparent")} aria-label={unread ? "Unread" : undefined} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("truncate text-sm", unread ? "font-bold" : "font-semibold")}>{who}</span>
                    {row.customer?.company && <span className="truncate text-xs text-muted-foreground">{row.customer.company}</span>}
                    <ChannelBadge value={row.channel} />
                    {row.handedOff && row.status === "OPEN" && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Waiting · {row.handoverTeam ? row.handoverTeam.toLowerCase() : "team"}</span>
                    )}
                    {row.botPaused && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold">Assistant paused</span>}
                    {row.tags.map((tag) => (
                      <span key={tag} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  {last && (
                    <p className="mt-1 truncate text-[13px] text-muted-foreground">
                      {last.role === "USER" ? "" : last.authorId ? "Team: " : "Assistant: "}
                      {truncate(last.content.replace(/\s+/g, " "), 140)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                  <p>{formatDateTime(row.updatedAt)}</p>
                  <p className="mt-1">{row.assignee?.name ?? "Unassigned"}</p>
                </div>
              </Link>
            );
          })}
        </Card>
      ) : (
        <EmptyState message={q ? "No conversations match." : "No conversations here."} hint="Conversations appear as soon as a customer writes to the website assistant or the WhatsApp number." />
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} href={(next) => href({ page: String(next) })} />
    </>
  );
}
