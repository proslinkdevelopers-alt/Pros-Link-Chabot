import {
  AlertTriangle,
  Bot,
  CalendarCheck,
  Flame,
  Headset,
  MessagesSquare,
  Percent,
  PhoneForwarded,
  ReceiptText,
  Send,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { requirePagePermission } from "@/lib/staff";
import { chatbotAnalytics, type ChatbotAnalytics } from "@/lib/bot/analytics";
import { loadConfigState } from "@/lib/bot/config";
import { DEFAULT_BOT_CONFIG } from "@/data/bot";
import { DbNotice, FilterChip, PageHeader, StatCard } from "@/components/admin/ui";
import { Breakdown, DailyColumns } from "@/components/admin/charts";
import { formatPkr, humanise } from "@/lib/utils";

export const metadata = { title: "Chatbot Analytics" };

const VIEWS = {
  ceo: "CEO",
  sales: "Sales",
  marketing: "Marketing",
  support: "Support",
  ai: "AI & Automation",
  admin: "Admin",
} as const;

type View = keyof typeof VIEWS;
const RANGES = [7, 30, 90] as const;

export default async function ChatbotAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; days?: string }>;
}) {
  await requirePagePermission("reports.view", "/admin/chatbot/analytics");
  const params = await searchParams;
  const view: View = params.view && params.view in VIEWS ? (params.view as View) : "ceo";
  const days = RANGES.find((range) => String(range) === params.days) ?? 30;

  const [{ data, error }, configState] = await Promise.all([chatbotAnalytics(days), loadConfigState()]);
  const url = (next: { view?: View; days?: number }) =>
    `/admin/chatbot/analytics?view=${next.view ?? view}&days=${next.days ?? days}`;

  return (
    <>
      <PageHeader
        eyebrow="WhatsApp assistant"
        title="Chatbot Analytics"
        description={`What the WhatsApp assistant produced in the last ${days} days, shown for the team that acts on it.`}
      />

      {error && <DbNotice error={error} />}

      {/* One filter row above the charts: the dashboard, then the time range. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="scroll-slim flex gap-2 overflow-x-auto pb-1">
          {(Object.keys(VIEWS) as View[]).map((key) => (
            <FilterChip key={key} href={url({ view: key })} label={VIEWS[key]} active={view === key} />
          ))}
        </div>
        <div className="flex gap-2">
          {RANGES.map((range) => (
            <FilterChip key={range} href={url({ days: range })} label={`${range} days`} active={days === range} />
          ))}
        </div>
      </div>

      {view === "ceo" && <Ceo data={data} />}
      {view === "sales" && <Sales data={data} />}
      {view === "marketing" && <Marketing data={data} />}
      {view === "support" && <Support data={data} />}
      {view === "ai" && <Automation data={data} />}
      {view === "admin" && (
        <Admin
          data={data}
          customised={configState.customised}
          warnings={[...configState.warnings, ...configState.invalid.map((entry) => `Stored "${entry.section}" ignored: ${entry.issues[0]}`)]}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ Views ---

const pct = (value: number) => `${value}%`;
const serviceLabel = (label: string) => label;

function Tiles({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function Ceo({ data }: { data: ChatbotAnalytics }) {
  return (
    <>
      <Tiles>
        <StatCard label="Conversations" value={data.conversations} hint="New WhatsApp threads" icon={MessagesSquare} />
        <StatCard label="New leads" value={data.newLeads} hint={`${data.hotLeads} hot or high priority`} icon={UserPlus} href="/admin/crm/leads?source=WHATSAPP" />
        <StatCard label="Conversion rate" value={pct(data.conversionRate)} hint="Won ÷ new WhatsApp leads" icon={TrendingUp} />
        <StatCard label="Revenue attributed" value={formatPkr(data.revenue)} hint="Estimated value of won leads" icon={ReceiptText} />
      </Tiles>
      <div className="mb-6">
        <DailyColumns title="Conversations per day" rows={data.daily} />
      </div>
      <Grid>
        <Breakdown title="Revenue by source" rows={data.revenueBySource} format={formatPkr} empty="No won WhatsApp leads with a value yet." />
        <Breakdown title="Lead temperature" rows={data.temperatures} />
        <Breakdown title="Service demand" rows={data.services} labels={serviceLabel} />
        <Breakdown title="Demand by city" rows={data.cities} labels={(label) => label} />
        <Breakdown title="Conversation sources" rows={data.sources} />
        <Breakdown title="Outcomes" rows={outcomes(data)} labels={(label) => label} />
      </Grid>
    </>
  );
}

function outcomes(data: ChatbotAnalytics) {
  return [
    { label: "Quotes requested", count: data.quotesRequested },
    { label: "Strategy calls requested", count: data.callsRequested },
    { label: "Demos requested", count: data.demosRequested },
    { label: "Service requests", count: data.serviceRequests },
    { label: "Handed to a person", count: data.handovers },
    { label: "Support tickets", count: data.tickets },
  ].filter((row) => row.count > 0);
}

function Sales({ data }: { data: ChatbotAnalytics }) {
  return (
    <>
      <Tiles>
        <StatCard label="Qualified leads" value={data.qualifiedLeads} hint={`of ${data.newLeads} new leads`} icon={UserPlus} href="/admin/crm/leads?source=WHATSAPP" />
        <StatCard label="Hot & high priority" value={data.hotLeads} hint="Call these first" icon={Flame} href="/admin/crm/leads?stage=HOT" />
        <StatCard label="Quotes requested" value={data.quotesRequested} icon={ReceiptText} href="/admin/quotes" />
        <StatCard label="Calls & demos" value={data.callsRequested + data.demosRequested} hint={`${data.callsRequested} calls · ${data.demosRequested} demos`} icon={CalendarCheck} href="/admin/meetings" />
      </Tiles>
      <Tiles>
        <StatCard label="Won" value={data.wonLeads} icon={TrendingUp} />
        <StatCard label="Lost" value={data.lostLeads} icon={TrendingDown} />
        <StatCard label="Enterprise opportunities" value={data.enterprise} icon={Sparkles} />
        <StatCard label="Handovers" value={data.handovers} icon={PhoneForwarded} href="/admin/conversations" />
      </Tiles>
      <Grid>
        <Breakdown title="Pipeline stage" rows={data.stages} />
        <Breakdown title="Lead temperature" rows={data.temperatures} />
        <Breakdown title="Handovers by team" rows={data.handoversByTeam} labels={teamLabel} />
        <Breakdown title="Service demand" rows={data.services} labels={serviceLabel} />
        <Breakdown title="Intent" rows={data.intents} />
        <Breakdown title="City" rows={data.cities} labels={(label) => label} />
      </Grid>
    </>
  );
}

function Marketing({ data }: { data: ChatbotAnalytics }) {
  return (
    <>
      <Tiles>
        <StatCard label="Conversations" value={data.conversations} icon={MessagesSquare} />
        <StatCard label="New leads" value={data.newLeads} icon={UserPlus} />
        <StatCard label="Lead rate" value={pct(data.conversations ? Math.round((data.newLeads / data.conversations) * 1000) / 10 : 0)} hint="Leads ÷ conversations" icon={Percent} />
        <StatCard label="Follow-ups sent" value={data.followUpsSent} hint={`${data.optOuts} opt-outs`} icon={Send} />
      </Tiles>
      <div className="mb-6">
        <DailyColumns title="Conversations per day" rows={data.daily} />
      </div>
      <Grid>
        <Breakdown title="Conversation sources" rows={data.sources} />
        <Breakdown title="Campaigns" rows={data.campaigns} labels={(label) => label} empty="No campaign or ad attribution yet. Use ref: codes and click-to-WhatsApp ads." />
        <Breakdown title="Revenue by source" rows={data.revenueBySource} format={formatPkr} empty="No won leads with a value yet." />
        <Breakdown title="Service demand" rows={data.services} labels={serviceLabel} />
        <Breakdown title="Demand by city" rows={data.cities} labels={(label) => label} />
        <Breakdown title="Most opened menus" rows={data.menus} />
      </Grid>
    </>
  );
}

function Support({ data }: { data: ChatbotAnalytics }) {
  return (
    <>
      <Tiles>
        <StatCard label="Support tickets" value={data.tickets} icon={Headset} href="/admin/support/tickets" />
        <StatCard label="Handovers" value={data.handovers} icon={PhoneForwarded} href="/admin/conversations" />
        <StatCard label="Avg response time" value={data.responseSeconds == null ? "—" : formatSeconds(data.responseSeconds)} hint="Customer message → next reply" icon={Timer} />
        <StatCard label="Resolved by the assistant" value={pct(data.aiResolutionRate)} hint="Conversations never handed over" icon={Bot} />
      </Tiles>
      <Grid>
        <Breakdown title="Handovers by team" rows={data.handoversByTeam} labels={teamLabel} />
        <Breakdown title="Ticket category" rows={data.ticketCategories} />
        <Breakdown title="Ticket status" rows={data.ticketStatuses} />
      </Grid>
    </>
  );
}

function Automation({ data }: { data: ChatbotAnalytics }) {
  const completion = data.flowsStarted ? Math.round((data.flowsCompleted / data.flowsStarted) * 1000) / 10 : 0;
  return (
    <>
      <Tiles>
        <StatCard label="AI resolution rate" value={pct(data.aiResolutionRate)} hint="Conversations never handed over" icon={Bot} />
        <StatCard label="AI answers" value={data.aiReplies} hint={`${data.fallbacks} could not be answered`} icon={Sparkles} />
        <StatCard label="Flow completion" value={pct(completion)} hint={`${data.flowsCompleted} of ${data.flowsStarted} flows`} icon={Percent} />
        <StatCard label="Follow-ups sent" value={data.followUpsSent} hint={`${data.optOuts} opt-outs`} icon={Send} />
      </Tiles>
      <Grid>
        <Breakdown title="Completed flows" rows={data.flows} />
        <Breakdown title="Most opened menus & services" rows={data.menus} />
        <Breakdown title="Intent of leads" rows={data.intents} />
      </Grid>
    </>
  );
}

function Admin({
  data,
  customised,
  warnings,
}: {
  data: ChatbotAnalytics;
  customised: string[];
  warnings: string[];
}) {
  const sections = Object.keys(DEFAULT_BOT_CONFIG).length;
  return (
    <>
      <Tiles>
        <StatCard label="Customised sections" value={`${customised.length} / ${sections}`} hint="Chatbot Studio" icon={Sparkles} href="/admin/chatbot" />
        <StatCard label="Configuration warnings" value={warnings.length} icon={AlertTriangle} href="/admin/chatbot" />
        <StatCard label="WhatsApp send failures" value={data.sendFailures} icon={AlertTriangle} href="/admin/logs" />
        <StatCard label="Opt-outs" value={data.optOuts} icon={TrendingDown} />
      </Tiles>
      <Grid>
        <Breakdown title="Assistant events" rows={data.events} />
        <Breakdown
          title="Customised sections"
          rows={customised.map((label) => ({ label, count: 1 }))}
          format={() => "custom"}
          empty="Every section is using the built-in defaults."
        />
      </Grid>
    </>
  );
}

function teamLabel(label: string): string {
  const key = label as keyof typeof DEFAULT_BOT_CONFIG.teams;
  return DEFAULT_BOT_CONFIG.teams[key]?.label ?? humanise(label);
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}
