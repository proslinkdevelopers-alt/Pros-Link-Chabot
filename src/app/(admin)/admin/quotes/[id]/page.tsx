import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { peopleWith } from "@/lib/admin/people";
import { activityTimeline, mergeTimeline } from "@/lib/admin/timeline";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, SOURCE_LABEL } from "@/lib/admin/labels";
import { DbNotice, DetailList, PageHeader, Section, StatusBadge, Timeline } from "@/components/admin/ui";
import { InlineSelect, NoteComposer } from "@/components/admin/client/controls";
import { QuoteEditor, type QuoteItem } from "@/components/admin/crm/QuoteEditor";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Quote request" };

function items(value: unknown): QuoteItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({ description: String(item.description ?? ""), quantity: Number(item.quantity) || 1, unitPrice: Number(item.unitPrice) || 0 }));
}

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requirePagePermission("quotes.view", `/admin/quotes/${id}`);

  const { data, error } = await safeQuery(
    async () => {
      const quote = await prisma.quote.findFirst({
        where: { id, ...OWN },
        include: {
          owner: { select: { name: true } },
          lead: { select: { id: true, reference: true, name: true } },
          customer: { select: { id: true, name: true, company: true, phone: true, email: true } },
          conversation: { select: { id: true, channel: true } },
          productCategory: { select: { name: true } },
          product: { select: { id: true, name: true } },
        },
      });
      if (!quote) return null;
      const [people, activity] = await Promise.all([peopleWith(["quotes.manage"]), activityTimeline([{ entityType: "Quote", entityId: id }])]);
      return { quote, people, activity };
    },
    null
  );
  if (!error && !data) notFound();
  if (!data) return <DbNotice error={error} />;

  const { quote } = data;
  const canManage = hasPermission(staff, "quotes.manage");
  const url = `/api/admin/quotes/${quote.id}`;
  const timeline = mergeTimeline(data.activity, [
    { id: "created", at: quote.createdAt, title: `Quote ${quote.status === "REQUESTED" ? "requested" : "started"} · ${quote.source ? SOURCE_LABEL[quote.source] : "console"}`, tone: "good" },
    ...(quote.sentAt ? [{ id: "sent", at: quote.sentAt, title: "Sent to the customer", tone: "primary" as const }] : []),
    ...(quote.decidedAt ? [{ id: "decided", at: quote.decidedAt, title: `Customer ${quote.status === "ACCEPTED" ? "accepted" : "declined"}`, tone: quote.status === "ACCEPTED" ? ("good" as const) : ("bad" as const) }] : []),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/quotes", label: "Quote Requests" }}
        eyebrow={quote.reference}
        title={quote.title}
        description={<>Requested {formatDateTime(quote.createdAt)}{quote.owner ? ` · Owner ${quote.owner.name}` : ""}</>}
        actions={
          canManage ? (
            <InlineSelect
              url={url}
              field="status"
              label="Status"
              value={quote.status}
              options={QUOTE_STATUSES.map((value) => ({ value, label: QUOTE_STATUS_LABEL[value] }))}
              confirm={{ SENT: "Mark this quotation as sent to the customer? The lead moves to Quoted." }}
            />
          ) : (
            <StatusBadge value={quote.status} label={QUOTE_STATUS_LABEL[quote.status]} />
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Section title="What the customer asked for">
            <DetailList
              columns={2}
              items={[
                ["Category", quote.productCategory?.name],
                ["Product", quote.product ? <Link key="p" href={`/admin/products/${quote.product.id}`} className="text-primary hover:underline">{quote.product.name}</Link> : null],
                ["Quantity", quote.quantity],
                ["Budget", quote.budget],
                ["City", quote.city],
                ["Preferred contact", quote.preferredContact],
              ]}
            />
            {quote.requirements && <p className="mt-4 whitespace-pre-line rounded-lg bg-secondary/50 p-3 text-sm leading-relaxed">{quote.requirements}</p>}
          </Section>

          <Section title="Quotation" description="Enter the prices and terms Pros-Link is offering. Nothing here is filled in automatically.">
            <QuoteEditor
              quoteId={quote.id}
              canEdit={canManage}
              initial={{
                title: quote.title,
                items: items(quote.items),
                discount: Number(quote.discount),
                tax: Number(quote.tax),
                currency: quote.currency === "USD" ? "USD" : "PKR",
                validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : "",
                notes: quote.notes ?? "",
              }}
            />
          </Section>

          <Section title="Timeline">
            {canManage && (
              <div className="mb-6">
                <NoteComposer entityType="Quote" entityId={quote.id} />
              </div>
            )}
            <Timeline items={timeline} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Customer">
            <DetailList
              items={[
                ["Customer", quote.customer ? <Link key="c" href={`/admin/customers/${quote.customer.id}`} className="text-primary hover:underline">{quote.customer.name}{quote.customer.company ? ` · ${quote.customer.company}` : ""}</Link> : null],
                ["Phone", quote.customer?.phone],
                ["Email", quote.customer?.email],
                ["Lead", quote.lead ? <Link key="l" href={`/admin/leads/${quote.lead.id}`} className="text-primary hover:underline">{quote.lead.reference}</Link> : null],
                ["Conversation", quote.conversation ? <Link key="v" href={`/admin/conversations/${quote.conversation.id}`} className="text-primary hover:underline">{quote.conversation.channel === "WHATSAPP" ? "WhatsApp" : "Website"} chat</Link> : null],
              ]}
            />
          </Section>
          <Section title="Handling">
            <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">Owner</p>
            {canManage ? (
              <InlineSelect url={url} field="ownerId" label="Owner" value={quote.ownerId} empty="Unassigned" options={data.people} className="w-full" />
            ) : (
              <p className="text-sm">{quote.owner?.name ?? "Unassigned"}</p>
            )}
            <div className="mt-4">
              <DetailList
                items={[
                  ["Sent", quote.sentAt ? formatDate(quote.sentAt) : null],
                  ["Valid until", quote.validUntil ? formatDate(quote.validUntil) : null],
                  ["Decided", quote.decidedAt ? formatDate(quote.decidedAt) : null],
                ]}
              />
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
