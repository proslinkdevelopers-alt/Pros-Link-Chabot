import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ChannelBadge, PageHeader } from "@/components/admin/ui";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { isOwn, safeQuery } from "@/lib/admin/queries";
import { readCapture } from "@/lib/capture";
import {
  DETAIL_LABELS,
  MEETING_MODE_LABEL,
  type CustomerDetails,
} from "@/lib/ai/customer";
import { findService } from "@/data/marketing/services";
import { readBotState } from "@/lib/bot/types";
import { ConversationControls } from "@/components/admin/ConversationControls";
import { cn, formatDateTime, humanise, isUrduScript } from "@/lib/utils";

export const metadata = { title: "Conversation" };

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("conversations.view");
  const { id } = await params;

  const { data: conversation } = await safeQuery(
    () =>
      prisma.conversation.findUnique({
        where: { id },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          tickets: { select: { reference: true, status: true } },
          leads: { select: { id: true, reference: true } },
          meetings: { select: { reference: true, status: true } },
        },
      }),
    null
  );

  // An archived Institute conversation is not part of this console.
  if (!conversation || !isOwn(conversation.department)) notFound();

  const capture = readCapture(conversation.capture);
  const { details } = capture;
  const bot = readBotState(capture.bot);

  // Staff-written messages are shown as such, and the reply box only opens
  // while WhatsApp's 24-hour window is.
  const authorIds = Array.from(new Set(conversation.messages.map((m) => m.authorId).filter(Boolean))) as string[];
  const [{ data: authors }, { data: contact }] = await Promise.all([
    safeQuery(() => prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } }), []),
    safeQuery(
      () =>
        conversation.contactPhone
          ? prisma.whatsappContact.findUnique({
              where: { waId: conversation.contactPhone.replace(/\D/g, "") },
              select: { lastInboundAt: true, optedOut: true },
            })
          : Promise.resolve(null),
      null
    ),
  ]);
  const authorName = new Map(authors.map((author) => [author.id, author.name]));
  const windowOpen = Boolean(contact?.lastInboundAt && Date.now() - contact.lastInboundAt.getTime() < 24 * 60 * 60 * 1000);
  const learned = DETAIL_LABELS.filter(([key]) => key !== "requirements" && details[key]).map(
    ([key, label]) => [label, displayDetail(key, details[key] as string)] as const
  );

  return (
    <>
      <Link
        href="/admin/conversations"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" /> All conversations
      </Link>

      <PageHeader
        title={conversation.reference}
        description={`${conversation.messages.length} messages · started ${formatDateTime(
          conversation.createdAt
        )} · language ${conversation.language}`}
        actions={<ChannelBadge value={conversation.channel} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="scroll-slim max-h-[70dvh] space-y-4 overflow-y-auto p-5 lg:col-span-2">
          {conversation.messages.map((message) => {
            const isUser = message.role === "USER";
            return (
              <div
                key={message.id}
                className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    isUser
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-secondary text-secondary-foreground"
                  )}
                >
                  <p className={cn("whitespace-pre-wrap", isUrduScript(message.content) && "urdu")}>
                    {message.content}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[10px]",
                      isUser ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}
                  >
                    {message.authorId ? `${authorName.get(message.authorId) ?? "Team member"} · ` : ""}
                    {formatDateTime(message.createdAt)}
                    {message.latencyMs ? ` · ${message.latencyMs}ms` : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Customer details</h2>
            <p className="mb-3 mt-0.5 text-[11px] text-muted-foreground">
              What the assistant learned in conversation.
            </p>
            {learned.length || details.requirements ? (
              <>
                <dl className="space-y-2 text-sm">
                  {learned.map(([label, value]) => (
                    <Detail key={label} label={label} value={value} />
                  ))}
                </dl>
                {details.requirements && (
                  <div className={cn(learned.length > 0 && "mt-3 border-t pt-3")}>
                    <p className="text-[11px] text-muted-foreground">What they need</p>
                    <p className="mt-1 text-sm leading-relaxed">{details.requirements}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Nothing shared yet.</p>
            )}
          </Card>

          {conversation.channel === "WHATSAPP" && conversation.contactPhone && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">WhatsApp contact</h2>
              <dl className="space-y-2 text-sm">
                <Detail label="Name" value={conversation.contactName ?? "Not shared"} />
                <Detail label="Number" value={conversation.contactPhone} />
              </dl>
              {contact?.optedOut && (
                <p className="mt-2 text-[11px] font-medium text-destructive">Opted out of marketing messages</p>
              )}
              <div className="mt-4 border-t pt-4">
                <ConversationControls
                  conversationId={conversation.id}
                  botPaused={conversation.botPaused}
                  handedOff={conversation.handedOff}
                  windowOpen={windowOpen}
                />
              </div>
            </Card>
          )}

          {conversation.channel === "WHATSAPP" && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">Assistant</h2>
              <dl className="space-y-2 text-sm">
                <Detail label="Source" value={conversation.trafficSource ? humanise(conversation.trafficSource) : "—"} />
                {conversation.campaign && <Detail label="Campaign" value={conversation.campaign} />}
                {conversation.adId && <Detail label="Ad ID" value={conversation.adId} />}
                <Detail label="Intent" value={bot.intent ? humanise(bot.intent) : "—"} />
                <Detail
                  label="Lead score"
                  value={bot.score ? `${bot.score.value}/100 · ${humanise(bot.score.temperature)}` : "—"}
                />
                {bot.flow && <Detail label="In progress" value={`${humanise(bot.flow.id)}${bot.flow.pending ? ` → ${humanise(bot.flow.pending)}` : ""}`} />}
                {bot.signals.enterprise && <Detail label="Enterprise" value="Yes" />}
                {conversation.handoverTeam && <Detail label="Handed to" value={humanise(conversation.handoverTeam)} />}
                {bot.handover?.reference && <Detail label="Handover ref" value={bot.handover.reference} />}
              </dl>
              {bot.trail.length > 0 && (
                <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
                  {bot.trail.join(" → ")}
                </p>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Outcome</h2>
            <dl className="space-y-2 text-sm">
              <Detail
                label="Handed off"
                value={conversation.handedOff ? "Yes — waiting on a human" : "No"}
              />
              <Detail
                label="Rating"
                value={conversation.rating ? `${conversation.rating} / 5` : "Not rated"}
              />
              <Detail label="Language" value={conversation.language} />
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Records created</h2>
            <ul className="space-y-1.5 text-xs">
              {conversation.leads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/admin/crm/leads/${lead.id}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {lead.reference}
                  </Link>{" "}
                  <span className="text-muted-foreground">lead</span>
                </li>
              ))}
              {conversation.meetings.map((meeting) => (
                <li key={meeting.reference} className="text-muted-foreground">
                  <Link href="/admin/meetings" className="font-mono text-primary hover:underline">
                    {meeting.reference}
                  </Link>{" "}
                  consultation · {meeting.status}
                </li>
              ))}
              {conversation.tickets.map((ticket) => (
                <li key={ticket.reference} className="text-muted-foreground">
                  <span className="font-mono text-foreground">{ticket.reference}</span> ticket ·{" "}
                  {ticket.status}
                </li>
              ))}
              {!conversation.leads.length &&
                !conversation.meetings.length &&
                !conversation.tickets.length && (
                <li className="text-muted-foreground">Nothing captured from this chat.</li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

const INTENT_LABEL: Record<string, string> = {
  // Only the assistant's four engagement values; `topic` intents are humanised.
  PROJECT: "Start a project",
  CONSULTATION: "Book a consultation",
  SUPPORT: "Get support",
  BROWSING: "Just browsing",
};

function displayDetail(key: keyof CustomerDetails, value: string): string {
  if (key === "service") return findService(value)?.name ?? value;
  if (key === "meetingMode") return MEETING_MODE_LABEL[value as keyof typeof MEETING_MODE_LABEL] ?? value;
  if (key === "intent") return INTENT_LABEL[value] ?? value;
  if (key === "topic") return humanise(value);
  if (key === "supportCategory") return value.charAt(0) + value.slice(1).toLowerCase();
  return value;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}
