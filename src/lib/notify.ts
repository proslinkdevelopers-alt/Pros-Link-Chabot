import type { NotificationChannel } from "@prisma/client";
import { prisma } from "./db";
import { config } from "./config";
import { DEPARTMENT } from "@/config/brand";

/**
 * =============================================================================
 *  Team notifications & audit logging
 * =============================================================================
 *
 *  Every lead, meeting request and ticket queues a notification for the team
 *  and writes an audit entry. Both are best-effort: a chat must never fail
 *  because the mailer is down or the database is briefly unreachable, so
 *  failures are logged and swallowed.
 *
 *  Delivery itself (SMTP / SMS / WhatsApp) is performed by a worker reading the
 *  `notifications` table — the queue row is written here, transport is not
 *  attempted inline so a slow provider can't block the request.
 * =============================================================================
 */

export interface TeamNotification {
  subject: string;
  body: string;
  /** Deep link into the admin console, e.g. `/admin/crm/leads/<id>`. */
  link?: string;
  channel?: NotificationChannel;
  /**
   * Specific recipients — a team's inboxes from the chatbot configuration.
   * Omitted, the notification goes to the sales inbox.
   */
  to?: string[];
}

/** Queue a notification for the sales team's inbox, or for the recipients given. */
export async function notifyTeam(notification: TeamNotification): Promise<void> {
  const fallback = config.routing.salesEmail ?? config.mail.from;
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
        metadata: entry.metadata as never,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        userId: entry.userId,
      },
    });
  } catch (error) {
    console.warn("[log] skipped:", errorMessage(error));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
