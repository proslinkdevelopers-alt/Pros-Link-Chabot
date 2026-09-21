import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip } from "lucide-react";
import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { peopleWith } from "@/lib/admin/people";
import { activityTimeline } from "@/lib/admin/timeline";
import { readCapture } from "@/lib/capture";
import { DETAIL_LABELS, MEETING_MODE_LABEL, asCustomerDetails, type CustomerDetails } from "@/lib/ai/customer";
import { readBotState } from "@/lib/bot/types";
import { QUOTE_STATUS_LABEL, STAGE_LABEL, TICKET_STATUS_LABEL, MEETING_STATUS_LABEL, labelFor } from "@/lib/admin/labels";
import { Card } from "@/components/ui/card";
import { ChannelBadge, DbNotice, DetailList, PageHeader, Section, StatusBadge, Timeline } from "@/components/admin/ui";
import { InlineSelect, NoteComposer } from "@/components/admin/client/controls";
import { ConvertActions, ReplyBox, TagEditor, ThreadToggles } from "@/components/admin/inbox/InboxControls";
import { cn, formatDateTime, humanise, isUrduScript } from "@/lib/utils";

export const metadata = { title: "Conversation" };

const DAY_MS = 24 * 60 * 60 * 1000;

function detailValue(key: keyof CustomerDetails, value: string, categories: Map<string, string>): string {
  if (key === "productCategory") return categories.get(value) ?? value;
  if (key === "meetingMode") return MEETING_MODE_LABEL[value as keyof typeof MEETING_MODE_LABEL] ?? value;
  if (key === "topic" || key === "intent" || key === "supportCategory" || key === "priority") return labelFor(value);
  return value;
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requirePagePermission("conversations.view", `/admin/conversations/${id}`);
  const canReply = hasPermission(staff, "conversations.reply");
  const canManage = hasPermission(staff, "conversations.manage");

  const { data, error } = await safeQuery(
    async () => {
      const conversation = await prisma.conversation.findFirst({
        where: { id, ...OWN },
        include: {
          messages: { orderBy: { createdAt: "asc" }, take: 500 },
          assignee: { select: { name: true } },
          customer: { select: { id: true, name: true, company: true, reference: true } },
          leads: { select: { id: true, reference: true, stage: true } },
          quotes: { select: { id: true, reference: true, status: true } },
          tickets: { select: { id: true, reference: true, status: true } },
          meetings: { select: { id: true, reference: true, status: true } },
        },
      });
      if (!conversation) return null;
      const authorIds = [...new Set(conversation.messages.map((message) => message.authorId).filter(Boolean))] as string[];
      const [authors, contact, people, activity, categories] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } }),
        conversation.channel === "WHATSAPP" && conversation.contactPhone
          ? prisma.whatsappContact.findUnique({ where: { waId: conversation.contactPhone.replace(/\D/g, "") }, select: { lastInboundAt: true, optedOut: true } })
          : null,
        canManage ? peopleWith(["conversations.reply"]) : Promise.resolve([]),
        activityTimeline([{ entityType: "Conversation", entityId: id }]),
        prisma.productCategory.findMany({ where: OWN, select: { slug: true, name: true } }),
      ]);
      // Opening the thread marks it read for the team.
      if (canReply && conversation.lastInboundAt && (!conversation.readAt || conversation.readAt < conversation.lastInboundAt)) {
        await prisma.conversation.update({ where: { id }, data: { readAt: new Date() } });
      }
      return { conversation, authors, contact, people, activity, categories };
    },
    null
  );
  if (!error && !data) notFound();
  if (!data) return <DbNotice error={error} />;

  const { conversation, contact } = data;
  const capture = readCapture(conversation.capture);
  const details = asCustomerDetails(capture.details);
  const bot = readBotState(capture.bot);
  const authorName = new Map(data.authors.map((author) => [author.id, author.name]));
  const lastInbound = contact?.lastInboundAt ?? conversation.lastInboundAt;
  const windowOpen = conversation.channel === "WEB" || Boolean(lastInbound && Date.now() - lastInbound.getTime() < DAY_MS);
  const who = conversation.customer?.name || conversation.contactName || details.name || conversation.contactPhone || "Website visitor";
  const categoryNames = new Map(data.categories.map((category) => [category.slug, category.name]));
  const learned = DETAIL_LABELS.filter(([key]) => key !== "requirements" && details[key]).map(([key, label]) => [label, detailValue(key, details[key] as string, categoryNames)] as [string, string]);
  const canSeeMedia = hasPermission(staff, "conversations.view");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/conversations", label: "Conversations" }}
        eyebrow={conversation.reference}
        title={who}
        description={<>Started {formatDateTime(conversation.createdAt)} · {conversation.messages.length} messages{conversation.assignee ? ` · Assigned to ${conversation.assignee.name}` : ""}</>}
        actions={
          <>
            <ChannelBadge value={conversation.channel} />
            <StatusBadge value={conversation.status} label={conversation.status === "OPEN" ? "Open" : "Closed"} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <ThreadToggles conversationId={conversation.id} botPaused={conversation.botPaused} status={conversation.status} handedOff={conversation.handedOff} canReply={canReply} canManage={canManage} />
          <Card className="flex max-h-[72dvh] flex-col overflow-hidden p-0">
            <div className="scroll-slim flex-1 space-y-3 overflow-y-auto bg-secondary/25 p-4" aria-label="Messages">
              {conversation.messages.map((message) => {
                const fromCustomer = message.role === "USER";
                const staffAuthor = message.authorId ? authorName.get(message.authorId) ?? "Team member" : null;
                return (
                  <div key={message.id} className={cn("flex", fromCustomer ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[82%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-soft",
                        fromCustomer ? "rounded-bl-md bg-card" : staffAuthor ? "rounded-br-md bg-brand-navy text-white" : "rounded-br-md bg-primary text-primary-foreground"
                      )}
                    >
                      {message.mediaId && (
                        canSeeMedia ? (
                          <a href={`/api/admin/whatsapp/media/${encodeURIComponent(message.mediaId)}`} target="_blank" rel="noreferrer" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold underline">
                            <Paperclip className="size-3.5" aria-hidden /> {message.mediaType === "image" ? "Photo" : "Attachment"}
                          </a>
                        ) : null
                      )}
                      <p className={cn("whitespace-pre-wrap break-words", isUrduScript(message.content) && "urdu")}>{message.content}</p>
                      <p className={cn("mt-1 text-[10px]", fromCustomer ? "text-muted-foreground" : "text-white/70")}>
                        {fromCustomer ? "Customer" : staffAuthor ?? "Assistant"} · {formatDateTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              {!conversation.messages.length && <p className="py-10 text-center text-sm text-muted-foreground">No messages.</p>}
            </div>
            <ReplyBox conversationId={conversation.id} channel={conversation.channel} windowOpen={windowOpen} canReply={canReply && conversation.status === "OPEN"} />
          </Card>

          <Section title="Team notes">
            {canManage && (
              <div className="mb-6">
                <NoteComposer entityType="Conversation" entityId={conversation.id} />
              </div>
            )}
            <Timeline items={data.activity} empty="No notes yet." />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Contact">
            <DetailList
              items={[
                ["Name", conversation.contactName ?? details.name],
                ["Phone", conversation.contactPhone ?? details.phone],
                ["Customer profile", conversation.customer ? <Link key="c" href={`/admin/customers/${conversation.customer.id}`} className="text-primary hover:underline">{conversation.customer.name} · {conversation.customer.reference}</Link> : null],
                ["Marketing messages", contact?.optedOut ? <span key="o" className="font-medium text-destructive">Opted out</span> : null],
              ]}
            />
          </Section>

          <Section title="Handling">
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">Assigned to</p>
                {canManage ? (
                  <InlineSelect url={`/api/admin/conversations/${conversation.id}`} field="assigneeId" label="Assignee" value={conversation.assigneeId} empty="Unassigned" options={data.people} className="w-full" />
                ) : (
                  <p className="text-sm">{conversation.assignee?.name ?? "Unassigned"}</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">Tags</p>
                <TagEditor conversationId={conversation.id} tags={conversation.tags} canEdit={canManage} />
              </div>
              {conversation.handedOff && (
                <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-900">
                  The assistant handed this conversation to the {conversation.handoverTeam ? labelFor(conversation.handoverTeam).toLowerCase() : ""} team{conversation.handedOffAt ? ` on ${formatDateTime(conversation.handedOffAt)}` : ""}.
                </p>
              )}
            </div>
          </Section>

          <Section title="Records" description="Created from this conversation.">
            <ul className="mb-4 space-y-1.5 text-sm">
              {conversation.leads.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-2">
                  <Link href={`/admin/leads/${lead.id}`} className="text-primary hover:underline">Lead {lead.reference}</Link>
                  <StatusBadge value={lead.stage} label={STAGE_LABEL[lead.stage]} />
                </li>
              ))}
              {conversation.quotes.map((quote) => (
                <li key={quote.id} className="flex items-center justify-between gap-2">
                  <Link href={`/admin/quotes/${quote.id}`} className="text-primary hover:underline">Quote {quote.reference}</Link>
                  <StatusBadge value={quote.status} label={QUOTE_STATUS_LABEL[quote.status]} />
                </li>
              ))}
              {conversation.tickets.map((ticket) => (
                <li key={ticket.id} className="flex items-center justify-between gap-2">
                  <Link href={`/admin/tickets/${ticket.id}`} className="text-primary hover:underline">Ticket {ticket.reference}</Link>
                  <StatusBadge value={ticket.status} label={TICKET_STATUS_LABEL[ticket.status]} />
                </li>
              ))}
              {conversation.meetings.map((meeting) => (
                <li key={meeting.id} className="flex items-center justify-between gap-2">
                  <Link href="/admin/appointments" className="text-primary hover:underline">Appointment {meeting.reference}</Link>
                  <StatusBadge value={meeting.status} label={MEETING_STATUS_LABEL[meeting.status]} />
                </li>
              ))}
              {!conversation.leads.length && !conversation.quotes.length && !conversation.tickets.length && !conversation.meetings.length && (
                <li className="text-muted-foreground">Nothing yet.</li>
              )}
            </ul>
            <ConvertActions
              conversationId={conversation.id}
              can={{ lead: hasPermission(staff, "leads.manage"), quote: hasPermission(staff, "quotes.manage"), ticket: hasPermission(staff, "tickets.manage") }}
            />
          </Section>

          <Section title="What the customer shared">
            {learned.length || details.requirements ? (
              <>
                <DetailList items={learned} />
                {details.requirements && <p className="mt-3 whitespace-pre-line rounded-lg bg-secondary/50 p-3 text-[13px] leading-relaxed">{details.requirements}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            )}
          </Section>

          <Section title="Assistant">
            <DetailList
              items={[
                ["Topic", bot.intent ? labelFor(bot.intent) : null],
                ["Lead score", bot.score ? `${bot.score.value}/100 · ${labelFor(bot.score.temperature)}` : null],
                ["In progress", bot.flow ? `${labelFor(bot.flow.id)}${bot.flow.pending ? ` — waiting for ${labelFor(bot.flow.pending).toLowerCase()}` : ""}` : null],
                ["Corporate enquiry", bot.signals.enterprise ? "Yes" : null],
                ["Source", conversation.trafficSource ? humanise(conversation.trafficSource) : null],
                ["Campaign", conversation.campaign],
                ["Language", conversation.language],
              ]}
            />
            {bot.trail.length > 0 && <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">{bot.trail.join(" → ")}</p>}
          </Section>
        </div>
      </div>
    </>
  );
}
