import { requirePagePermission } from "@/lib/staff";
import { Callout, PageHeader } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { config } from "@/lib/config";
import {
  Bot,
  Database,
  Mail,
  MapPin,
  MessageSquare,
  Server,
  Smartphone,
  Webhook,
} from "lucide-react";

import { checkConnection } from "@/lib/whatsapp/client";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

/**
 * Integration status board.
 *
 * Read-only by design: every credential is supplied through environment
 * variables, so nothing here can leak a secret to the browser — the page
 * reports only whether each integration is configured, never its value.
 */
export default async function IntegrationsPage() {
  await requirePagePermission("settings.manage", "/admin/integrations");

  // Asked of Meta by this server, on every render. Verifying a token from a
  // laptop proves nothing about production: the panel may hold a different
  // value, or the host may not reach Meta at all. This answers both.
  const whatsapp = config.whatsapp.enabled
    ? await checkConnection()
    : { ok: false, detail: "Not configured on this server." };

  const integrations = [
    {
      icon: Bot,
      name: "AI provider",
      configured: Boolean(
        config.ai.anthropicApiKey || config.ai.openaiApiKey || config.ai.geminiApiKey
      ),
      detail: `${config.ai.provider}${
        config.ai.provider === "claude" && config.ai.anthropicBaseUrl?.includes("aws-external-anthropic")
          ? " (Claude Platform on AWS)"
          : ""
      } · ${config.ai.model} · max ${config.ai.maxTokens} tokens`,
      env: "AI_PROVIDER, AI_MODEL, ANTHROPIC_API_KEY (+ ANTHROPIC_BASE_URL, ANTHROPIC_WORKSPACE_ID on AWS) / OPENAI_API_KEY / GEMINI_API_KEY",
    },
    {
      icon: Database,
      name: "PostgreSQL",
      configured: Boolean(config.databaseUrl),
      detail: config.databaseUrl ? "Connection string set" : "Not configured",
      env: "DATABASE_URL",
    },
    {
      icon: Server,
      name: "Redis",
      configured: Boolean(config.redisUrl),
      detail: config.redisUrl
        ? "Rate limiting active"
        : "Not configured — rate limiting fails open",
      env: "REDIS_URL",
    },
    {
      icon: MessageSquare,
      name: "WhatsApp — outbound",
      // Green here means Meta answered this server, not merely that a value is
      // present. A wrong token is the difference between the two.
      configured: whatsapp.ok,
      detail: whatsapp.ok
        ? `${whatsapp.detail}${config.whatsapp.autoReply ? "" : " · auto-reply is OFF"}`
        : whatsapp.detail,
      env: "WHATSAPP_PHONE_ID, WHATSAPP_TOKEN, WHATSAPP_API_VERSION, WHATSAPP_AUTO_REPLY",
    },
    {
      icon: Webhook,
      name: "WhatsApp — inbound webhook",
      configured: config.whatsapp.webhookReady,
      detail: config.whatsapp.webhookReady
        ? "Verification token and signature secret set"
        : "Inbound messages are rejected until both are set",
      env: "WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET",
    },
    {
      icon: Mail,
      name: "Email (SMTP)",
      configured: config.mail.enabled,
      detail: config.mail.enabled
        ? `Sending as ${config.mail.from}`
        : "Notifications queue but are not delivered",
      env: "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM",
    },
    {
      icon: Smartphone,
      name: "SMS gateway",
      configured: config.sms.enabled,
      detail: config.sms.enabled ? `Sender ID ${config.sms.senderId}` : "Not configured",
      env: "SMS_API_KEY, SMS_SENDER_ID",
    },
    {
      icon: MapPin,
      name: "Google Maps",
      configured: Boolean(config.maps.apiKey),
      detail: config.maps.apiKey ? "Key set" : "Office location maps disabled",
      env: "GOOGLE_MAPS_API_KEY",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Integrations"
        description="What's wired up and what still needs credentials."
      />

      <Callout title="Credentials live in environment variables">
        Nothing on this page can reveal a secret — it reports configured or not, and names the
        variable to set. Update your <code>.env</code> (or your host's secret manager) and restart
        the app to change any of these.
      </Callout>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {integrations.map((integration) => (
          <Card key={integration.name} className="flex items-start gap-3 p-4">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                integration.configured
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              <integration.icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{integration.name}</h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    integration.configured
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {integration.configured ? "Configured" : "Not configured"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{integration.detail}</p>
              <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                {integration.env}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* The one value that has to be copied *out* of this app and into Meta. */}
      <Card className="mt-6 p-5">
        <div className="flex items-center gap-2">
          <Webhook className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">WhatsApp webhook callback URL</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste this into Meta ▸ your app ▸ WhatsApp ▸ Configuration ▸ Webhook, together with
          the value of <code>WHATSAPP_VERIFY_TOKEN</code>, then subscribe to the{" "}
          <code>messages</code> field.
        </p>
        <p className="mt-3 break-all rounded-xl bg-secondary px-3 py-2 font-mono text-xs">
          {config.whatsapp.webhookUrl}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Must be publicly reachable over HTTPS. In local development, expose it with a tunnel
          (e.g. <code>ngrok http 3000</code>) and register the tunnel URL instead.
        </p>
      </Card>
    </>
  );
}
