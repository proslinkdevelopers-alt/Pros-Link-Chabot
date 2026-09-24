import { config } from "@/lib/config";

export interface IntegrationStatus {
  name: string;
  state: "ready" | "missing" | "optional";
  detail: string;
  /** Environment variables that control it — names only, never values. */
  env: string[];
}

/**
 * What is configured, read from the environment. Only whether each setting is
 * present is reported; no value ever leaves the server.
 */
export function integrationStatus(): IntegrationStatus[] {
  return [
    {
      name: "WhatsApp Cloud API — sending",
      state: config.whatsapp.enabled ? "ready" : "missing",
      detail: config.whatsapp.enabled ? "Replies, templates and broadcasts can be sent." : "Set the phone number ID and access token to reply on WhatsApp.",
      env: ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"],
    },
    {
      name: "WhatsApp Cloud API — webhook",
      state: config.whatsapp.webhookReady ? "ready" : "missing",
      detail: config.whatsapp.webhookReady ? `Register ${config.whatsapp.webhookUrl} in Meta and subscribe to “messages”.` : "Set the verify token and app secret so Meta can deliver messages securely.",
      env: ["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"],
    },
    {
      name: "WhatsApp templates",
      state: config.whatsapp.templatesEnabled ? "ready" : "optional",
      detail: config.whatsapp.templatesEnabled ? "Templates can be synced and submitted for approval." : "Set the business account ID to manage templates from the console.",
      env: ["WHATSAPP_BUSINESS_ACCOUNT_ID"],
    },
    {
      name: "Email notifications",
      state: "optional",
      detail:
        "New leads, quote requests and tickets are queued as email rows in the notifications table for the team inbox. This app does not include a mail sender — a worker must deliver them (see docs/DEPLOYMENT.md). In-app notifications work without it.",
      env: ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "SALES_NOTIFY_EMAIL"],
    },
    {
      name: "Rate limiting store",
      state: config.redisUrl ? "ready" : "optional",
      detail: config.redisUrl ? "Shared across all server instances." : "Limits are kept in memory — fine for one server; set Redis when running several.",
      env: ["REDIS_URL"],
    },
    {
      name: "Scheduled follow-ups",
      state: config.cron.secret ? "ready" : "optional",
      detail: config.cron.secret ? "Call /api/cron/follow-ups every 15–30 minutes with the secret." : "Follow-up messages are off until a cron secret is set.",
      env: ["CRON_SECRET"],
    },
  ];
}
