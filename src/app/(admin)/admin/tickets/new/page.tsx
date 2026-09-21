import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { peopleWith } from "@/lib/admin/people";
import { Card } from "@/components/ui/card";
import { DbNotice, PageHeader } from "@/components/admin/ui";
import { EMPTY_TICKET, TicketForm } from "@/components/admin/crm/TicketForm";

export const metadata = { title: "New ticket" };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ customer?: string; kind?: string }> }) {
  await requirePagePermission("tickets.manage", "/admin/tickets/new");
  const { customer: customerId, kind } = await searchParams;

  const { data, error } = await safeQuery(
    async () => {
      const [people, customer] = await Promise.all([
        peopleWith(["tickets.manage", "tickets.update_assigned"]),
        customerId
          ? prisma.customer.findFirst({
              where: { id: customerId, ...OWN },
              select: { id: true, name: true, company: true, phone: true, email: true, city: true, address: true, assets: { select: { label: true, brand: true, model: true, serialNumber: true } } },
            })
          : null,
      ]);
      return { people, customer };
    },
    { people: [], customer: null }
  );

  const customer = data.customer;
  const initial = {
    ...EMPTY_TICKET,
    category: kind === "support" ? "GENERAL" : "REPAIR",
    ...(customer
      ? { contactName: customer.name, contactPhone: customer.phone, contactEmail: customer.email ?? "", company: customer.company ?? "", city: customer.city ?? "", address: customer.address ?? "" }
      : {}),
  };

  return (
    <>
      <PageHeader
        back={customer ? { href: `/admin/customers/${customer.id}`, label: customer.name } : { href: kind === "support" ? "/admin/support" : "/admin/tickets", label: kind === "support" ? "Support" : "Service Tickets" }}
        title="New ticket"
        description="For a request that came in by phone, email or in person. The customer is notified only by the team, not automatically."
      />
      <DbNotice error={error} />
      <Card className="max-w-3xl p-6">
        <TicketForm initial={initial} customerId={customer?.id} people={data.people} machines={customer?.assets} />
      </Card>
    </>
  );
}
