import crypto from "node:crypto";
import { config } from "@/lib/config";
import { clampText } from "@/lib/bot/render";
import type { ListRow, ReplyButton } from "./types";

/**
 * =============================================================================
 *  WhatsApp Cloud API client
 * =============================================================================
 *
 *  Thin wrapper over the Graph API `/messages` endpoint plus the webhook
 *  signature check. Deliberately dependency-free (`fetch` + `node:crypto`) so
 *  the WhatsApp channel adds nothing to the deployment footprint.
 *
 *  Every send is best-effort and returns a result object instead of throwing:
 *  a failed reply must never take down the webhook, because Meta reads a
 *  non-200 as "redeliver this message" and the customer would be answered
 *  twice once the outage clears.
 * =============================================================================
 */

const GRAPH_HOST = "https://graph.facebook.com";

/** WhatsApp hard-caps a text body at 4096 characters. */
const MAX_BODY = 4096;

export interface SendResult {
  ok: boolean;
  /** `wamid.…` of the message Meta accepted. */
  messageId?: string;
  error?: string;
}

function endpoint(path: string): string {
  return `${GRAPH_HOST}/${config.whatsapp.apiVersion}/${config.whatsapp.phoneId}/${path}`;
}

async function post(payload: Record<string, unknown>): Promise<SendResult> {
  if (!config.whatsapp.enabled) {
    return { ok: false, error: "WhatsApp is not configured (WHATSAPP_PHONE_ID / WHATSAPP_TOKEN)." };
  }

  try {
    const response = await fetch(endpoint("messages"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      // A hung Graph call must not hold the webhook open indefinitely. 15s is
      // generous for a shared host with slow outbound networking, and still
      // well inside the window Meta allows before it retries the delivery.
      signal: AbortSignal.timeout(15_000),
    });

    const body = (await response.json().catch(() => null)) as
      | { messages?: Array<{ id?: string }>; error?: { message?: string } }
      | null;

    if (!response.ok) {
      const message = body?.error?.message ?? `HTTP ${response.status}`;
      console.error("[whatsapp] send failed:", message);
      return { ok: false, error: message };
    }

    return { ok: true, messageId: body?.messages?.[0]?.id };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    // `fetch failed` on its own sends people hunting for a bad token. On shared
    // hosting it almost always means the box cannot open an outbound
    // connection to graph.facebook.com, which is a hosting question, not a
    // credentials one — so say that here rather than in a support thread.
    const message =
      raw === "fetch failed" || /ENOTFOUND|ECONNREFUSED|EAI_AGAIN/.test(raw)
        ? `Could not reach graph.facebook.com (${raw}). The server may be blocking outbound HTTPS.`
        : /timed? ?out|aborted/i.test(raw)
          ? `Timed out reaching graph.facebook.com after 15s (${raw}).`
          : raw;
    console.error("[whatsapp] send error:", message);
    return { ok: false, error: message };
  }
}

/**
 * Split a reply that exceeds WhatsApp's 4096-character limit.
 *
 * Prefers paragraph breaks, then sentence ends, then a hard cut — a chopped
 * word looks broken in a chat thread in a way it never does in a web bubble.
 */
export function splitForWhatsApp(text: string, limit = MAX_BODY): string[] {
  const clean = text.trim();
  if (clean.length <= limit) return clean ? [clean] : [];

  const parts: string[] = [];
  let rest = clean;

  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const breakAt =
      lastIndexBefore(window, "\n\n") ??
      lastIndexBefore(window, "\n") ??
      lastIndexBefore(window, ". ") ??
      lastIndexBefore(window, " ") ??
      limit;
    parts.push(rest.slice(0, breakAt).trim());
    rest = rest.slice(breakAt).trim();
  }

  if (rest) parts.push(rest);
  return parts;
}

function lastIndexBefore(window: string, needle: string): number | null {
  const index = window.lastIndexOf(needle);
  // Only accept a break in the last third, or long replies fragment into
  // needlessly short bubbles.
  return index > window.length * 0.6 ? index + needle.length : null;
}

/**
 * Convert the assistant's markdown to WhatsApp's formatting.
 *
 * WhatsApp understands `*bold*`, `_italic_` and ```` ```code``` ```` only.
 * Left alone, `**text**` and `### Heading` render as literal asterisks and
 * hashes in the customer's thread.
 */
export function toWhatsAppMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s*(.+)$/gm, "*$1*") // headings → bold line
    .replace(/\*\*(.+?)\*\*/gs, "*$1*") // bold
    .replace(/(^|[\s(])__(.+?)__(?=[\s).,!?]|$)/gs, "$1_$2_") // underscore bold
    .replace(/^\s*[-*]\s+/gm, "• ") // bullets
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2") // links
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Send a plain text reply, splitting it across bubbles when it is too long. */
export async function sendText(to: string, text: string): Promise<SendResult> {
  const chunks = splitForWhatsApp(toWhatsAppMarkdown(text));
  if (!chunks.length) return { ok: true };

  let last: SendResult = { ok: true };
  for (const chunk of chunks) {
    last = await post({
      to,
      type: "text",
      // Meta renders URLs in the body as previews; we don't want a preview card
      // on top of every answer that happens to mention the website.
      text: { preview_url: false, body: chunk },
    });
    if (!last.ok) break;
  }
  return last;
}

/**
 * Send up to three tappable reply buttons.
 *
 * Buttons are how a WhatsApp thread gets the equivalent of the web widget's
 * menu and quick replies — typing "1" is error-prone in four
 * languages, tapping is not.
 */
export async function sendButtons(
  to: string,
  body: string,
  buttons: ReplyButton[],
  footer?: string,
  /** A public https image shown above the message — a product photo. */
  headerImage?: string
): Promise<SendResult> {
  const usable = buttons.slice(0, 3);
  if (!usable.length) return sendText(to, body);

  return post({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      ...(headerImage ? { header: { type: "image", image: { link: headerImage } } } : {}),
      body: { text: clamp(toWhatsAppMarkdown(body), 1024) },
      ...(footer ? { footer: { text: clamp(footer, 60) } } : {}),
      action: {
        buttons: usable.map((button) => ({
          type: "reply",
          reply: { id: clamp(button.id, 256), title: clamp(button.title, 20) },
        })),
      },
    },
  });
}

/** Send a tappable list — used where there are more options than three. */
export async function sendList(
  to: string,
  body: string,
  buttonLabel: string,
  rows: ListRow[],
  header?: string,
  footer?: string
): Promise<SendResult> {
  const usable = rows.slice(0, 10);
  if (!usable.length) return sendText(to, body);

  return post({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      ...(header ? { header: { type: "text", text: clamp(header, 60) } } : {}),
      body: { text: clamp(toWhatsAppMarkdown(body), 1024) },
      ...(footer ? { footer: { text: clamp(footer, 60) } } : {}),
      action: {
        button: clamp(buttonLabel, 20),
        sections: [
          {
            title: "Options",
            rows: usable.map((row) => ({
              id: clamp(row.id, 200),
              title: clamp(row.title, 24),
              ...(row.description ? { description: clamp(row.description, 72) } : {}),
            })),
          },
        ],
      },
    },
  });
}

/** The picture, clip or file at the top of a template with a media header. */
export interface TemplateHeaderMedia {
  format: "IMAGE" | "VIDEO" | "DOCUMENT";
  /** Public URL Meta can fetch, or a media id already uploaded to the account. */
  link: string;
  /** Shown as the file name on a document header. */
  filename?: string;
}

export interface TemplateHeader {
  /** Values for a text header's `{{1}}`, `{{2}}`… */
  text?: string[];
  media?: TemplateHeaderMedia;
}

/**
 * Send a pre-approved template.
 *
 * Required to open a conversation outside the 24-hour customer service window
 * — the broadcast and follow-up features send through this.
 *
 * `variables` fills the BODY's `{{1}}`, `{{2}}`… in order. Meta only ever sees
 * positions: the names in the console are a local convenience and never go on
 * the wire.
 *
 * A template whose placeholders are sent unfilled is rejected with a `#132000`
 * parameter-count error, so the caller must supply exactly as many values as
 * the template declares — `validateParameters` in `broadcast.ts` is what
 * guarantees that for a broadcast.
 *
 * The `header` argument is not optional in practice for a template whose
 * header is an image, video or document. Meta does not store the media that
 * was approved — the handle on the template exists only for the review — so it
 * has to be supplied again on every send, and omitting it fails the message
 * rather than sending it without a picture.
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode = "en",
  variables: string[] = [],
  header?: TemplateHeader
): Promise<SendResult> {
  const components: Array<Record<string, unknown>> = [];

  const headerParameters: Array<Record<string, unknown>> = [];

  if (header?.media) {
    const { format, link, filename } = header.media;
    const kind = format.toLowerCase(); // image | video | document
    headerParameters.push({
      type: kind,
      // Meta accepts either `link` (a public URL it fetches) or `id` (media
      // already uploaded). A value that is all digits can only be an id.
      [kind]: {
        ...(/^\d+$/.test(link) ? { id: link } : { link }),
        ...(filename && kind === "document" ? { filename } : {}),
      },
    });
  }

  for (const text of header?.text ?? []) {
    headerParameters.push({ type: "text", text });
  }

  if (headerParameters.length) {
    components.push({ type: "header", parameters: headerParameters });
  }

  if (variables.length) {
    components.push({
      type: "body",
      parameters: variables.map((text) => ({ type: "text", text })),
    });
  }

  return post({
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {}),
    },
  });
}

/**
 * Mark an inbound message as read (blue ticks).
 *
 * Purely a courtesy signal, but a business number that never shows read
 * receipts reads as unattended.
 */
export async function markAsRead(messageId: string): Promise<void> {
  await post({ status: "read", message_id: messageId });
}

// ------------------------------------------------------- Connection check ---

export interface ConnectionCheck {
  ok: boolean;
  /** One line, written for whoever is staring at the admin console. */
  detail: string;
  /** Present on success — proof of which number the credentials actually open. */
  number?: string;
  verifiedName?: string;
  qualityRating?: string;
  /** Present on failure — Meta's own error code, worth quoting in a support thread. */
  code?: number;
}

/**
 * Ask Meta, from this server, whether the configured credentials work.
 *
 * The value is in *where* it runs. A token can be verified from a laptop and
 * still fail in production — because the panel holds a different value, or
 * because the host cannot reach Meta at all. This distinguishes those cases
 * without waiting for a customer to message and then reading the logs.
 *
 * Read-only: it fetches the phone number's own metadata and sends nothing.
 */
export async function checkConnection(): Promise<ConnectionCheck> {
  if (!config.whatsapp.phoneId || !config.whatsapp.token) {
    return {
      ok: false,
      detail: "WHATSAPP_PHONE_ID or WHATSAPP_TOKEN is not set on this server.",
    };
  }

  try {
    const response = await fetch(
      `${GRAPH_HOST}/${config.whatsapp.apiVersion}/${config.whatsapp.phoneId}` +
        `?fields=display_phone_number,verified_name,quality_rating,status`,
      {
        headers: { Authorization: `Bearer ${config.whatsapp.token}` },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      }
    );

    const body = (await response.json().catch(() => null)) as
      | {
          display_phone_number?: string;
          verified_name?: string;
          quality_rating?: string;
          status?: string;
          error?: { message?: string; code?: number };
        }
      | null;

    if (!response.ok) {
      const code = body?.error?.code;
      return {
        ok: false,
        code,
        detail:
          code === 190
            ? "The access token is invalid or expired. Re-paste a permanent System User token."
            : code === 100
              ? "Meta rejected the phone number ID. Check WHATSAPP_PHONE_ID."
              : body?.error?.message ?? `Meta returned HTTP ${response.status}.`,
      };
    }

    return {
      ok: true,
      detail: `Connected as ${body?.verified_name ?? "this business"} · status ${body?.status ?? "unknown"}`,
      number: body?.display_phone_number,
      verifiedName: body?.verified_name,
      qualityRating: body?.quality_rating,
    };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      detail:
        raw === "fetch failed" || /ENOTFOUND|ECONNREFUSED|EAI_AGAIN/.test(raw)
          ? `This server cannot reach graph.facebook.com (${raw}). Outbound HTTPS is being blocked.`
          : /timed? ?out|aborted/i.test(raw)
            ? "Timed out reaching graph.facebook.com after 8s."
            : raw,
    };
  }
}

// ------------------------------------------------------------- Signature ----

/**
 * Verify Meta's `X-Hub-Signature-256` header against the raw request body.
 *
 * The webhook URL is public, so without this anyone could POST a fabricated
 * "customer message" and drive the assistant — or fill the CRM with junk leads.
 * The comparison is timing-safe.
 */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = config.whatsapp.appSecret;
  if (!secret) return false;
  if (!header?.startsWith("sha256=")) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = header.slice("sha256=".length);

  // `timingSafeEqual` throws on a length mismatch, so check that first.
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

// ------------------------------------------------------------------ utils ---

/** Shorten without splitting an emoji — a half emoji renders as a broken glyph. */
function clamp(text: string, max: number): string {
  return clampText(text, max);
}

/** `923001234567` → `+923001234567`, the form the CRM stores. */
export function toDisplayPhone(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  return digits ? `+${digits}` : waId;
}

/** Largest file the console will relay from Meta — WhatsApp's own document limit. */
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

export type MediaDownload = { ok: true; body: ArrayBuffer; mime: string } | { ok: false; status: number; error: string };

/**
 * Fetch a photo or document a customer sent. Meta serves media in two steps:
 * the media id resolves to a short-lived URL, which is fetched with the same
 * access token. The token never reaches the browser.
 */
export async function downloadMedia(mediaId: string): Promise<MediaDownload> {
  if (!config.whatsapp.token) return { ok: false, status: 503, error: "WhatsApp is not configured on this server." };
  if (!/^[\w.-]{1,128}$/.test(mediaId)) return { ok: false, status: 400, error: "Invalid media id." };
  const auth = { Authorization: `Bearer ${config.whatsapp.token}` };
  try {
    const meta = await fetch(`${GRAPH_HOST}/${config.whatsapp.apiVersion}/${encodeURIComponent(mediaId)}`, { headers: auth, signal: AbortSignal.timeout(15_000) });
    const info = (await meta.json().catch(() => null)) as { url?: string; mime_type?: string; file_size?: number; error?: { message?: string } } | null;
    if (!meta.ok || !info?.url) return { ok: false, status: meta.status === 404 ? 404 : 502, error: info?.error?.message ?? "Meta did not return the file — it may have expired." };
    if (info.file_size && info.file_size > MAX_MEDIA_BYTES) return { ok: false, status: 413, error: "The file is too large to open here." };
    const file = await fetch(info.url, { headers: auth, signal: AbortSignal.timeout(30_000) });
    if (!file.ok) return { ok: false, status: 502, error: `Meta refused the download (${file.status}).` };
    return { ok: true, body: await file.arrayBuffer(), mime: info.mime_type ?? file.headers.get("content-type") ?? "application/octet-stream" };
  } catch (error) {
    return { ok: false, status: 504, error: error instanceof Error ? error.message : "Could not reach Meta." };
  }
}
