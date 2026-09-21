/**
 * =============================================================================
 *  WhatsApp Cloud API — wire types
 * =============================================================================
 *
 *  Hand-written types for the subset of Meta's webhook payload this product
 *  consumes. Everything here describes data that arrives from the network, so
 *  every field is optional: Meta ships new message types without warning, and a
 *  missing property must degrade to "unsupported message" rather than a crash.
 *
 *  Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 * =============================================================================
 */

export interface WhatsAppWebhookBody {
  object?: string;
  entry?: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id?: string;
  changes?: WhatsAppChange[];
}

export interface WhatsAppChange {
  field?: string;
  value?: WhatsAppChangeValue;
}

export interface WhatsAppChangeValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: WhatsAppContactProfile[];
  messages?: WhatsAppInboundMessage[];
  statuses?: WhatsAppStatus[];
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

export interface WhatsAppContactProfile {
  wa_id?: string;
  profile?: { name?: string };
}

/** Delivery receipts (sent / delivered / read / failed) for outbound messages. */
export interface WhatsAppStatus {
  id?: string;
  status?: "sent" | "delivered" | "read" | "failed";
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

export interface WhatsAppInboundMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  image?: WhatsAppMedia;
  document?: WhatsAppMedia & { filename?: string };
  audio?: WhatsAppMedia;
  video?: WhatsAppMedia;
  sticker?: WhatsAppMedia;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: unknown[];
  /** Present when the customer replies to a specific earlier message. */
  context?: { from?: string; id?: string };
  /**
   * Present on the first message sent from a click-to-WhatsApp ad or a boosted
   * post: which ad, its headline and link.
   */
  referral?: {
    source_url?: string;
    source_id?: string;
    source_type?: string;
    headline?: string;
    body?: string;
    media_type?: string;
    ctwa_clid?: string;
  };
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

export interface WhatsAppMedia {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  voice?: boolean;
}

// -------------------------------------------------------- Normalised shape --

/**
 * What the rest of the app works with: one inbound message, already flattened,
 * with the free-text the assistant should read separated from the button id it
 * should act on.
 */
export interface InboundMessage {
  /** Meta's `wamid.…`, used to make webhook retries idempotent. */
  id: string;
  /** Sender's `wa_id` — E.164 digits, no `+`. */
  waId: string;
  /** Profile name from the `contacts` block, when WhatsApp supplied one. */
  profileName?: string;
  /** Business number that received it (a tenant may run several). */
  phoneNumberId?: string;
  timestamp: Date;
  kind: "text" | "reply" | "media" | "location" | "unsupported";
  /** Text the assistant reads. For a button tap this is the button's title. */
  text: string;
  /** Payload of a tapped button or picked list row, when there was one. */
  replyId?: string;
  /** Human label for a media message, used in the transcript. */
  mediaKind?: string;
  /** Meta's media id and MIME type — the file is fetched on demand from the console. */
  mediaId?: string;
  mediaMime?: string;
  /** Click-to-WhatsApp ad attribution, when Meta supplied it. */
  referral?: WhatsAppInboundMessage["referral"];
}

/** Outbound interactive button. WhatsApp allows at most three per message. */
export interface ReplyButton {
  id: string;
  title: string;
}

/** Outbound list row. WhatsApp allows at most ten across all sections. */
export interface ListRow {
  id: string;
  title: string;
  description?: string;
}
