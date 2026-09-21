/**
 * Server-side runtime configuration. Reads and validates environment variables
 * once, and exposes a typed `config` object to the rest of the app.
 *
 * Import this only from server code (route handlers, server components, lib).
 * Anything the browser needs must go through `NEXT_PUBLIC_*` or a prop.
 */
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null ? def : /^(1|true|yes|on)$/i.test(v)));

const optional = z.string().optional();

/** Used only outside production. A production server refuses to start with it. */
const DEV_JWT_SECRET = "dev-insecure-secret-change-me";

/**
 * Normalise NODE_ENV instead of rejecting it.
 *
 * Managed hosts do not always set a value Next.js considers standard — some
 * shared platforms use "prod", "staging" or leave it blank. Throwing on those
 * takes the whole site down for a label mismatch, so anything unrecognised is
 * treated as production: the safe assumption for a deployed app, since it is
 * the stricter of the two modes (secure cookies, no dev affordances).
 */
const nodeEnv = z.preprocess((value) => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "development";
  if (raw === "development" || raw === "dev") return "development";
  if (raw === "test") return "test";
  return "production";
}, z.enum(["development", "test", "production"]));

const schema = z.object({
  NODE_ENV: nodeEnv.default("development"),
  APP_NAME: z.string().default("Pros-Link"),
  APP_URL: z.string().default("http://localhost:3000"),

  DATABASE_URL: optional,
  REDIS_URL: optional,

  JWT_SECRET: z.string().default(DEV_JWT_SECRET),
  JWT_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),

  AI_PROVIDER: z.enum(["claude", "openai", "ollama", "gemini"]).default("claude"),
  /** Model id for the selected provider. Unset means that provider's default below. */
  AI_MODEL: optional,
  /**
   * Model that reads each conversation for the customer's details. Defaults to
   * AI_MODEL; a smaller model from the same provider is cheaper and plenty.
   */
  AI_EXTRACTION_MODEL: optional,
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(1400),
  AI_THINKING: bool(false),

  ANTHROPIC_API_KEY: optional,
  /**
   * Where Claude requests go. Unset means Anthropic's own API. For Claude
   * Platform on AWS it is the regional endpoint,
   * `https://aws-external-anthropic.<region>.api.aws`, and the API key is one
   * generated in the AWS console.
   */
  ANTHROPIC_BASE_URL: optional,
  /** Claude Platform on AWS workspace (`wrkspc_…`) — required there, unused elsewhere. */
  ANTHROPIC_WORKSPACE_ID: optional,
  OPENAI_API_KEY: optional,
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  GEMINI_API_KEY: optional,
  /**
   * How much a Gemini model thinks before answering: `off` (a zero budget —
   * Gemini 2.5 Flash and Flash-Lite), or `minimal` / `low` / `medium` / `high`
   * (Gemini 3). Unset leaves the model's own default. Thought tokens count
   * against AI_MAX_TOKENS, so a model that thinks at length on a chat reply can
   * run out of room for the reply itself.
   */
  GEMINI_THINKING: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined),
    z.enum(["off", "minimal", "low", "medium", "high"]).optional()
  ),

  // --- Notification & integration channels ---------------------------------
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  SMTP_FROM: z.string().default(""),

  SMS_API_KEY: optional,
  SMS_SENDER_ID: z.string().default(""),

  // --- WhatsApp Business Cloud API (Meta) ----------------------------------
  /** Phone number ID of the business number (Meta → WhatsApp → API Setup). */
  WHATSAPP_PHONE_ID: optional,
  /** Permanent system-user access token with `whatsapp_business_messaging`. */
  WHATSAPP_TOKEN: optional,
  /** Shared secret typed into Meta's webhook form; echoed back on GET verify. */
  WHATSAPP_VERIFY_TOKEN: optional,
  /** Meta app secret, used to verify the `X-Hub-Signature-256` on every POST. */
  WHATSAPP_APP_SECRET: optional,
  /**
   * WhatsApp Business Account ID — a different id from the phone number ID.
   * Message templates belong to the account, not the number, so every template
   * call (list, create, delete) is addressed to this and nothing else.
   */
  WHATSAPP_WABA_ID: optional,
  WHATSAPP_API_VERSION: z.string().default("v21.0"),
  /** Set false to keep the number connected but stop the bot from replying. */
  WHATSAPP_AUTO_REPLY: bool(true),

  GOOGLE_MAPS_API_KEY: optional,

  // --- Team routing --------------------------------------------------------
  /** Inbox that receives new leads, quotes, meetings and escalations. */
  SALES_NOTIFY_EMAIL: optional,

  // --- Scheduled jobs ------------------------------------------------------
  /** Bearer secret for /api/cron/* endpoints. Unset disables them. */
  CRON_SECRET: optional,
});

const parsed = schema.safeParse(process.env);

/**
 * `next build` imports every route module to collect its metadata, so anything
 * this file throws happens *during the build* — and Next reports it by falling
 * back to the pages-router error document, i.e. the notoriously misleading
 * "<Html> should not be imported outside of pages/_document" while prerendering
 * /404. The real cause (one bad environment variable) never appears in the log.
 *
 * A build must not depend on runtime configuration being present or correct:
 * on shared hosting the panel's variables are frequently applied to the running
 * app but not to the build shell. So during a build we log loudly and fall back
 * to the schema defaults; at runtime, where a misconfiguration is a genuine
 * problem, we still refuse to start.
 */
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-development-server";

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  console.error("Invalid environment configuration:", issues);

  if (!isBuildPhase) {
    throw new Error("Invalid environment configuration. See logs above.");
  }
  console.warn(
    "[config] Continuing the build with default values. Fix these variables " +
      "before the app is started, or it will refuse to boot."
  );
}

// Re-parse against an empty object so the defaults apply, rather than carrying
// the invalid values forward. Only reached during a build.
const env = parsed.success ? parsed.data : schema.parse({ NODE_ENV: "production" });

/**
 * Anyone who knows the signing secret can mint a Super Admin session, so a
 * running production server refuses the published development default and
 * anything short enough to guess. Checked at runtime only — a build has no
 * business needing the secret.
 */
if (env.NODE_ENV === "production" && !isBuildPhase) {
  if (env.JWT_SECRET === DEV_JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 characters in production.");
  }
}

/** `7d`, `12h`, `30m` or seconds → seconds, for the session cookie's lifetime. */
function durationSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd]?)$/i.exec(value.trim());
  if (!match) return 7 * 24 * 3600;
  const unit = { s: 1, m: 60, h: 3600, d: 86400, "": 1 }[match[2].toLowerCase() as "s" | "m" | "h" | "d" | ""];
  return Number(match[1]) * unit;
}

/** The model used when AI_MODEL is unset — one that exists on each provider. */
const DEFAULT_MODEL: Record<typeof env.AI_PROVIDER, string> = {
  claude: "claude-opus-4-8",
  openai: "gpt-4o-mini",
  ollama: "llama3.1",
  gemini: "gemini-3.1-flash-lite",
};

const model = env.AI_MODEL || DEFAULT_MODEL[env.AI_PROVIDER];

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === "production",
  appName: env.APP_NAME,
  appUrl: env.APP_URL,

  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    maxAgeSeconds: durationSeconds(env.JWT_EXPIRES_IN),
  },
  bcryptRounds: env.BCRYPT_ROUNDS,

  ai: {
    provider: env.AI_PROVIDER,
    model,
    extractionModel: env.AI_EXTRACTION_MODEL || model,
    maxTokens: env.AI_MAX_TOKENS,
    thinking: env.AI_THINKING,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicBaseUrl: env.ANTHROPIC_BASE_URL?.replace(/\/+$/, "") || undefined,
    anthropicWorkspaceId: env.ANTHROPIC_WORKSPACE_ID,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiBaseUrl: env.OPENAI_BASE_URL,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiThinking: env.GEMINI_THINKING,
  },

  mail: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM,
    enabled: Boolean(env.SMTP_HOST && env.SMTP_USER),
  },

  sms: {
    apiKey: env.SMS_API_KEY,
    senderId: env.SMS_SENDER_ID,
    enabled: Boolean(env.SMS_API_KEY),
  },

  whatsapp: {
    phoneId: env.WHATSAPP_PHONE_ID,
    token: env.WHATSAPP_TOKEN,
    verifyToken: env.WHATSAPP_VERIFY_TOKEN,
    appSecret: env.WHATSAPP_APP_SECRET,
    wabaId: env.WHATSAPP_WABA_ID,
    apiVersion: env.WHATSAPP_API_VERSION,
    autoReply: env.WHATSAPP_AUTO_REPLY,
    /** Outbound sending is possible (templates, broadcasts, bot replies). */
    enabled: Boolean(env.WHATSAPP_PHONE_ID && env.WHATSAPP_TOKEN),
    /**
     * Templates can be listed, created and synced. Separate from `enabled`
     * because the two need different things: sending needs the phone number
     * ID, managing templates needs the business account ID and a token
     * carrying `whatsapp_business_management`.
     */
    templatesEnabled: Boolean(env.WHATSAPP_WABA_ID && env.WHATSAPP_TOKEN),
    /** Meta can reach the webhook: verification and signature checks are set. */
    webhookReady: Boolean(env.WHATSAPP_VERIFY_TOKEN && env.WHATSAPP_APP_SECRET),
    /**
     * The callback URL registered with Meta. `/webhook` is rewritten to
     * `/api/whatsapp/webhook` in next.config.mjs — this is the short public
     * form, and the single value the admin console tells you to paste.
     */
    webhookUrl: `${env.APP_URL.replace(/\/$/, "")}/webhook`,
  },

  maps: {
    apiKey: env.GOOGLE_MAPS_API_KEY,
  },

  routing: {
    salesEmail: env.SALES_NOTIFY_EMAIL,
  },

  cron: {
    secret: env.CRON_SECRET,
  },
} as const;

export type AppConfig = typeof config;
