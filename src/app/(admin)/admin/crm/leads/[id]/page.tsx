import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Mail, Phone, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader, StatusBadge } from "@/components/admin/ui";
import { StatusSelect } from "@/components/admin/StatusSelect";
import { ActivityComposer } from "@/components/admin/ActivityComposer";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { safeQuery } from "@/lib/admin/queries";
import { findService } from "@/data/marketing/services";
import { LEAD_STAGES } from "@/lib/admin/leads";
import { formatDateTime, formatPkr, humanise } from "@/lib/utils";

export const metadata = { title: "Lead" };

const STAGES = LEAD_STAGES;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("leads.view");

  const { id } = await params;

  const { data } = await safeQuery(
    async () => {
      const [lead, activities] = await Promise.all([
        prisma.lead.findUnique({
          where: { id },
          include: {
            owner: { select: { name: true } },
            conversation: { select: { id: true, reference: true } },
            meetings: { orderBy: { preferredDate: "asc" } },
            quotes: { orderBy: { createdAt: "desc" } },
          },
        }),
        prisma.crmActivity.findMany({
          where: { entityType: "Lead", entityId: id },
          orderBy: { createdAt: "desc" },
          include: { owner: { select: { name: true } } },
        }),
      ]);
      return { lead, activities };
    },
    { lead: null, activities: [] as never[] }
  );

  const lead = data.lead;
  if (!lead) notFound();

  const service = lead.serviceSlug ? findService(lead.serviceSlug) : undefined;

  return (
    <>
      <Link
        href="/admin/crm/leads"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" /> All leads
      </Link>

      <PageHeader
        eyebrow="Lead"
        title={lead.name}
        description={`Lead ${lead.reference} · captured ${formatDateTime(lead.createdAt)} from ${humanise(lead.source)}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusSelect entity="leads" id={lead.id} field="stage" value={lead.stage} options={STAGES} />
            <StatusSelect
              entity="leads"
              id={lead.id}
              field="priority"
              value={lead.priority}
              options={PRIORITIES}
            />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Lead intelligence</h2>
              <span className="inline-flex items-center gap-2">
                <span className="text-lg font-bold tabular-nums">{lead.score}</span>
                <span className="text-xs text-muted-foreground">/ 100</span>
                <StatusBadge value={lead.temperature} />
              </span>
            </div>
            {lead.scoreReasons.length > 0 && (
              <p className="mb-3 text-xs text-muted-foreground">{lead.scoreReasons.join(" · ")}</p>
            )}
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Detail label="Intent" value={lead.intent ? humanise(lead.intent) : "—"} />
              <Detail label="Team" value={lead.assignedTeam ? humanise(lead.assignedTeam) : "—"} />
              <Detail label="Business goal" value={lead.businessGoal ?? "—"} />
              <Detail label="Challenge" value={lead.challenge ?? "—"} />
              <Detail label="Traffic source" value={lead.trafficSource ? humanise(lead.trafficSource) : "—"} />
              <Detail label="Campaign" value={lead.campaign ?? "—"} />
              <Detail label="Ad ID" value={lead.adId ?? "—"} />
              <Detail label="Opt-in" value={humanise(lead.optInStatus)} />
              <Detail label="Follow-ups" value={`${lead.followUpCount}${lead.lastFollowUpAt ? ` · last ${formatDateTime(lead.lastFollowUpAt)}` : ""}`} />
              <Detail label="Last message" value={lead.lastMessageAt ? formatDateTime(lead.lastMessageAt) : "—"} />
            </dl>
            {lead.nextAction && (
              <p className="mt-4 rounded-xl bg-primary/[0.06] px-3 py-2 text-sm">
                <span className="font-semibold">Next action:</span> {lead.nextAction}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Requirements</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{lead.requirements}</p>
            {lead.lastMessage && (
              <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                Last customer message: “{lead.lastMessage}”
              </p>
            )}
          </Card>

          {lead.conversationSummary && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">Handover summary</h2>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{lead.conversationSummary}</pre>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Activity & follow-ups</h2>
            <ActivityComposer entityType="Lead" entityId={lead.id} />

            {data.activities.length ? (
              <ul className="mt-4 space-y-3">
                {data.activities.map((activity) => (
                  <li key={activity.id} className="flex gap-3 border-l-2 border-secondary pl-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge value={activity.type} />
                        <span className="text-[11px] text-muted-foreground">
                          {activity.owner?.name ?? "System"} · {formatDateTime(activity.createdAt)}
                        </span>
                        {activity.dueAt && (
                          <span className="text-[11px] font-medium text-accent">
                            Due {formatDateTime(activity.dueAt)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{activity.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                No notes yet. Add the first one after your call.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Contact</h2>
            <dl className="space-y-2.5 text-sm">
              <Row icon={Phone} label="Phone" value={lead.phone || "—"} />
              <Row icon={Mail} label="Email" value={lead.email ?? "—"} />
              <Row icon={Building2} label="Company" value={lead.company ?? "—"} />
              <Row icon={Sparkles} label="Industry" value={lead.businessType ?? "—"} />
              <Row icon={Sparkles} label="Website" value={lead.website ?? "—"} />
              <Row icon={Sparkles} label="Country" value={[lead.country, lead.city].filter(Boolean).join(" · ") || "—"} />
              {lead.companySize && <Row icon={Building2} label="Size" value={lead.companySize} />}
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Deal</h2>
            <dl className="space-y-2 text-sm">
              <Detail label="Service" value={lead.subService ?? service?.name ?? lead.serviceSlug ?? "—"} />
              <Detail label="Budget" value={lead.budget ?? "—"} />
              <Detail label="Timeline" value={lead.timeline ?? "—"} />
              <Detail label="Estimated value" value={formatPkr(Number(lead.estimatedValue ?? 0))} />
              <Detail label="Owner" value={lead.owner?.name ?? "Unassigned"} />
              {lead.lostReason && <Detail label="Lost reason" value={lead.lostReason} />}
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Linked records</h2>
            <ul className="space-y-1.5 text-xs">
              <li className="text-muted-foreground">
                Conversation:{" "}
                {lead.conversation ? (
                  <Link
                    href={`/admin/conversations/${lead.conversation.id}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {lead.conversation.reference}
                  </Link>
                ) : (
                  <span className="font-mono text-foreground">—</span>
                )}
              </li>
              <li className="text-muted-foreground">
                Meetings: <span className="text-foreground">{lead.meetings.length}</span>
              </li>
              <li className="text-muted-foreground">
                Quotations: <span className="text-foreground">{lead.quotes.length}</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-[11px] text-muted-foreground">{label}</dt>
        <dd className="break-words font-medium">{value}</dd>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}
