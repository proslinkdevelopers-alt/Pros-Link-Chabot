import Link from "next/link";
import { MessageCircle, Briefcase, Clock, PhoneForwarded } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { OWN_OR_GLOBAL, safeQuery } from "@/lib/admin/queries";
import {
  Callout,
  DataTable,
  DbNotice,
  PageHeader,
  StatCard,
} from "@/components/admin/ui";
import { config } from "@/lib/config";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "WhatsApp Inbox" };

/** Meta's customer service window — replies are free-form only inside it. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * WhatsApp inbox.
 *
 * One row per number that has ever messaged the business line, with the two
 * numbers that actually matter next to each name: whether the 24-hour reply
 * window is still open, and what the conversation produced.
 */
export default async function WhatsappInboxPage() {
  await requireAdmin("/admin/messaging/whatsapp");
  const openedAfter = new Date(Date.now() - WINDOW_MS);

  const { data, error } = await safeQuery(
    async () => {
      const contacts = await prisma.whatsappContact.findMany({
        where: OWN_OR_GLOBAL,
        orderBy: { lastInboundAt: "desc" },
        take: 100,
      });

      const phones = contacts.map((contact) => contact.phone);

      const [conversations, leads, handoffs, totals] = await Promise.all([
        phones.length
          ? prisma.conversation.findMany({
              where: { channel: "WHATSAPP", contactPhone: { in: phones }, ...OWN_OR_GLOBAL },
              orderBy: { updatedAt: "desc" },
              select: { id: true, contactPhone: true, handedOff: true },
            })
          : Promise.resolve([]),
        prisma.lead.count({ where: { source: "WHATSAPP" } }),
        prisma.conversation.count({
          where: { channel: "WHATSAPP", handedOff: true, ...OWN_OR_GLOBAL },
        }),
        prisma.whatsappContact.count({ where: OWN_OR_GLOBAL }),
      ]);

      // First match wins — the list is already newest-first.
      const latest = new Map<string, { id: string; handedOff: boolean }>();
      for (const conversation of conversations) {
        if (conversation.contactPhone && !latest.has(conversation.contactPhone)) {
          latest.set(conversation.contactPhone, {
            id: conversation.id,
            handedOff: conversation.handedOff,
          });
        }
      }

      return { contacts, latest, leads, handoffs, totals };
    },
    {
      contacts: [],
      latest: new Map<string, { id: string; handedOff: boolean }>(),
      leads: 0,
      handoffs: 0,
      totals: 0,
    }
  );

  const openWindow = data.contacts.filter(
    (contact) => contact.lastInboundAt && contact.lastInboundAt > openedAfter
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Support & Messaging"
        title="WhatsApp Inbox"
        description="Everyone who has messaged the BITSOL Marketing WhatsApp number, and what their conversation turned into."
      />

      {error && <DbNotice error={error} />}

      {!config.whatsapp.enabled && (
        <div className="mb-6">
          <Callout title="WhatsApp is not connected yet">
            Set <code>WHATSAPP_PHONE_ID</code>, <code>WHATSAPP_TOKEN</code>,{" "}
            <code>WHATSAPP_VERIFY_TOKEN</code> and <code>WHATSAPP_APP_SECRET</code>, then
            register <code>{config.whatsapp.webhookUrl}</code> in Meta and subscribe to the{" "}
            <code>messages</code> field. See{" "}
            <Link href="/admin/integrations" className="text-primary hover:underline">
              Integrations
            </Link>{" "}
            for the current status.
          </Callout>
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Contacts" value={data.totals} icon={MessageCircle} />
        <StatCard
          label="Reply window open"
          value={openWindow}
          hint="Messaged in the last 24 hours"
          icon={Clock}
        />
        <StatCard
          label="Leads from WhatsApp"
          value={data.leads}
          icon={Briefcase}
          href="/admin/crm/leads?source=WHATSAPP"
        />
        <StatCard
          label="Handed to the team"
          value={data.handoffs}
          hint="Asked for a human on WhatsApp"
          icon={PhoneForwarded}
          href="/admin/conversations?filter=handoff"
        />
      </div>

      <DataTable
        rows={data.contacts}
        rowKey={(row) => row.id}
        empty="No one has messaged the WhatsApp number yet."
        columns={[
          {
            header: "Contact",
            cell: (row) => (
              <div className="min-w-0">
                <p className="font-medium">{row.profileName ?? "Unnamed"}</p>
                <a
                  href={`https://wa.me/${row.waId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  {row.phone}
                </a>
              </div>
            ),
          },
          {
            header: "Last message",
            cell: (row) => (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(row.lastInboundAt)}
              </span>
            ),
          },
          {
            header: "Reply window",
            cell: (row) => {
              const open = row.lastInboundAt && row.lastInboundAt > openedAfter;
              return (
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    open
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {open ? "Open" : "Template required"}
                </span>
              );
            },
          },
          {
            header: "Status",
            cell: (row) => {
              const conversation = data.latest.get(row.phone);
              if (row.isBlocked) {
                return (
                  <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-400">
                    Blocked
                  </span>
                );
              }
              if (conversation?.handedOff) {
                return (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    Waiting on a human
                  </span>
                );
              }
              return (
                <span className="text-xs text-muted-foreground">
                  {row.optedOut ? "Opted out of broadcasts" : "Assistant handling"}
                </span>
              );
            },
          },
          {
            header: "Conversation",
            cell: (row) => {
              const conversation = data.latest.get(row.phone);
              return conversation ? (
                <Link
                  href={`/admin/conversations/${conversation.id}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Open transcript
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              );
            },
          },
        ]}
      />
    </>
  );
}
