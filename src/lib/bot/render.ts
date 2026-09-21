/**
 * =============================================================================
 *  Outgoing messages and WhatsApp's interactive limits
 * =============================================================================
 *
 *  The engine speaks in `Outgoing` messages; this module is the one place that
 *  knows WhatsApp's rules for them:
 *
 *    • reply buttons: at most 3, title ≤ 20 characters, body ≤ 1024
 *    • lists: at most 10 rows, row title ≤ 24, description ≤ 72, body ≤ 1024
 *
 *  `offer()` picks buttons when the choices fit and a list otherwise, pages a
 *  list longer than ten rows behind a "More options" row, and moves a long
 *  body into its own text message so it is never cut off.
 * =============================================================================
 */

export interface Choice {
  id: string;
  title: string;
  description?: string;
  /** A thumbnail for the web assistant. WhatsApp list rows cannot show one. */
  imageUrl?: string;
}

export type Outgoing =
  | { type: "text"; body: string }
  | { type: "buttons"; body: string; buttons: Choice[]; footer?: string; header?: { imageUrl: string } }
  | { type: "list"; body: string; button: string; rows: Choice[]; footer?: string };

export const LIMITS = {
  buttons: 3,
  buttonTitle: 20,
  rows: 10,
  rowTitle: 24,
  rowDescription: 72,
  interactiveBody: 1024,
  footer: 60,
  listButton: 20,
} as const;

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/**
 * Shorten to `max` UTF-16 units without splitting an emoji or a combined
 * character — a half emoji renders as a broken glyph in the customer's chat.
 */
export function clampText(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  if (!segmenter) return `${clean.slice(0, max - 1)}…`;

  let out = "";
  for (const { segment } of segmenter.segment(clean)) {
    if (out.length + segment.length > max - 1) break;
    out += segment;
  }
  return `${out.trimEnd()}…`;
}

export interface OfferOptions {
  /** Label on the button that opens a list. */
  listButton: string;
  /** "More options" row title. */
  moreTitle: string;
  /** Reply id for the next page of a paged list. */
  pageId?: (page: number) => string;
  page?: number;
  footer?: string;
  /** Always use a list, even for three or fewer choices. */
  forceList?: boolean;
  /** An image shown above a button message — a product photo. */
  header?: { imageUrl: string };
}

/** A body with choices underneath, in as few messages as WhatsApp allows. */
export function offer(body: string, choices: Choice[], options: OfferOptions): Outgoing[] {
  const text = body.trim();
  if (!choices.length) return text ? [{ type: "text", body: text }] : [];

  // A body too long for an interactive message goes first on its own; the
  // choices follow under a pointer so they stay visually attached.
  const overflow = text.length > LIMITS.interactiveBody;
  const lead: Outgoing[] = overflow ? [{ type: "text", body: text }] : [];
  const interactiveBody = overflow ? "👇" : text || "👇";
  const footer = options.footer ? clampText(options.footer, LIMITS.footer) : undefined;

  const fitsButtons =
    !options.forceList &&
    choices.length <= LIMITS.buttons &&
    choices.every((choice) => choice.title.length <= LIMITS.buttonTitle);

  if (fitsButtons) {
    return [
      ...lead,
      {
        type: "buttons",
        body: interactiveBody,
        buttons: choices.map((choice) => ({ id: choice.id, title: clampText(choice.title, LIMITS.buttonTitle) })),
        footer,
        ...(options.header ? { header: options.header } : {}),
      },
    ];
  }

  return [
    ...lead,
    {
      type: "list",
      body: interactiveBody,
      button: clampText(options.listButton, LIMITS.listButton),
      rows: page(choices, options).map((choice) => ({
        id: choice.id,
        title: clampText(choice.title, LIMITS.rowTitle),
        ...(choice.description ? { description: clampText(choice.description, LIMITS.rowDescription) } : {}),
        ...(choice.imageUrl ? { imageUrl: choice.imageUrl } : {}),
      })),
      footer,
    },
  ];
}

/**
 * The rows for one page. Every page but the last shows nine choices and a
 * "More options" row; the last shows whatever remains.
 */
export function page(choices: Choice[], options: Pick<OfferOptions, "page" | "pageId" | "moreTitle">): Choice[] {
  if (choices.length <= LIMITS.rows || !options.pageId) return choices.slice(0, LIMITS.rows);

  const perPage = LIMITS.rows - 1;
  const pages = Math.ceil(choices.length / perPage);
  const current = Math.min(Math.max(options.page ?? 0, 0), pages - 1);
  const slice = choices.slice(current * perPage, (current + 1) * perPage);

  if (current < pages - 1) {
    slice.push({ id: options.pageId(current + 1), title: options.moreTitle });
  }
  return slice;
}

/** Plain-text rendering, for the transcript and the console simulator. */
export function transcriptOf(message: Outgoing): string {
  if (message.type === "text") return message.body;
  const choices = message.type === "buttons" ? message.buttons : message.rows;
  const body = message.body === "👇" ? "" : message.body;
  return [body, choices.map((choice) => `[${choice.title}]`).join(" ")].filter(Boolean).join("\n\n");
}
