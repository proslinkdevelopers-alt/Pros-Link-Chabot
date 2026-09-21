import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/lib/staff";
import { loadConfigState } from "@/lib/bot/config";
import { SECTION_KEYS, type SectionKey } from "@/lib/bot/schema";
import { SECTION_INFO } from "@/lib/bot/sections";
import { DEFAULT_BOT_CONFIG } from "@/data/bot";
import { PageHeader } from "@/components/admin/ui";
import { SectionEditor } from "@/components/admin/SectionEditor";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Chatbot Studio" };

const HINTS: Partial<Record<SectionKey, string[]>> = {
  pricing: [
    "Empty by default: with no entries, the assistant quotes no prices and offers a quotation instead.",
    "Add only prices Pros-Link has approved. `intents` decides when an entry is shown — e.g. PHOTOCOPIER, CONSUMABLES.",
  ],
  messages: [
    "Placeholders: {name}, {company}, {service}, {team}, {reference}, {phone}, {whatsapp}, {email}, {hours}, {nextOpen}, {website}, {category}. Contact placeholders come from Settings → Company profile and stay empty until filled in.",
    "Text inside [[ … ]] is left out when a placeholder in it is empty: \"Thanks[[, {name}]]!\"",
    "Each message has `en`, and optionally `ur_roman`, `ur` and `pa`. Missing languages fall back sensibly.",
  ],
  menu: [
    "Menu titles show at most 24 characters in a WhatsApp list; menus longer than ten rows are paged automatically.",
    "`children` lists node ids. A service node's `actions` are button ids from the Buttons section.",
  ],
  flows: [
    "`field` is what a question fills (name, company, phone, city, productCategory, quantity, machineType, serialNumber, priority…). A question is skipped when the customer already said it.",
    "`channels` limits a question to WEB or WHATSAPP — e.g. the phone number is only asked on the website.",
    "`completion` is what the flow creates: lead, quote, brief, ticket, meeting or track (look up a request).",
  ],
  teams: ["`emails` receive the team's handovers and hot-lead alerts. `ownerEmails` must match console user accounts."],
  followUp: [
    "Steps are hours after the customer's last message. WhatsApp allows free-form messages for 24 hours; later steps need an approved `template`.",
  ],
  proof: ["Add only verified references, installations and reviews. Each item: { \"title\", \"summary\", \"link\" (optional) }."],
  sources: ["Share links like https://wa.me/<your number>?text=Hi%20ref:qr:expo24 — code `qr`, campaign `expo24`."],
};

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SECTION_KEYS.includes(section as SectionKey)) notFound();
  const key = section as SectionKey;

  await requirePagePermission("chatbot.manage", `/admin/chatbot/${key}`);
  const state = await loadConfigState({ fresh: true });
  const info = SECTION_INFO[key];

  return (
    <>
      <Link
        href="/admin/chatbot"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" /> Chatbot Studio
      </Link>
      <PageHeader eyebrow={info.group} title={info.title} description={info.description} />

      {HINTS[key] && (
        <Card className="mb-4 p-4 text-xs leading-relaxed text-muted-foreground">
          <ul className="list-disc space-y-1 pl-4">
            {HINTS[key]!.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </Card>
      )}

      <SectionEditor
        section={key}
        value={state.config[key]}
        defaults={DEFAULT_BOT_CONFIG[key]}
        customised={state.customised.includes(key)}
      />
    </>
  );
}
