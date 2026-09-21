import type { BotConfig } from "./schema";
import type { TrafficSourceKey } from "./types";

/**
 * =============================================================================
 *  Where a WhatsApp conversation came from
 * =============================================================================
 *
 *  Decided once, from the first message of a thread:
 *
 *   1. **Click-to-WhatsApp ads.** Meta attaches a `referral` object to the first
 *      message sent from an ad or a boosted post — the ad id, headline and URL.
 *   2. **`ref:` codes.** Links and QR codes the business publishes prefill the
 *      message with a code, e.g. `https://wa.me/<number>?text=Hi%20ref:qr:expo24`
 *      → source QR code, campaign "expo24". The code is stripped before the
 *      assistant reads the message. Codes are managed in the studio.
 *   3. **Broadcast replies.** A contact who writes within a few days of
 *      receiving a broadcast is attributed to that broadcast.
 *   4. Otherwise: Direct WhatsApp.
 * =============================================================================
 */

export interface MetaReferral {
  source_url?: string;
  source_id?: string;
  source_type?: string;
  headline?: string;
  body?: string;
  media_type?: string;
  ctwa_clid?: string;
}

export interface Attribution {
  source: TrafficSourceKey;
  campaign?: string;
  adId?: string;
  referral?: MetaReferral;
}

const REF_CODE = /(?:^|\s)\[?ref[:=]\s*([a-z0-9_-]{1,32})(?:[:/]([a-z0-9_.-]{1,64}))?\]?/i;

/** The message with any `ref:` code removed — what the assistant should read. */
export function stripRefCode(text: string): string {
  return text.replace(REF_CODE, " ").replace(/\s{2,}/g, " ").trim();
}

export function attribute(
  input: {
    text: string;
    referral?: MetaReferral;
    recentBroadcast?: { title: string; reference: string };
  },
  config: BotConfig["sources"]
): Attribution {
  const { referral } = input;
  if (referral && (referral.source_id || referral.source_url)) {
    const url = referral.source_url?.toLowerCase() ?? "";
    const source: TrafficSourceKey =
      referral.source_type === "ad"
        ? "META_ADS"
        : url.includes("instagram")
          ? "INSTAGRAM"
          : "FACEBOOK";
    return {
      source,
      adId: referral.source_id,
      campaign: referral.headline?.slice(0, 120),
      referral,
    };
  }

  const match = input.text.match(REF_CODE);
  if (match) {
    const code = match[1].toLowerCase();
    const entry = config.codes.find((candidate) => candidate.code.toLowerCase() === code);
    return {
      source: entry?.source ?? "CAMPAIGN",
      campaign: match[2] ?? entry?.campaign ?? (entry ? undefined : code),
    };
  }

  if (input.recentBroadcast) {
    return { source: "BROADCAST", campaign: input.recentBroadcast.title.slice(0, 120) };
  }

  return { source: "DIRECT_WHATSAPP" };
}
