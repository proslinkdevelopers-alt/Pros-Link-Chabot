import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/lib/staff";
import { PageHeader } from "@/components/admin/ui";
import { BotSimulator } from "@/components/admin/BotSimulator";

export const metadata = { title: "Chatbot Simulator" };

export default async function SimulatorPage() {
  await requirePagePermission("chatbot.manage", "/admin/chatbot/simulator");

  return (
    <>
      <Link href="/admin/chatbot" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-3.5" /> Chatbot Studio
      </Link>
      <PageHeader
        eyebrow="Assistant"
        title="Simulator"
        description="Talk to the assistant exactly as a customer would, with the live configuration. Nothing is sent to WhatsApp and nothing is written to the CRM."
      />
      <p className="mb-4 text-xs text-muted-foreground">
        The phone number decides the detected country — try +971 for UAE or +44 for the UK.
      </p>
      <BotSimulator />
    </>
  );
}
