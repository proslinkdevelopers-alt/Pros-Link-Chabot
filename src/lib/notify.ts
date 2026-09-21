import type { NotificationChannel, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { config } from "./config";
import { DEPARTMENT } from "@/config/brand";
import { ROLE_PERMISSIONS, STAFF_ROLES, type Permission } from "./permissions";

/**
 * =============================================================================
 *  Notifications and the audit log
 * =============================================================================
 *
 *  Two kinds of notification:
 *
 *    • in-app — one row per staff member, shown under the bell in the console
 *      until read. Sent to named people (an assignee) or to everyone whose role
 *      holds a permission (everyone who can work tickets).
 *    • email — queued rows for a team inbox, delivered by whatever worker the
 *      deployment runs against the `notifications` table.
 *
 *  And one audit log (`system_logs`): who did what to which record, with the
 *  values before and after for changes.
 *
 *  Everything here is best-effort: a chat or a status change must never fail
 *  because a notification could not be written, so failures are logged and
 *  swallowed.
 * =============================================================================
 */

export interface TeamNotification {
  subject: string;
  body: string;
  /** Deep link into the console, e.g. `/admin/leads/<id>`. */
  link?: string;
  channel?: NotificationChannel;
  /** Team inboxes from the chatbot configuration; omitted, the sales inbox. */
  to?: string[];
}

/** Queue an email notification for a team inbox. Skipped when no inbox is configured. */
export async function notifyTeam(notification: TeamNotification): Promise<void> {
  const fallback = config.routing.salesEmail;
  const recipients = notification.to?.length ? notification.to : fallback ? [fallback] : [];
  if (!recipients.length) return;

  try {
    await prisma.notification.createMany({
      data: recipients.map((to) => ({
        department: DEPARTMENT,
        channel: notification.channel ?? "EMAIL",
        to,
        subject: notification.subject,
        body: notification.body,
        link: notification.link,
      })),
    });
  } catch (error) {
    console.warn("[notify] queue skipped:", errorMessage(error));
  }
}

export interface StaffNotification {
  subject: string;
  body?: string;
  link?: string;
  /** Specific people, e.g. the new assignee. */
  userIds?: Array<string | null | undefined>;
  /** Everyone whose role holds this permission. */
  permission?: Permission;
  /** Leave this person out — usually whoever caused the notification. */
  exceptUserId?: string;
}

/** In-app notifications under the console bell. */
export async function notifyStaff(notification: StaffNotification): Promise<void> {
  try {
    const ids = new Set(notification.userIds?.filter((id): id is string => Boolean(id)));

    if (notification.permission) {
      const roles = STAFF_ROLES.filter((role) => ROLE_PERMISSIONS[role].includes(notification.permission!));
      const users = await prisma.user.findMany({
        where: { department: DEPARTMENT, isActive: true, role: { in: roles } },
        select: { id: true },
        take: 200,
      });
      for (const user of users) ids.add(user.id);
    }
    if (notification.exceptUserId) ids.delete(notification.exceptUserId);
    if (!ids.size) return;

    await prisma.notification.createMany({
      data: [...ids].map((userId) => ({
        department: DEPARTMENT,
        channel: "IN_APP" as const,
        to: userId,
        userId,
        subject: notification.subject,
        body: notification.body ?? "",
        link: notification.link,
      })),
    });
  } catch (error) {
    console.warn("[notify] in-app skipped:", errorMessage(error));
  }
}

export interface AuditEntry {
  action: string;
  entity?: string;
  entityId?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
  level?: "DEBUG" | "INFO" | "WARN" | "ERROR";
}

/** Write an audit-log entry. Never throws. */
export async function logEvent(entry: AuditEntry): Promise<void> {
  try {
    await prisma.systemLog.create({
      data: {
        level: entry.level ?? "INFO",
        action: entry.action,
        department: DEPARTMENT,
        entity: entry.entity,
        entityId: entry.entityId,
        message: entry.message,
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent?.slice(0, 300),
        userId: entry.userId,
      },
    });
  } catch (error) {
    console.warn("[log] skipped:", errorMessage(error));
  }
}

/** The fields whose values differ, with before and after, for the audit log. */
export function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(after)) {
    const previous = before?.[key];
    if (JSON.stringify(normalise(previous)) !== JSON.stringify(normalise(value))) {
      changes[key] = { from: normalise(previous) ?? null, to: normalise(value) ?? null };
    }
  }
  return changes;
}

function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: unknown }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return value;
}

/**
 * Record a change a staff member made: the action, the record, and each field
 * that changed with its previous and new value.
 */
export async function audit(input: {
  action: string;
  entity: string;
  entityId: string;
  userId?: string;
  message?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  req?: Request;
}): Promise<void> {
  const changes = input.after ? diff(input.before, input.after) : undefined;
  await logEvent({
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    userId: input.userId,
    message: input.message,
    metadata: { ...(changes && Object.keys(changes).length ? { changes } : {}), ...(input.extra ?? {}) },
    ipAddress: input.req ? clientIpOf(input.req) : undefined,
    userAgent: input.req?.headers.get("user-agent") ?? undefined,
  });
}

export function clientIpOf(req: Request): string | undefined {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.split("\n").find(Boolean) ?? error.message : String(error);
}
