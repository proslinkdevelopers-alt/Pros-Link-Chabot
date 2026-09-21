import { requirePagePermission } from "@/lib/staff";
import { TicketList, type TicketSearch } from "@/components/admin/crm/TicketList";

export const metadata = { title: "Support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<TicketSearch> }) {
  const staff = await requirePagePermission("tickets.view", "/admin/support");
  return <TicketList kind="support" staff={staff} params={await searchParams} />;
}
