import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";

/**
 * Counts per calendar day in Pakistan time, for the dashboard and reports.
 * Table names come from this fixed list, never from a request.
 */
const TABLES = {
  leads: "marketing_leads",
  tickets: "tickets",
  quotes: "quotes",
  conversations: "conversations",
} as const;

export type MetricTable = keyof typeof TABLES;

/** The last `days` dates (YYYY-MM-DD, Asia/Karachi), oldest first. */
export function lastDays(days: number, now = new Date()): string[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(now);
  const base = new Date(`${today}T00:00:00Z`).getTime();
  return Array.from({ length: days }, (_, index) => new Date(base - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10));
}

/** Rows created per day over the last `days` days, aligned to `lastDays(days)`. */
export async function perDay(table: MetricTable, days: number, filter?: Prisma.Sql): Promise<number[]> {
  const labels = lastDays(days);
  // Columns hold UTC wall-clock times without a zone, so compare against the
  // UTC wall-clock of Karachi midnight — independent of the session time zone.
  const since = new Date(`${labels[0]}T00:00:00+05:00`).toISOString();
  const rows = await prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
    SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Karachi')::date AS day, count(*) AS count
    FROM ${Prisma.raw(`"${TABLES[table]}"`)}
    WHERE "department"::text = ${DEPARTMENT} AND "createdAt" >= ${since}::timestamp ${filter ? Prisma.sql`AND ${filter}` : Prisma.empty}
    GROUP BY 1`;
  const byDay = new Map(rows.map((row) => [row.day.toISOString().slice(0, 10), Number(row.count)]));
  return labels.map((label) => byDay.get(label) ?? 0);
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** "+12%" / "−5%" / "new" against the previous period, or null when both are zero. */
export function delta(current: number, previous: number): string | null {
  if (!previous) return current ? "new this period" : null;
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change >= 0 ? "+" : "−"}${Math.abs(change)}% vs previous`;
}
