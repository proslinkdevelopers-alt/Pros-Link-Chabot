import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import type { TimelineItem } from "@/components/admin/ui";

const TYPE_LABEL: Record<string, string> = {
  NOTE: "Note",
  FOLLOW_UP: "Follow-up",
  REMINDER: "Reminder",
  CALL: "Call",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  MEETING: "Meeting / visit",
  STAGE_CHANGE: "Stage changed",
  STATUS_CHANGE: "Status changed",
  ASSIGNMENT: "Assignment",
};

/**
 * Notes, calls, stage and status changes and assignments on one or more
 * records, newest first, as timeline items.
 */
export async function activityTimeline(targets: Array<{ entityType: string; entityId: string; label?: string }>, limit = 60): Promise<TimelineItem[]> {
  if (!targets.length) return [];
  const rows = await prisma.crmActivity.findMany({
    where: { department: DEPARTMENT, OR: targets.map(({ entityType, entityId }) => ({ entityType, entityId })) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, type: true, body: true, entityType: true, entityId: true, dueAt: true, createdAt: true, owner: { select: { name: true } } },
  });
  const labels = new Map(targets.map((target) => [`${target.entityType}:${target.entityId}`, target.label]));
  return rows.map((row) => {
    const on = labels.get(`${row.entityType}:${row.entityId}`);
    const change = row.type === "STAGE_CHANGE" || row.type === "STATUS_CHANGE" || row.type === "ASSIGNMENT";
    return {
      id: row.id,
      at: row.createdAt,
      title: `${TYPE_LABEL[row.type] ?? row.type}${on ? ` · ${on}` : ""}${change ? `: ${row.body}` : ""}`,
      body: change ? undefined : `${row.body}${row.dueAt ? `\nDue ${row.dueAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" })}` : ""}`,
      actor: row.owner?.name,
      tone: change ? ("primary" as const) : ("default" as const),
    };
  });
}

/** Merge timeline sources, newest first. */
export function mergeTimeline(...sources: TimelineItem[][]): TimelineItem[] {
  return sources.flat().sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
