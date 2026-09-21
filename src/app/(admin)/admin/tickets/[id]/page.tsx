import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageSquare, Paperclip } from "lucide-react";
import { prisma } from "@/lib/db";
import { hasPermission, requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { peopleWith } from "@/lib/admin/people";
import { activityTimeline, mergeTimeline } from "@/lib/admin/timeline";
import { PRIORITIES, PRIORITY_LABEL, SERVICE_CATEGORIES, SOURCE_LABEL, TICKET_CATEGORY_LABEL, TICKET_STATUSES, TICKET_STATUS_LABEL } from "@/lib/admin/labels";
import { buttonVariants } from "@/components/ui/button";
import { DbNotice, DetailList, PageHeader, Section, StatusBadge, Timeline } from "@/components/admin/ui";
import { InlineSelect, NoteComposer, QuickEdit } from "@/components/admin/client/controls";
import { EditDialog } from "@/components/admin/client/EditDialog";
import { TicketForm } from "@/components/admin/crm/TicketForm";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Ticket" };

interface Attachment {
  mediaId: string;
  type: string;
  mime?: string | null;
  at?: string;
}

function attachmentsOf(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Attachment => Boolean(item) && typeof item === "object" && typeof (item as Attachment).mediaId === "string");
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requirePagePermission(["tickets.view", "tickets.view_assigned"], `/admin/tickets/${id}`);
  const fullAccess = hasPermission(staff, "tickets.view");

  const { data, error } = await safeQuery(
    async () => {
      const ticket = await prisma.ticket.findFirst({
        where: { id, ...OWN },
        include: {
          assignee: { select: { id: true, name: true } },
          reporter: { select: { name: true } },
          customer: { select: { id: true, name: true, reference: true } },
          conversation: { select: { id: true, channel: true } },
          product: { select: { id: true, name: true } },
        },
      });
      if (!ticket) return null;
      const [people, activity] = await Promise.all([
        hasPermission(staff, "tickets.manage") ? peopleWith(["tickets.manage", "tickets.update_assigned"]) : Promise.resolve([]),
        activityTimeline([{ entityType: "Ticket", entityId: id }]),
      ]);
      return { ticket, people, activity };
    },
    null
  );
  if (!error && !data) notFound();
  if (!data) return <DbNotice error={error} />;

  const { ticket } = data;
  // A technician may open only the tickets assigned to them.
  if (!fullAccess && ticket.assigneeId !== staff.id) redirect("/admin/forbidden");

  const canManage = hasPermission(staff, "tickets.manage");
  const canWork = canManage || (hasPermission(staff, "tickets.update_assigned") && ticket.assigneeId === staff.id);
  const url = `/api/admin/tickets/${ticket.id}`;
  const service = (SERVICE_CATEGORIES as readonly string[]).includes(ticket.category);
  const statusOptions = (canManage ? TICKET_STATUSES : TICKET_STATUSES.filter((value) => value !== "OPEN" && value !== "ASSIGNED")).map((value) => ({ value, label: TICKET_STATUS_LABEL[value] }));
  const attachments = attachmentsOf(ticket.attachments);
  const canSeeMedia = hasPermission(staff, "tickets.view") || hasPermission(staff, "conversations.view") || canWork;

  const timeline = mergeTimeline(data.activity, [
    { id: "created", at: ticket.createdAt, title: `Ticket raised · ${ticket.source ? SOURCE_LABEL[ticket.source] : "console"}${ticket.reporter ? ` by ${ticket.reporter.name}` : ""}`, tone: "good" },
    ...(ticket.dispatchedAt ? [{ id: "dispatched", at: ticket.dispatchedAt, title: "Technician dispatched", tone: "primary" as const }] : []),
    ...(ticket.resolvedAt ? [{ id: "resolved", at: ticket.resolvedAt, title: "Resolved", tone: "good" as const }] : []),
    ...(ticket.closedAt ? [{ id: "closed", at: ticket.closedAt, title: "Closed" }] : []),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: service ? "/admin/tickets" : "/admin/support", label: service ? "Service Tickets" : "Support" }}
        eyebrow={`${ticket.reference} · ${TICKET_CATEGORY_LABEL[ticket.category]}`}
        title={ticket.subject}
        description={<>Raised {formatDateTime(ticket.createdAt)}{ticket.assignee ? ` · Assigned to ${ticket.assignee.name}` : " · Unassigned"}</>}
        actions={
          <>
            {canWork ? (
              <InlineSelect url={url} field="status" label="Status" value={ticket.status} options={statusOptions} confirm={{ CLOSED: "Close this ticket?" }} />
            ) : (
              <StatusBadge value={ticket.status} label={TICKET_STATUS_LABEL[ticket.status]} />
            )}
            {canManage && (
              <EditDialog title="Edit ticket" wide>
                <TicketForm
                  ticketId={ticket.id}
                  initial={{
                    category: ticket.category, priority: ticket.priority, subject: ticket.subject, description: ticket.description,
                    contactName: ticket.contactName ?? "", contactPhone: ticket.contactPhone ?? "", contactEmail: ticket.contactEmail ?? "",
                    company: ticket.company ?? "", city: ticket.city ?? "", address: ticket.address ?? "", machineType: ticket.machineType ?? "",
                    machineBrand: ticket.machineBrand ?? "", machineModel: ticket.machineModel ?? "", serialNumber: ticket.serialNumber ?? "",
                    preferredDate: ticket.preferredDate ? ticket.preferredDate.toISOString().slice(0, 10) : "", preferredTime: ticket.preferredTime ?? "",
                  }}
                />
              </EditDialog>
            )}
            {ticket.conversation && hasPermission(staff, "conversations.view") && (
              <Link href={`/admin/conversations/${ticket.conversation.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <MessageSquare /> Conversation
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Section title="Request">
            <p className="whitespace-pre-line text-sm leading-relaxed">{ticket.description}</p>
            {service && (
              <div className="mt-5">
                <DetailList
                  columns={2}
                  items={[
                    ["Machine", ticket.machineType],
                    ["Brand", ticket.machineBrand],
                    ["Model", ticket.machineModel],
                    ["Serial number", ticket.serialNumber],
                    ["Product", ticket.product ? <Link key="p" href={`/admin/products/${ticket.product.id}`} className="text-primary hover:underline">{ticket.product.name}</Link> : null],
                    ["Preferred visit", ticket.preferredDate || ticket.preferredTime ? `${ticket.preferredDate ? formatDate(ticket.preferredDate) : ""} ${ticket.preferredTime ?? ""}`.trim() : null],
                  ]}
                />
              </div>
            )}
            {attachments.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-[11.5px] font-medium text-muted-foreground">Attachments from the customer</p>
                <ul className="flex flex-wrap gap-2">
                  {attachments.map((attachment, index) => (
                    <li key={attachment.mediaId}>
                      {canSeeMedia ? (
                        <a
                          href={`/api/admin/whatsapp/media/${encodeURIComponent(attachment.mediaId)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40"
                        >
                          <Paperclip className="size-3.5" aria-hidden /> {attachment.type === "image" ? "Photo" : "File"} {index + 1}
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section title="Resolution" description="What was done — visible to the team, and a record for the next visit.">
            {canWork ? (
              <QuickEdit url={url} fields={[{ name: "resolution", label: "Resolution notes", value: ticket.resolution ?? "", type: "textarea", placeholder: "Work carried out, parts replaced, advice given…" }]} />
            ) : (
              <p className="whitespace-pre-line text-sm">{ticket.resolution ?? "Not recorded yet."}</p>
            )}
          </Section>

          <Section title="Timeline">
            {canWork && (
              <div className="mb-6">
                <NoteComposer entityType="Ticket" entityId={ticket.id} />
              </div>
            )}
            <Timeline items={timeline} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Customer">
            <DetailList
              items={[
                ["Contact", ticket.contactName],
                ["Phone", ticket.contactPhone ? <a key="p" href={`tel:${ticket.contactPhone.replace(/[^\d+]/g, "")}`} className="text-primary hover:underline">{ticket.contactPhone}</a> : null],
                ["Email", ticket.contactEmail],
                ["Company", ticket.company],
                ["City", ticket.city],
                ["Address", ticket.address],
                ["Profile", ticket.customer && hasPermission(staff, "customers.view") ? <Link key="c" href={`/admin/customers/${ticket.customer.id}`} className="text-primary hover:underline">{ticket.customer.name} · {ticket.customer.reference}</Link> : null],
              ]}
            />
          </Section>
          <Section title="Handling">
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">Assigned to</p>
                {canManage ? (
                  <InlineSelect url={url} field="assigneeId" label="Assignee" value={ticket.assigneeId} empty="Unassigned" options={data.people} className="w-full" />
                ) : (
                  <p className="text-sm">{ticket.assignee?.name ?? "Unassigned"}</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">Priority</p>
                {canManage ? (
                  <InlineSelect url={url} field="priority" label="Priority" value={ticket.priority} options={PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] }))} className="w-full" />
                ) : (
                  <StatusBadge value={ticket.priority} label={PRIORITY_LABEL[ticket.priority]} />
                )}
              </div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
