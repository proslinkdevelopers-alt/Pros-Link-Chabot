import type {
  InboundMessage,
  WhatsAppChangeValue,
  WhatsAppInboundMessage,
  WhatsAppStatus,
  WhatsAppWebhookBody,
} from "./types";

/**
 * =============================================================================
 *  Inbound webhook parsing
 * =============================================================================
 *
 *  Meta delivers a deeply nested envelope that may carry several entries, each
 *  with several changes, each with several messages — plus delivery receipts
 *  for messages we sent. This module flattens all of that into a plain list the
 *  handler can loop over, and drops anything it does not understand rather than
 *  throwing: a webhook that 500s on an unrecognised message type gets retried
 *  by Meta forever.
 * =============================================================================
 */

/** Every customer message in a webhook delivery, flattened and normalised. */
export function parseInbound(body: WhatsAppWebhookBody): InboundMessage[] {
  const messages: InboundMessage[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;

      for (const raw of value.messages) {
        const parsed = normalise(raw, value);
        if (parsed) messages.push(parsed);
      }
    }
  }

  return messages;
}

/** Delivery receipts for outbound messages (sent / delivered / read / failed). */
export function parseStatuses(body: WhatsAppWebhookBody): WhatsAppStatus[] {
  const statuses: WhatsAppStatus[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      statuses.push(...(change.value?.statuses ?? []));
    }
  }
  return statuses;
}

function normalise(
  raw: WhatsAppInboundMessage,
  value: WhatsAppChangeValue
): InboundMessage | null {
  const id = raw.id;
  const waId = raw.from;
  if (!id || !waId) return null;

  const profile = value.contacts?.find((c) => c.wa_id === waId);
  const base = {
    id,
    waId,
    profileName: profile?.profile?.name,
    phoneNumberId: value.metadata?.phone_number_id,
    // Meta sends Unix seconds as a string; fall back to now if it is missing.
    timestamp: raw.timestamp
      ? new Date(Number(raw.timestamp) * 1000)
      : new Date(),
    referral: raw.referral,
  };

  switch (raw.type) {
    case "text":
      return { ...base, kind: "text", text: (raw.text?.body ?? "").trim() };

    // A tap on an interactive button or a pick from a list. The title is what
    // the customer saw, so it is what goes in the transcript; the id is the
    // machine-readable payload the state machine acts on.
    case "interactive": {
      const reply = raw.interactive?.button_reply ?? raw.interactive?.list_reply;
      if (!reply?.id) return null;
      return {
        ...base,
        kind: "reply",
        text: reply.title ?? reply.id,
        replyId: reply.id,
      };
    }

    // Legacy template quick-reply button.
    case "button":
      return {
        ...base,
        kind: "reply",
        text: raw.button?.text ?? raw.button?.payload ?? "",
        replyId: raw.button?.payload,
      };

    case "image":
    case "document":
    case "video":
    case "audio":
    case "sticker": {
      const caption =
        raw.image?.caption ?? raw.document?.caption ?? raw.video?.caption ?? "";
      const media = raw.image ?? raw.document ?? raw.video ?? raw.audio ?? raw.sticker;
      return {
        ...base,
        kind: "media",
        // The caption carries the actual question often enough to be worth
        // passing to the model. The file itself is not downloaded here: its id
        // is stored, and staff open it from the console on demand.
        text: caption.trim(),
        mediaKind: raw.type,
        mediaId: media?.id,
        mediaMime: media?.mime_type,
      };
    }

    case "location": {
      const { name, address } = raw.location ?? {};
      return {
        ...base,
        kind: "location",
        text: [name, address].filter(Boolean).join(", "),
      };
    }

    default:
      return { ...base, kind: "unsupported", text: "" };
  }
}
