import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSignature, MessageSquare } from "lucide-react";
import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { peopleWith } from "@/lib/admin/people";
import { activityTimeline, mergeTimeline } from "@/lib/admin/timeline";
import {
  LEAD_STAGES,
  MEETING_MODE_LABEL,
  MEETING_STATUS_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  QUOTE_STATUS_LABEL,
  SOURCE_LABEL,
  STAGE_LABEL,
  TEMPERATURE_LABEL,
} from "@/lib/admin/labels";
import { buttonVariants } from "@/components/ui/button";
import { ChannelBadge, DbNotice, DetailList, Muted, PageHeader, Section, StatusBadge, Timeline } from "@/components/admin/ui";
import { ActionButton, InlineSelect, NoteComposer, QuickEdit } from "@/components/admin/client/controls";
import { EditDialog } from "@/components/admin/client/EditDialog";
import { LeadForm } from "@/components/admin/crm/LeadForm";
import { formatDate, formatDateTime, formatPkr } from "@/lib/utils";
import { digits } from "@/lib/company-schema";

export const metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requirePagePermission("leads.view", `/admin/leads/${id}`);

  const { data, error } = await safeQuery(
    async () => {
      const lead = await prisma.lead.findFirst({
        where: { id, ...OWN },
        include: {
          owner: { select: { name: true } },
          productCategory: { select: { name: true } },
          product: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, reference: true } },
          conversation: { select: { id: true, reference: true, channel: true } },
          quotes: { orderBy: { createdAt: "desc" }, select: { id: true, reference: true, title: true, status: true, total: true, createdAt: true } },
          meetings: { orderBy: { preferredDate: "desc" }, select: { id: true, reference: true, mode: true, status: true, preferredDate: true, preferredTime: true } },
        },
      });
      if (!lead) return null;
      const [people, categories, products, activity] = await Promise.all([
        peopleWith(["leads.manage"]),
        prisma.productCategory.findMany({ where: OWN, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
        prisma.product.findMany({ where: { ...OWN, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        activityTimeline([
          { entityType: "Lead", entityId: id },
          ...lead.quotes.map((quote) => ({ entityType: "Quote", entityId: quote.id, label: quote.reference })),
        ]),
      ]);
      return { lead, people, categories, products, activity };
    },
    null
  );
  if (!error && !data) notFound();
  if (!data) return <DbNotice error={error} />;

  const { lead } = data;
  const canManage = hasPermission(staff, "leads.manage");
  const url = `/api/admin/leads/${lead.id}`;
  const whatsappNumber = digits(lead.whatsapp || lead.phone);

  const timeline = mergeTimeline(data.activity, [
    {
      id: "created",
      at: lead.createdAt,
      title: `Lead created · ${SOURCE_LABEL[lead.source] ?? lead.source}`,
      body: lead.conversation ? `From a ${lead.conversation.channel === "WHATSAPP" ? "WhatsApp" : "website"} conversation.` : undefined,
      tone: "good",
    },
  ]);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/leads", label: "Leads" }}
        eyebrow={lead.reference}
        title={lead.company ? `${lead.name} · ${lead.company}` : lead.name}
        description={<>Created {formatDateTime(lead.createdAt)}{lead.owner ? ` · Owner ${lead.owner.name}` : " · Unassigned"}</>}
        actions={
          <>
            {canManage ? (
              <InlineSelect
                url={url}
                field="stage"
                label="Stage"
                value={lead.stage}
                options={LEAD_STAGES.map((stage) => ({ value: stage, label: STAGE_LABEL[stage] }))}
                confirm={{ LOST: "Mark this lead as lost? Add the reason in “Next step” afterwards.", SPAM: "Mark this lead as spam?" }}
              />
            ) : (
              <StatusBadge value={lead.stage} label={STAGE_LABEL[lead.stage]} />
            )}
            {canManage && (
              <EditDialog title="Edit lead" wide>
                <LeadForm
                  leadId={lead.id}
                  categories={data.categories}
                  products={data.products}
                  initial={{
                    name: lead.name,
                    company: lead.company ?? "",
                    phone: lead.phone,
                    whatsapp: lead.whatsapp ?? "",
                    email: lead.email ?? "",
                    city: lead.city ?? "",
                    productCategoryId: lead.productCategoryId ?? "",
                    productId: lead.productId ?? "",
                    quantity: lead.quantity ?? "",
                    budget: lead.budget ?? "",
                    timeline: lead.timeline ?? "",
                    preferredContact: lead.preferredContact ?? "",
                    requirements: lead.requirements,
                    source: lead.source,
                  }}
                />
              </EditDialog>
            )}
            {hasPermission(staff, "quotes.manage") && (
              <ActionButton url="/api/admin/quotes" body={{ leadId: lead.id }} success="Quotation started." variant="brand">
                <FileSignature /> Start quotation
              </ActionButton>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Section title="Requirement">
            <DetailList
              columns={2}
              items={[
                ["Interested in", lead.subService],
                ["Category", lead.productCategory?.name],
                ["Product", lead.product ? <Link href={`/admin/products/${lead.product.id}`} className="text-primary hover:underline">{lead.product.name}</Link> : null],
                ["Quantity", lead.quantity],
                ["Budget", lead.budget],
                ["Timeline", lead.timeline],
                ["Preferred contact", lead.preferredContact],
                ["Estimated value", lead.estimatedValue ? formatPkr(Number(lead.estimatedValue)) : null],
              ]}
            />
            <div className="mt-4 rounded-lg bg-secondary/50 p-3 text-sm leading-relaxed whitespace-pre-line">{lead.requirements}</div>
          </Section>

          {(lead.conversationSummary || lead.scoreReasons.length > 0) && (
            <Section
              title="From the assistant"
              actions={
                lead.conversation && (
                  <Link href={`/admin/conversations/${lead.conversation.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <MessageSquare /> Conversation
                  </Link>
                )
              }
            >
              {lead.conversationSummary && <p className="text-sm leading-relaxed whitespace-pre-line">{lead.conversationSummary}</p>}
              {lead.scoreReasons.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {lead.scoreReasons.map((reason) => (
                    <span key={reason} className="rounded-full bg-secondary px-2.5 py-1 text-[11.5px] font-medium">
                      {reason}
                    </span>
                  ))}
                </div>
              )}
            </Section>
          )}

          <Section title="Quotations" description={lead.quotes.length ? undefined : "No quotation yet."}>
            {lead.quotes.length ? (
              <ul className="divide-y">
                {lead.quotes.map((quote) => (
                  <li key={quote.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/admin/quotes/${quote.id}`} className="font-medium hover:text-primary hover:underline">
                        {quote.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {quote.reference} · {formatDate(quote.createdAt)}
                        {Number(quote.total) > 0 ? ` · ${formatPkr(Number(quote.total))}` : ""}
                      </p>
                    </div>
                    <StatusBadge value={quote.status} label={QUOTE_STATUS_LABEL[quote.status]} />
                  </li>
                ))}
              </ul>
            ) : (
              <Muted>Start one from the button above when the requirement is clear.</Muted>
            )}
          </Section>

          {lead.meetings.length > 0 && (
            <Section title="Appointments">
              <ul className="divide-y">
                {lead.meetings.map((meeting) => (
                  <li key={meeting.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 text-sm">
                    <span>
                      {MEETING_MODE_LABEL[meeting.mode] ?? meeting.mode} · {formatDate(meeting.preferredDate)} {meeting.preferredTime}
                      <span className="block text-xs text-muted-foreground">{meeting.reference}</span>
                    </span>
                    <StatusBadge value={meeting.status} label={MEETING_STATUS_LABEL[meeting.status]} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Timeline">
            {canManage && (
              <div className="mb-6">
                <NoteComposer entityType="Lead" entityId={lead.id} />
              </div>
            )}
            <Timeline items={timeline} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Contact">
            <DetailList
              items={[
                ["Name", lead.name],
                ["Company", lead.company],
                ["Phone", <a key="p" href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="text-primary hover:underline">{lead.phone}</a>],
                ["WhatsApp", whatsappNumber ? <a key="w" href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{lead.whatsapp || lead.phone}</a> : null],
                ["Email", lead.email ? <a key="e" href={`mailto:${lead.email}`} className="text-primary hover:underline">{lead.email}</a> : null],
                ["City", lead.city],
                ["Customer profile", lead.customer ? <Link key="c" href={`/admin/customers/${lead.customer.id}`} className="text-primary hover:underline">{lead.customer.name} · {lead.customer.reference}</Link> : null],
                ["Channel", lead.conversation ? <ChannelBadge key="ch" value={lead.conversation.channel} /> : SOURCE_LABEL[lead.source]],
              ]}
            />
          </Section>

          <Section title="Handling">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11.5px] font-medium text-muted-foreground">Score</p>
                  <p className="mt-1">
                    <StatusBadge value={lead.temperature} label={TEMPERATURE_LABEL[lead.temperature]} /> <span className="ml-1 tabular-nums">{lead.score}/100</span>
                  </p>
                </div>
                <div>
                  <p className="text-[11.5px] font-medium text-muted-foreground">Priority</p>
                  <div className="mt-1">
                    {canManage ? (
                      <InlineSelect url={url} field="priority" label="Priority" value={lead.priority} options={PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] }))} className="w-full" />
                    ) : (
                      <StatusBadge value={lead.priority} label={PRIORITY_LABEL[lead.priority]} />
                    )}
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">Owner</p>
                {canManage ? (
                  <InlineSelect url={url} field="ownerId" label="Owner" value={lead.ownerId} empty="Unassigned" options={data.people} className="w-full" />
                ) : (
                  <p className="text-sm">{lead.owner?.name ?? "Unassigned"}</p>
                )}
              </div>
              {canManage ? (
                <QuickEdit
                  url={url}
                  fields={[
                    { name: "nextAction", label: "Next step", value: lead.nextAction ?? "", placeholder: "e.g. Call on Monday with a price" },
                    { name: "estimatedValue", label: "Estimated value (PKR)", value: lead.estimatedValue ? String(Number(lead.estimatedValue)) : "", type: "number", numeric: true },
                    ...(lead.stage === "LOST" ? [{ name: "lostReason", label: "Why it was lost", value: lead.lostReason ?? "", type: "textarea" as const }] : []),
                  ]}
                />
              ) : (
                <DetailList items={[["Next step", lead.nextAction], ["Lost because", lead.lostReason]]} />
              )}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
