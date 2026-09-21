import Link from "next/link";
import { notFound } from "next/navigation";
import { Wrench } from "lucide-react";
import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { peopleWith } from "@/lib/admin/people";
import { activityTimeline, mergeTimeline } from "@/lib/admin/timeline";
import {
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_LABEL,
  QUOTE_STATUS_LABEL,
  SOURCE_LABEL,
  STAGE_LABEL,
  TICKET_CATEGORY_LABEL,
  TICKET_STATUS_LABEL,
} from "@/lib/admin/labels";
import { buttonVariants } from "@/components/ui/button";
import { ChannelBadge, DbNotice, DetailList, PageHeader, Section, StatusBadge, Timeline, type TimelineItem } from "@/components/admin/ui";
import { InlineSelect, NoteComposer } from "@/components/admin/client/controls";
import { EditDialog } from "@/components/admin/client/EditDialog";
import { CustomerForm } from "@/components/admin/crm/CustomerForm";
import { AssetManager } from "@/components/admin/crm/AssetManager";
import { digits } from "@/lib/company-schema";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Customer" };

const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requirePagePermission("customers.view", `/admin/customers/${id}`);

  const { data, error } = await safeQuery(
    async () => {
      const customer = await prisma.customer.findFirst({
        where: { id, ...OWN },
        include: {
          owner: { select: { name: true } },
          leads: { where: OWN, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, reference: true, subService: true, stage: true, createdAt: true } },
          quotes: { where: OWN, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, reference: true, title: true, status: true, createdAt: true } },
          tickets: { where: OWN, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, reference: true, subject: true, category: true, status: true, createdAt: true } },
          conversations: { where: OWN, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, reference: true, channel: true, createdAt: true, updatedAt: true, status: true } },
          assets: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!customer) return null;
      const [people, activity] = await Promise.all([
        peopleWith(["customers.manage"]),
        activityTimeline([
          { entityType: "Customer", entityId: id },
          ...customer.leads.map((lead) => ({ entityType: "Lead", entityId: lead.id, label: lead.reference })),
          ...customer.quotes.map((quote) => ({ entityType: "Quote", entityId: quote.id, label: quote.reference })),
          ...customer.tickets.map((ticket) => ({ entityType: "Ticket", entityId: ticket.id, label: ticket.reference })),
        ]),
      ]);
      return { customer, people, activity };
    },
    null
  );
  if (!error && !data) notFound();
  if (!data) return <DbNotice error={error} />;

  const { customer } = data;
  const canManage = hasPermission(staff, "customers.manage");
  const url = `/api/admin/customers/${customer.id}`;
  const whatsapp = digits(customer.whatsapp || customer.phone);

  const events: TimelineItem[] = [
    { id: `c-${customer.id}`, at: customer.createdAt, title: "Customer profile created", tone: "good" },
    ...customer.leads.map((lead) => ({ id: `l-${lead.id}`, at: lead.createdAt, title: <>Enquiry <Link href={`/admin/leads/${lead.id}`} className="text-primary hover:underline">{lead.reference}</Link>{lead.subService ? ` · ${lead.subService}` : ""}</>, tone: "primary" as const })),
    ...customer.quotes.map((quote) => ({ id: `q-${quote.id}`, at: quote.createdAt, title: <>Quote request <Link href={`/admin/quotes/${quote.id}`} className="text-primary hover:underline">{quote.reference}</Link></>, tone: "primary" as const })),
    ...customer.tickets.map((ticket) => ({ id: `t-${ticket.id}`, at: ticket.createdAt, title: <>{TICKET_CATEGORY_LABEL[ticket.category]} <Link href={`/admin/tickets/${ticket.id}`} className="text-primary hover:underline">{ticket.reference}</Link></>, tone: "primary" as const })),
    ...customer.conversations.map((conversation) => ({ id: `v-${conversation.id}`, at: conversation.createdAt, title: <>{conversation.channel === "WHATSAPP" ? "WhatsApp" : "Website"} conversation <Link href={`/admin/conversations/${conversation.id}`} className="text-primary hover:underline">{conversation.reference}</Link></> })),
  ];
  const timeline = mergeTimeline(data.activity, events).slice(0, 80);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/customers", label: "Customers" }}
        eyebrow={customer.reference}
        title={customer.company ? `${customer.name} · ${customer.company}` : customer.name}
        description={<>Customer since {formatDate(customer.createdAt)}{customer.lastInteractionAt ? ` · Last contact ${formatDateTime(customer.lastInteractionAt)}` : ""}</>}
        actions={
          <>
            {canManage ? (
              <InlineSelect url={url} field="status" label="Status" value={customer.status} options={CUSTOMER_STATUSES.map((value) => ({ value, label: CUSTOMER_STATUS_LABEL[value] }))} />
            ) : (
              <StatusBadge value={customer.status} label={CUSTOMER_STATUS_LABEL[customer.status]} />
            )}
            {canManage && (
              <EditDialog title="Edit customer" wide>
                <CustomerForm
                  customerId={customer.id}
                  initial={{
                    name: customer.name, company: customer.company ?? "", phone: customer.phone, whatsapp: customer.whatsapp ?? "", email: customer.email ?? "",
                    address: customer.address ?? "", city: customer.city ?? "", industry: customer.industry ?? "", notes: customer.notes ?? "",
                    status: customer.status, source: customer.source ?? "",
                  }}
                />
              </EditDialog>
            )}
            {hasPermission(staff, "tickets.manage") && (
              <Link href={`/admin/tickets/new?customer=${customer.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Wrench /> New ticket
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Enquiries and quotations">
              {customer.leads.length || customer.quotes.length ? (
                <ul className="divide-y text-sm">
                  {customer.leads.map((lead) => (
                    <li key={lead.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                      <Link href={`/admin/leads/${lead.id}`} className="min-w-0 truncate hover:text-primary hover:underline">
                        {lead.subService ?? "Enquiry"} <span className="text-xs text-muted-foreground">· {lead.reference}</span>
                      </Link>
                      <StatusBadge value={lead.stage} label={STAGE_LABEL[lead.stage]} />
                    </li>
                  ))}
                  {customer.quotes.map((quote) => (
                    <li key={quote.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/admin/quotes/${quote.id}`} className="min-w-0 truncate hover:text-primary hover:underline">
                        {quote.title} <span className="text-xs text-muted-foreground">· {quote.reference}</span>
                      </Link>
                      <StatusBadge value={quote.status} label={QUOTE_STATUS_LABEL[quote.status]} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None yet.</p>
              )}
            </Section>
            <Section title="Service and support">
              {customer.tickets.length ? (
                <ul className="divide-y text-sm">
                  {customer.tickets.map((ticket) => (
                    <li key={ticket.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                      <Link href={`/admin/tickets/${ticket.id}`} className="min-w-0 truncate hover:text-primary hover:underline">
                        {ticket.subject} <span className="text-xs text-muted-foreground">· {ticket.reference}</span>
                      </Link>
                      <StatusBadge value={ticket.status} label={TICKET_STATUS_LABEL[ticket.status]} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No tickets.</p>
              )}
            </Section>
          </div>

          <Section title="Machines at the customer's site" description="Installed equipment, with serial numbers and warranty dates.">
            <AssetManager
              customerId={customer.id}
              canEdit={canManage}
              rows={customer.assets.map((asset) => ({
                id: asset.id, label: asset.label, brand: asset.brand, model: asset.model, serialNumber: asset.serialNumber,
                installedAt: day(asset.installedAt), warrantyUntil: day(asset.warrantyUntil), location: asset.location, notes: asset.notes,
              }))}
            />
          </Section>

          <Section title="Timeline">
            {canManage && (
              <div className="mb-6">
                <NoteComposer entityType="Customer" entityId={customer.id} />
              </div>
            )}
            <Timeline items={timeline} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Contact">
            <DetailList
              items={[
                ["Phone", <a key="p" href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`} className="text-primary hover:underline">{customer.phone}</a>],
                ["WhatsApp", whatsapp ? <a key="w" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{customer.whatsapp || customer.phone}</a> : null],
                ["Email", customer.email ? <a key="e" href={`mailto:${customer.email}`} className="text-primary hover:underline">{customer.email}</a> : null],
                ["Address", customer.address],
                ["City", customer.city],
                ["Industry", customer.industry],
                ["Source", customer.source ? SOURCE_LABEL[customer.source] : null],
              ]}
            />
          </Section>
          <Section title="Account">
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">Account owner</p>
                {canManage ? (
                  <InlineSelect url={url} field="ownerId" label="Account owner" value={customer.ownerId} empty="Nobody" options={data.people} className="w-full" />
                ) : (
                  <p className="text-sm">{customer.owner?.name ?? "Nobody"}</p>
                )}
              </div>
              {customer.notes && <p className="whitespace-pre-line rounded-lg bg-secondary/50 p-3 text-[13px] leading-relaxed">{customer.notes}</p>}
            </div>
          </Section>
          {customer.conversations.length > 0 && (
            <Section title="Conversations">
              <ul className="space-y-2 text-sm">
                {customer.conversations.map((conversation) => (
                  <li key={conversation.id} className="flex items-center justify-between gap-2">
                    <Link href={`/admin/conversations/${conversation.id}`} className="hover:text-primary hover:underline">
                      {formatDateTime(conversation.updatedAt)}
                    </Link>
                    <ChannelBadge value={conversation.channel} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
