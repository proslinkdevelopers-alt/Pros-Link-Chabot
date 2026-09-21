import { requirePagePermission } from "@/lib/staff";
import { TicketList, type TicketSearch } from "@/components/admin/crm/TicketList";

export const metadata = { title: "Service Tickets" };

export default async function ServiceTicketsPage({ searchParams }: { searchParams: Promise<TicketSearch> }) {
  const staff = await requirePagePermission(["tickets.view", "tickets.view_assigned"], "/admin/tickets");
  return <TicketList kind="service" staff={staff} params={await searchParams} />;
}
