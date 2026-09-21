import { Prisma } from "@prisma/client";
import type { TemplateCategory, TemplateStatus } from "@prisma/client";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";

/**
 * =============================================================================
 *  WhatsApp message templates — Meta's side
 * =============================================================================
 *
 *  Templates live in the WhatsApp Business Account, not in this database and
 *  not on the phone number. Meta reviews every one of them, and a template that
 *  has not been approved cannot be sent to anyone outside the 24-hour customer
 *  service window — which is every recipient of a broadcast, by definition.
 *
 *  So this module does three things and nothing else:
 *
 *    • `fetchTemplates`  — read the account's templates from the Graph API,
 *    • `syncTemplates`   — mirror them into `whatsapp_templates`,
 *    • `submitTemplate`  — create one in Meta and leave it awaiting review.
 *
 *  The local table is a cache. Meta is the authority on whether a template
 *  exists and whether it may be used; `syncedAt` records when the two last
 *  agreed. Nothing here throws — every function returns a result object,
 *  because a Graph outage should put a notice in the console rather than a
 *  500 page.
 *
 *  Reference:
 *  https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates
 * =============================================================================
 */

const GRAPH_HOST = "https://graph.facebook.com";

/** Meta rejects a template name that is not lowercase alphanumeric + `_`. */
const NAME_PATTERN = /^[a-z0-9_]{1,512}$/;

// ------------------------------------------------------------ Wire types ----

/** One component of a template, in Meta's own shape. */
export interface MetaComponent {
  type?: string;
  format?: string;
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    header_handle?: string[];
  };
  buttons?: Array<{
    type?: string;
    text?: string;
    url?: string;
    phone_number?: string;
  }>;
}

export interface MetaTemplate {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  quality_score?: { score?: string };
  rejected_reason?: string;
  components?: MetaComponent[];
}

export interface TemplateApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Meta's own error code, worth quoting in a support thread. */
  code?: number;
}

// ------------------------------------------------------------- Transport ----

function wabaEndpoint(path: string): string {
  return `${GRAPH_HOST}/${config.whatsapp.apiVersion}/${config.whatsapp.wabaId}/${path}`;
}

/**
 * A Graph call with the same failure vocabulary as the message client.
 *
 * `fetch failed` is translated for the same reason it is there: on shared
 * hosting it nearly always means blocked outbound HTTPS, and reading it as a
 * bad token sends people down the wrong path for an afternoon.
 */
async function graph<T>(url: string, init?: RequestInit): Promise<TemplateApiResult<T>> {
  if (!config.whatsapp.templatesEnabled) {
    return {
      ok: false,
      error: "Template management is not configured (WHATSAPP_WABA_ID / WHATSAPP_TOKEN).",
    };
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json().catch(() => null)) as
      | (T & { error?: { message?: string; code?: number; error_user_msg?: string } })
      | null;

    if (!response.ok) {
      const code = body?.error?.code;
      return {
        ok: false,
        code,
        error:
          code === 190
            ? "The access token is invalid or expired. Re-paste a permanent System User token."
            : code === 200 || code === 10
              ? "The token is missing the `whatsapp_business_management` permission, which is required to read or create templates."
              : code === 100
                ? "Meta rejected the request. Check WHATSAPP_WABA_ID — the template endpoints want the Business Account ID, not the phone number ID."
                : body?.error?.error_user_msg ??
                  body?.error?.message ??
                  `Meta returned HTTP ${response.status}.`,
      };
    }

    return { ok: true, data: body as T };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error:
        raw === "fetch failed" || /ENOTFOUND|ECONNREFUSED|EAI_AGAIN/.test(raw)
          ? `Could not reach graph.facebook.com (${raw}). The server may be blocking outbound HTTPS.`
          : /timed? ?out|aborted/i.test(raw)
            ? "Timed out reaching graph.facebook.com after 20s."
            : raw,
    };
  }
}

// ------------------------------------------------------------------ Read ----

/**
 * Every template in the business account.
 *
 * Meta pages this endpoint, and an account that has been running for a while
 * has more templates than one page holds — so the cursor is followed to the
 * end rather than taking the first 100 and quietly losing the rest. The page
 * budget is a guard against a paging loop, not an expected limit.
 */
export async function fetchTemplates(): Promise<TemplateApiResult<MetaTemplate[]>> {
  const collected: MetaTemplate[] = [];
  let url =
    `${wabaEndpoint("message_templates")}?limit=100` +
    "&fields=id,name,language,status,category,quality_score,rejected_reason,components";

  for (let page = 0; page < 25; page++) {
    const result = await graph<{ data?: MetaTemplate[]; paging?: { next?: string } }>(url);

    if (!result.ok) return { ok: false, error: result.error, code: result.code };

    collected.push(...(result.data?.data ?? []));

    const next = result.data?.paging?.next;
    if (!next) return { ok: true, data: collected };
    url = next;
  }

  // Fell out of the loop: return what was read rather than nothing, but say so.
  return {
    ok: true,
    data: collected,
    error: "Stopped after 25 pages of templates; some may be missing.",
  };
}

// --------------------------------------------------------------- Mapping ----

/** Meta's status strings → our enum. Anything unrecognised is treated as paused. */
function toStatus(value: string | undefined): TemplateStatus {
  switch ((value ?? "").toUpperCase()) {
    case "APPROVED":
      return "APPROVED";
    case "PENDING":
    case "IN_APPEAL":
    case "PENDING_DELETION":
      return "PENDING";
    case "REJECTED":
      return "REJECTED";
    case "DISABLED":
    case "DELETED":
      return "DISABLED";
    default:
      return "PAUSED";
  }
}

function toCategory(value: string | undefined): TemplateCategory {
  switch ((value ?? "").toUpperCase()) {
    case "MARKETING":
      return "MARKETING";
    case "AUTHENTICATION":
      return "AUTHENTICATION";
    default:
      return "UTILITY";
  }
}

/** Meta's language codes → the four languages this product speaks. */
function toLanguage(code: string | undefined): "EN" | "UR" | "PA" {
  const lower = (code ?? "").toLowerCase();
  if (lower.startsWith("ur")) return "UR";
  if (lower.startsWith("pa")) return "PA";
  return "EN";
}

/**
 * How many `{{n}}` placeholders a piece of template text carries.
 *
 * Meta numbers them from 1 and requires them contiguous, so the highest index
 * is the count — and reading it that way tolerates `{{2}}` appearing before
 * `{{1}}` in the sentence, which is legal and common in Urdu word order.
 */
export function countPlaceholders(text: string): number {
  const found = text.match(/\{\{\s*(\d+)\s*\}\}/g);
  if (!found) return 0;
  return Math.max(...found.map((token) => Number(token.replace(/\D/g, "")) || 0));
}

export interface FlatTemplate {
  body: string;
  headerText: string | null;
  headerFormat: string | null;
  footerText: string | null;
  buttons: MetaComponent["buttons"] | null;
  variableCount: number;
}

/** Pull the fields the console renders out of Meta's component array. */
export function flattenComponents(components: MetaComponent[] | undefined): FlatTemplate {
  const list = components ?? [];
  const header = list.find((c) => (c.type ?? "").toUpperCase() === "HEADER");
  const body = list.find((c) => (c.type ?? "").toUpperCase() === "BODY");
  const footer = list.find((c) => (c.type ?? "").toUpperCase() === "FOOTER");
  const buttons = list.find((c) => (c.type ?? "").toUpperCase() === "BUTTONS");

  const bodyText = body?.text ?? "";

  return {
    body: bodyText,
    headerText: header?.text ?? null,
    headerFormat: header ? (header.format ?? "TEXT").toUpperCase() : null,
    footerText: footer?.text ?? null,
    buttons: buttons?.buttons ?? null,
    variableCount: countPlaceholders(bodyText),
  };
}

/**
 * Variable labels for a template.
 *
 * Meta stores no names for parameters — only positions and an example value.
 * A row that already has hand-written labels keeps them, because "serviceName"
 * in the composer is worth more than "Variable 2"; anything beyond what the
 * local row names falls back to a positional label.
 */
function mergeVariableNames(existing: string[], count: number): string[] {
  return Array.from({ length: count }, (_, index) => existing[index] ?? `Variable ${index + 1}`);
}

/**
 * A Meta component array on its way into a JSON column.
 *
 * `Prisma.JsonNull` is how a nullable JSON column is set to SQL NULL — passing
 * a bare `null` sets it to the JSON value `null` instead, which is a different
 * thing and reads back as a value rather than an absence.
 */
function asJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

/** `in_fee_reminder` → `In fee reminder`, a readable default until someone edits it. */
function humanTemplateName(metaName: string): string {
  const words = metaName.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ------------------------------------------------------------------ Sync ----

export interface SyncOutcome {
  ok: boolean;
  created: number;
  updated: number;
  /** Local rows Meta has never heard of — drafts, or templates deleted there. */
  localOnly: number;
  error?: string;
}

/**
 * Mirror the account's templates into the local table.
 *
 * Matching is on `(metaName, languageCode)` rather than on Meta's id, because a
 * template deleted and recreated under the same name gets a new id, and the
 * console should treat that as the same template coming back rather than as a
 * duplicate row appearing next to the old one.
 *
 * Local-only rows are left alone and never deleted: a draft that has not been
 * submitted yet is not the same thing as a template that has gone missing, and
 * silently removing either would lose work.
 */
export async function syncTemplates(): Promise<SyncOutcome> {
  const fetched = await fetchTemplates();
  if (!fetched.ok || !fetched.data) {
    return { ok: false, created: 0, updated: 0, localOnly: 0, error: fetched.error };
  }

  const now = new Date();
  let created = 0;
  let updated = 0;

  for (const template of fetched.data) {
    const metaName = template.name?.trim();
    const languageCode = template.language?.trim();
    if (!metaName || !languageCode) continue;

    const flat = flattenComponents(template.components);
    // A template with no BODY cannot be used in a broadcast; skip it rather
    // than storing a row the composer would have to special-case forever.
    if (!flat.body) continue;

    const existing = await prisma.whatsappTemplate.findUnique({
      where: { metaName_languageCode: { metaName, languageCode } },
    });

    const data = {
      metaId: template.id ?? null,
      metaName,
      languageCode,
      language: toLanguage(languageCode),
      category: toCategory(template.category),
      status: toStatus(template.status),
      body: flat.body,
      headerText: flat.headerText,
      headerFormat: flat.headerFormat,
      footerText: flat.footerText,
      buttons: asJson(flat.buttons),
      components: asJson(template.components),
      variables: mergeVariableNames(existing?.variables ?? [], flat.variableCount),
      rejectedReason: template.rejected_reason ?? null,
      qualityScore: template.quality_score?.score ?? null,
      syncedAt: now,
    };

    if (existing) {
      // A row another tenant owns is left alone; an unowned one now mirrors
      // this account's template, so it becomes this tenant's.
      if (existing.department && existing.department !== DEPARTMENT) continue;
      await prisma.whatsappTemplate.update({ where: { id: existing.id }, data: { ...data, department: DEPARTMENT } });
      updated++;
    } else {
      await prisma.whatsappTemplate.create({
        data: {
          ...data,
          // Meta's name is unique per language, so it makes a stable local key
          // for a template nobody has given one to.
          key: `${metaName}:${languageCode}`,
          name: humanTemplateName(metaName),
          // The account in WHATSAPP_BUSINESS_ACCOUNT_ID is Pros-Link's, so
          // every template it holds is too.
          department: DEPARTMENT,
        },
      });
      created++;
    }
  }

  const localOnly = await prisma.whatsappTemplate.count({ where: { metaId: null, department: DEPARTMENT } });

  return { ok: true, created, updated, localOnly, error: fetched.error };
}

// ---------------------------------------------------------------- Create ----

export interface TemplateDraft {
  metaName: string;
  languageCode: string;
  category: TemplateCategory;
  body: string;
  headerText?: string;
  footerText?: string;
  /** One example value per `{{n}}`, in order. Meta requires these to review. */
  examples?: string[];
}

/**
 * Create a template in Meta and leave it awaiting review.
 *
 * Meta will not review a template whose placeholders carry no example values,
 * and the rejection for a missing example reads as a generic "invalid
 * parameter" — so the examples are filled in here rather than relying on the
 * person composing to know that.
 */
export async function submitTemplate(
  draft: TemplateDraft
): Promise<TemplateApiResult<{ id?: string; status?: string; category?: string }>> {
  if (!NAME_PATTERN.test(draft.metaName)) {
    return {
      ok: false,
      error: "The template name may only contain lowercase letters, numbers and underscores.",
    };
  }

  const placeholders = countPlaceholders(draft.body);
  const examples = Array.from(
    { length: placeholders },
    (_, index) => draft.examples?.[index]?.trim() || `Example ${index + 1}`
  );

  const components: MetaComponent[] = [];

  if (draft.headerText?.trim()) {
    const headerText = draft.headerText.trim();
    const headerPlaceholders = countPlaceholders(headerText);
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: headerText,
      ...(headerPlaceholders
        ? {
            example: {
              header_text: Array.from(
                { length: headerPlaceholders },
                (_, index) => `Example ${index + 1}`
              ),
            },
          }
        : {}),
    });
  }

  components.push({
    type: "BODY",
    text: draft.body,
    // `body_text` is an array of parameter *sets*, not an array of parameters —
    // one set per example message. One set is all a review needs.
    ...(examples.length ? { example: { body_text: [examples] } } : {}),
  });

  if (draft.footerText?.trim()) {
    components.push({ type: "FOOTER", text: draft.footerText.trim() });
  }

  return graph(wabaEndpoint("message_templates"), {
    method: "POST",
    body: JSON.stringify({
      name: draft.metaName,
      language: draft.languageCode,
      category: draft.category,
      components,
    }),
  });
}

/**
 * Delete a template from Meta, by name.
 *
 * Meta deletes every language variant sharing the name — that is the API's
 * behaviour, not a simplification here, and it is why the console asks for
 * confirmation before calling this.
 */
export async function deleteTemplate(metaName: string): Promise<TemplateApiResult<unknown>> {
  return graph(`${wabaEndpoint("message_templates")}?name=${encodeURIComponent(metaName)}`, {
    method: "DELETE",
  });
}

// --------------------------------------------------------------- Preview ----

/** Substitute `{{1}}`, `{{2}}`… so a draft reads the way the recipient sees it. */
export function renderTemplate(body: string, values: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index: string) => {
    const value = values[Number(index) - 1];
    return value?.trim() ? value : match;
  });
}
