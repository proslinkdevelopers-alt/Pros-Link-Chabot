import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { OWN, safeQuery, type QueryResult } from "@/lib/admin/queries";
import { DEPARTMENT } from "@/config/brand";

/**
 * =============================================================================
 *  Assistant analytics — web and WhatsApp
 * =============================================================================
 *
 *  One round of queries feeds every assistant dashboard; each shows the slice
 *  its reader acts on. Counts of things the assistant *did* come from
 *  `bot_events`; counts of things in the CRM come from the CRM tables.
 * =============================================================================
 */

export interface Row {
  label: string;
  count: number;
}

export interface ChatbotAnalytics {
  days: number;
  conversations: number;
  newLeads: number;
  qualifiedLeads: number;
  hotLeads: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: number;
  quotesRequested: number;
  demosRequested: number;
  callsRequested: number;
  serviceRequests: number;
  trackRequests: number;
  handovers: number;
  tickets: number;
  followUpsSent: number;
  optOuts: number;
  enterprise: number;
  fallbacks: number;
  flowsStarted: number;
  flowsCompleted: number;
  /** Share of conversations the assistant handled without a person. */
  selfServiceRate: number;
  /** Average seconds from a customer message to the next reply. */
  responseSeconds: number | null;
  sendFailures: number;
  revenue: number;
  daily: Row[];
  temperatures: Row[];
  stages: Row[];
  services: Row[];
  intents: Row[];
  cities: Row[];
  channels: Row[];
  sources: Row[];
  campaigns: Row[];
  revenueBySource: Row[];
  handoversByTeam: Row[];
  flows: Row[];
  menus: Row[];
  events: Row[];
  ticketCategories: Row[];
  ticketStatuses: Row[];
}

const EMPTY: ChatbotAnalytics = {
  days: 30,
  conversations: 0,
  newLeads: 0,
  qualifiedLeads: 0,
  hotLeads: 0,
  wonLeads: 0,
  lostLeads: 0,
  conversionRate: 0,
  quotesRequested: 0,
  demosRequested: 0,
  callsRequested: 0,
  serviceRequests: 0,
  trackRequests: 0,
  handovers: 0,
  tickets: 0,
  followUpsSent: 0,
  optOuts: 0,
  enterprise: 0,
  fallbacks: 0,
  flowsStarted: 0,
  flowsCompleted: 0,
  selfServiceRate: 0,
  responseSeconds: null,
  sendFailures: 0,
  revenue: 0,
  daily: [],
  temperatures: [],
  stages: [],
  services: [],
  intents: [],
  cities: [],
  channels: [],
  sources: [],
  campaigns: [],
  revenueBySource: [],
  handoversByTeam: [],
  flows: [],
  menus: [],
  events: [],
  ticketCategories: [],
  ticketStatuses: [],
};

function rows<T extends Record<string, unknown>>(
  groups: Array<T & { _count: { _all: number } }>,
  key: keyof T,
  limit = 8
): Row[] {
  return groups
    .map((group) => ({ label: String(group[key] ?? "Not recorded"), count: group._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function chatbotAnalytics(days: number): Promise<QueryResult<ChatbotAnalytics>> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  return safeQuery(async () => {
    const assistantConversations = { createdAt: { gte: since }, ...OWN };
    const assistantLeads = { source: { in: ["WHATSAPP" as const, "CHATBOT" as const] }, createdAt: { gte: since }, ...OWN };
    const eventsSince = { createdAt: { gte: since }, ...OWN };

    const [
      conversations,
      handedOff,
      conversationRows,
      newLeads,
      qualifiedLeads,
      hotLeads,
      wonLeads,
      lostLeads,
      eventGroups,
      tickets,
      sendFailures,
      temperatureGroups,
      stageGroups,
      serviceGroups,
      intentGroups,
      cityGroups,
      channelGroups,
      sourceGroups,
      campaignGroups,
      revenueGroups,
      handoverGroups,
      flowGroups,
      menuGroups,
      ticketCategoryGroups,
      ticketStatusGroups,
      response,
    ] = await Promise.all([
      prisma.conversation.count({ where: assistantConversations }),
      prisma.conversation.count({ where: { ...assistantConversations, handedOff: true } }),
      prisma.conversation.findMany({ where: assistantConversations, select: { createdAt: true } }),
      prisma.lead.count({ where: assistantLeads }),
      prisma.lead.count({ where: { ...assistantLeads, temperature: { in: ["WARM", "HOT", "HIGH_PRIORITY"] } } }),
      prisma.lead.count({ where: { ...assistantLeads, temperature: { in: ["HOT", "HIGH_PRIORITY"] } } }),
      prisma.lead.count({ where: { ...assistantLeads, stage: "WON" } }),
      prisma.lead.count({ where: { source: { in: ["WHATSAPP", "CHATBOT"] }, stage: "LOST", updatedAt: { gte: since }, ...OWN } }),
      prisma.botEvent.groupBy({ by: ["type"], _count: { _all: true }, where: eventsSince }),
      prisma.ticket.count({ where: { ...OWN, createdAt: { gte: since }, conversationId: { not: null } } }),
      prisma.systemLog.count({ where: { action: { in: ["whatsapp.send.failed", "chat.send.failed"] }, createdAt: { gte: since }, ...OWN } }),
      prisma.lead.groupBy({ by: ["temperature"], _count: { _all: true }, where: assistantLeads }),
      prisma.lead.groupBy({ by: ["stage"], _count: { _all: true }, where: assistantLeads }),
      prisma.lead.groupBy({ by: ["subService"], _count: { _all: true }, where: assistantLeads }),
      prisma.lead.groupBy({ by: ["intent"], _count: { _all: true }, where: assistantLeads }),
      prisma.lead.groupBy({ by: ["city"], _count: { _all: true }, where: assistantLeads }),
      prisma.conversation.groupBy({ by: ["channel"], _count: { _all: true }, where: assistantConversations }),
      prisma.conversation.groupBy({ by: ["trafficSource"], _count: { _all: true }, where: assistantConversations }),
      prisma.conversation.groupBy({
        by: ["campaign"],
        _count: { _all: true },
        where: { ...assistantConversations, campaign: { not: null } },
      }),
      prisma.lead.groupBy({
        by: ["trafficSource"],
        _sum: { estimatedValue: true },
        where: { source: { in: ["WHATSAPP", "CHATBOT"] }, stage: "WON", updatedAt: { gte: since }, ...OWN },
      }),
      prisma.botEvent.groupBy({ by: ["team"], _count: { _all: true }, where: { ...eventsSince, type: "HANDOVER" } }),
      prisma.botEvent.groupBy({ by: ["value"], _count: { _all: true }, where: { ...eventsSince, type: "FLOW_COMPLETED" } }),
      prisma.botEvent.groupBy({
        by: ["value"],
        _count: { _all: true },
        where: { ...eventsSince, type: { in: ["MENU_OPENED", "SERVICE_VIEWED"] }, value: { not: "root" } },
      }),
      prisma.ticket.groupBy({
        by: ["category"],
        _count: { _all: true },
        where: { ...OWN, createdAt: { gte: since }, conversationId: { not: null } },
      }),
      prisma.ticket.groupBy({
        by: ["status"],
        _count: { _all: true },
        where: { ...OWN, createdAt: { gte: since }, conversationId: { not: null } },
      }),
      prisma.$queryRaw<Array<{ seconds: number | null }>>(Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (t.next_at - t."createdAt")))::float AS seconds
        FROM (
          SELECT m."role", m."createdAt",
                 LEAD(m."createdAt") OVER (PARTITION BY m."conversationId" ORDER BY m."createdAt") AS next_at,
                 LEAD(m."role") OVER (PARTITION BY m."conversationId" ORDER BY m."createdAt") AS next_role
          FROM messages m
          JOIN conversations c ON c.id = m."conversationId"
          WHERE c."department"::text = ${DEPARTMENT} AND m."createdAt" >= ${since}
        ) t
        WHERE t."role" = 'USER' AND t.next_role = 'ASSISTANT'
      `),
    ]);

    const event = (type: string) => eventGroups.find((group) => group.type === type)?._count._all ?? 0;

    const buckets = new Map<string, number>();
    for (let i = days - 1; i >= 0; i -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      buckets.set(day.toISOString().slice(0, 10), 0);
    }
    for (const row of conversationRows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const revenueBySource = revenueGroups
      .map((group) => ({ label: group.trafficSource ?? "Not recorded", count: Number(group._sum.estimatedValue ?? 0) }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      days,
      conversations,
      newLeads,
      qualifiedLeads,
      hotLeads,
      wonLeads,
      lostLeads,
      conversionRate: newLeads ? Math.round((wonLeads / newLeads) * 1000) / 10 : 0,
      quotesRequested: event("QUOTE_REQUESTED"),
      demosRequested: event("DEMO_REQUESTED"),
      callsRequested: event("CALL_REQUESTED"),
      serviceRequests: event("SERVICE_REQUESTED"),
      trackRequests: event("TRACK_REQUESTED"),
      handovers: event("HANDOVER"),
      tickets,
      followUpsSent: event("FOLLOW_UP_SENT"),
      optOuts: event("OPTED_OUT"),
      enterprise: event("ENTERPRISE_DETECTED"),
      fallbacks: event("FALLBACK"),
      flowsStarted: event("FLOW_STARTED"),
      flowsCompleted: event("FLOW_COMPLETED"),
      selfServiceRate: conversations ? Math.round(((conversations - handedOff) / conversations) * 1000) / 10 : 0,
      responseSeconds: response[0]?.seconds ?? null,
      sendFailures,
      revenue: revenueBySource.reduce((sum, row) => sum + row.count, 0),
      daily: Array.from(buckets, ([label, count]) => ({ label, count })),
      temperatures: rows(temperatureGroups, "temperature"),
      stages: rows(stageGroups, "stage", 12),
      services: rows(serviceGroups, "subService"),
      intents: rows(intentGroups, "intent"),
      cities: rows(cityGroups, "city"),
      channels: rows(channelGroups, "channel"),
      sources: rows(sourceGroups, "trafficSource", 12),
      campaigns: rows(campaignGroups, "campaign"),
      revenueBySource,
      handoversByTeam: rows(handoverGroups, "team"),
      flows: rows(flowGroups, "value", 10),
      menus: rows(menuGroups, "value", 10),
      events: rows(eventGroups, "type", 25),
      ticketCategories: rows(ticketCategoryGroups, "category"),
      ticketStatuses: rows(ticketStatusGroups, "status"),
    };
  }, { ...EMPTY, days });
}
