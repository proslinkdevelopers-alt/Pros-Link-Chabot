import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";

/**
 * =============================================================================
 *  Admin data access
 * =============================================================================
 *
 *  Every admin page is a server component that queries Prisma directly. Two
 *  concerns are centralised here:
 *
 *   1. **Failure tolerance** — `safeQuery` turns a database outage (or a
 *      developer running without DATABASE_URL) into an empty result plus an
 *      error string, so the console renders a notice instead of a 500.
 *
 *   2. **Tenancy** — `OWN` is the `where` fragment every query spreads, and
 *      `isOwn` guards pages and routes that load one record by id. Strict
 *      equality on purpose: a NULL department marks a row this application
 *      did not write, and it must never be shown or changed.
 * =============================================================================
 */

export interface QueryResult<T> {
  data: T;
  error?: string;
}

/** Run a query, falling back to `fallback` and capturing the error message. */
export async function safeQuery<T>(
  run: () => Promise<T>,
  fallback: T
): Promise<QueryResult<T>> {
  try {
    return { data: await run() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[admin] query failed:", message);
    // Prisma's messages open with a blank line; an empty string here would
    // read as "no error" and hide the notice entirely.
    const summary = message.split("\n").map((line) => line.trim()).find(Boolean);
    return { data: fallback, error: summary ?? "Query failed" };
  }
}

/** `where` fragment that keeps every query inside this tenant. */
export const OWN = { department: DEPARTMENT };

/** True for a record this console may show and change. */
export function isOwn(department: string | null | undefined): boolean {
  return department === DEPARTMENT;
}

// --------------------------------------------------------------- Badges -----

export interface NavCounts {
  openTickets: number;
  newLeads: number;
}

/** Small live counts rendered as pills in the sidebar. */
export async function navCounts(): Promise<NavCounts> {
  const empty: NavCounts = { openTickets: 0, newLeads: 0 };

  const { data } = await safeQuery(async () => {
    const [openTickets, newLeads] = await Promise.all([
      prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, ...OWN } }),
      prisma.lead.count({ where: { stage: "NEW", ...OWN } }),
    ]);
    return { openTickets, newLeads };
  }, empty);

  return data;
}

// ------------------------------------------------------------ Dashboard -----

export interface DashboardStats {
  todayChats: number;
  totalConversations: number;
  leads: number;
  newLeads: number;
  wonLeads: number;
  revenue: number;
  openPipeline: number;
  openTickets: number;
  upcomingMeetings: number;
  activeProjects: number;
  conversionRate: number;
  satisfaction: number;
  popularServices: Array<{ label: string; count: number }>;
  recentActivity: Array<{
    id: string;
    action: string;
    message: string | null;
    createdAt: Date;
  }>;
}

const EMPTY_STATS: DashboardStats = {
  todayChats: 0,
  totalConversations: 0,
  leads: 0,
  newLeads: 0,
  wonLeads: 0,
  revenue: 0,
  openPipeline: 0,
  openTickets: 0,
  upcomingMeetings: 0,
  activeProjects: 0,
  conversionRate: 0,
  satisfaction: 0,
  popularServices: [],
  recentActivity: [],
};

/** Everything the dashboard widgets need, in one round of parallel queries. */
export async function dashboardStats(): Promise<QueryResult<DashboardStats>> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return safeQuery(async () => {
    const [
      todayChats,
      totalConversations,
      leads,
      newLeads,
      wonLeads,
      wonValue,
      openValue,
      openTickets,
      upcomingMeetings,
      activeProjects,
      ratings,
      serviceGroups,
      recentActivity,
    ] = await Promise.all([
      prisma.conversation.count({
        where: { createdAt: { gte: startOfToday }, ...OWN },
      }),
      prisma.conversation.count({ where: OWN }),
      prisma.lead.count({ where: OWN }),
      prisma.lead.count({ where: { stage: "NEW", ...OWN } }),
      prisma.lead.count({ where: { stage: "WON", ...OWN } }),
      prisma.lead.aggregate({
        where: { stage: "WON", ...OWN },
        _sum: { estimatedValue: true },
      }),
      prisma.lead.aggregate({
        where: { stage: { notIn: ["WON", "LOST"] }, ...OWN },
        _sum: { estimatedValue: true },
      }),
      prisma.ticket.count({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] }, ...OWN },
      }),
      prisma.meeting.count({
        where: {
          preferredDate: { gte: startOfToday },
          status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] },
          ...OWN,
        },
      }),
      prisma.legacyProject.count({
        where: { status: { in: ["DISCOVERY", "IN_PROGRESS", "REVIEW"] } },
      }),
      prisma.conversation.aggregate({
        where: { rating: { not: null }, ...OWN },
        _avg: { rating: true },
      }),
      prisma.lead.groupBy({
        by: ["serviceSlug"],
        _count: { _all: true },
        where: { serviceSlug: { not: null }, ...OWN },
        orderBy: { _count: { serviceSlug: "desc" } },
        take: 6,
      }),
      prisma.systemLog.findMany({
        where: OWN,
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, action: true, message: true, createdAt: true },
      }),
    ]);

    return {
      todayChats,
      totalConversations,
      leads,
      newLeads,
      wonLeads,
      revenue: Number(wonValue._sum.estimatedValue ?? 0),
      openPipeline: Number(openValue._sum.estimatedValue ?? 0),
      openTickets,
      upcomingMeetings,
      activeProjects,
      conversionRate: leads ? Math.round((wonLeads / leads) * 100) : 0,
      satisfaction: Number(ratings._avg.rating ?? 0),
      popularServices: serviceGroups.map((g) => ({
        label: g.serviceSlug ?? "Unspecified",
        count: g._count._all,
      })),
      recentActivity,
    } satisfies DashboardStats;
  }, EMPTY_STATS);
}
