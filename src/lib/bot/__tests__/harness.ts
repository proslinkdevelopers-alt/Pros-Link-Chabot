import type { CustomerDetails } from "@/lib/ai/customer";
import type { CatalogProduct } from "@/lib/catalog-types";
import type { Language } from "@/lib/i18n";
import { DEFAULT_BOT_CONFIG } from "@/data/bot";
import { DEFAULT_CATEGORIES } from "@/data/catalog";
import {
  runTurn,
  type BotRuntime,
  type CompanyContact,
  type Effect,
  type EffectResult,
  type InboundMedia,
  type InboundTurn,
  type Records,
  type ReplyRequest,
  type TrackResult,
} from "../engine";
import { transcriptOf, type Outgoing } from "../render";
import type { BotConfig } from "../schema";
import { emptyBotState, type BotState } from "../types";

export const NO_CONTACT: CompanyContact = { phone: "", whatsapp: "", email: "", website: "", address: "", hours: "", offices: [] };

/** A made-up product for exercising the catalogue views — not real Pros-Link data. */
export const FIXTURE_PRODUCT: CatalogProduct = {
  id: "prod_fixture",
  slug: "fixture-duplicator",
  name: "Fixture Duplicator",
  sku: "FX-SKU-1",
  model: "FX-1",
  summary: "A fixture used by the tests.",
  description: null,
  images: [],
  features: ["Fixture feature"],
  specifications: [{ label: "Fixture spec", value: "Fixture value" }],
  documents: [],
  availability: "ON_REQUEST",
  category: { slug: "digital-duplicators", name: "Digital Duplicators" },
  brand: null,
  keywords: [],
};

/** The one request the fake tracker knows about. */
export const KNOWN_REQUEST = { reference: "PL-TKT-7F3K2Q9A", phoneTail: "3001234567" };

/**
 * A conversation with the engine and nothing else: no WhatsApp, no database,
 * no model. Replies, extraction and CRM writes are recorded so a test can
 * assert on exactly what the customer saw and what the team would receive.
 */
export class TestConversation {
  details: CustomerDetails = {};
  state: BotState = emptyBotState();
  records: Records = {};
  effects: Effect[] = [];
  sent: Outgoing[] = [];
  replies: ReplyRequest[] = [];
  optedOut = false;
  botPaused = false;
  turns = 0;
  now = new Date("2026-09-14T08:00:00Z"); // Monday 13:00 in Pakistan

  /** What the fake model answers. */
  aiReply: (request: ReplyRequest) => string = () => "Happy to help with that.";
  /** What the fake extractor reads out of the latest message. */
  extractor: (text: string, known: CustomerDetails) => CustomerDetails = () => ({});
  /** CRM writes that fail, as when the database is unavailable. */
  failing = new Set<Effect["type"]>();
  /** Published products per category slug. */
  catalog: Record<string, CatalogProduct[]> = { "digital-duplicators": [FIXTURE_PRODUCT] };

  private lastText = "";
  private leadCreated = false;

  constructor(
    readonly options: {
      channel?: "WEB" | "WHATSAPP";
      phone?: string;
      profileName?: string;
      language?: Language;
      config?: BotConfig;
      company?: CompanyContact;
      categories?: Array<{ slug: string; name: string }>;
    } = {}
  ) {}

  get config(): BotConfig {
    return this.options.config ?? DEFAULT_BOT_CONFIG;
  }

  get channel(): "WEB" | "WHATSAPP" {
    return this.options.channel ?? "WHATSAPP";
  }

  private runtime(outbox: Outgoing[]): BotRuntime {
    return {
      send: async (message) => {
        outbox.push(message);
        this.sent.push(message);
      },
      reply: async (request) => {
        this.replies.push(request);
        return this.aiReply(request);
      },
      extract: async (known) => this.extractor(this.lastText, known),
      translate: async (text, language) => `[${language}] ${text}`,
      summarize: async () => "Customer discussed their requirements.",
      products: async (slug) => this.catalog[slug] ?? [],
      product: async (id) => Object.values(this.catalog).flat().find((product) => product.id === id) ?? null,
      track: async (reference, phone): Promise<TrackResult> =>
        reference === KNOWN_REQUEST.reference && phone.replace(/\D/g, "").endsWith(KNOWN_REQUEST.phoneTail)
          ? { found: true, reference, kind: "Service ticket", status: "Technician Dispatched", updatedAt: this.now }
          : { found: false },
      commit: async (effect) => {
        this.effects.push(effect);
        return this.commit(effect);
      },
    };
  }

  private commit(effect: Effect): EffectResult {
    if (this.failing.has(effect.type)) return {};
    switch (effect.type) {
      case "sync": {
        const d = effect.details;
        const due = effect.force || Boolean(d.name && (d.productCategory || d.interest || d.requirements));
        if (!due && !this.records.lead) return {};
        const created = !this.leadCreated;
        this.leadCreated = true;
        return { leadReference: "PL-LEAD-TEST", leadCreated: created };
      }
      case "quote":
        return { reference: "PL-QTE-TEST" };
      case "ticket":
        return { reference: "PL-TKT-TEST" };
      case "meeting":
        return { reference: "PL-MTG-TEST" };
      case "handover":
        return { reference: effect.reference ?? "PL-TKT-HAND" };
      case "optOut":
        this.optedOut = true;
        return {};
      case "optIn":
        this.optedOut = false;
        return {};
      default:
        return {};
    }
  }

  private async turn(input: InboundTurn): Promise<Outgoing[]> {
    const outbox: Outgoing[] = [];
    this.lastText = input.text;
    const whatsapp = this.channel === "WHATSAPP";
    const result = await runTurn(
      input,
      {
        config: this.config,
        channel: this.channel,
        company: this.options.company ?? NO_CONTACT,
        categories: this.options.categories ?? DEFAULT_CATEGORIES.map(({ slug, name }) => ({ slug, name })),
        language: this.options.language ?? "en",
        phone: whatsapp ? (this.options.phone ?? "+923001234567") : "",
        profileName: whatsapp ? this.options.profileName : undefined,
        isNewConversation: this.turns === 0,
        optedOut: this.optedOut,
        botPaused: this.botPaused,
        details: this.details,
        state: this.state,
        records: this.records,
        now: this.now,
      },
      this.runtime(outbox)
    );
    this.turns += 1;
    this.details = result.details;
    this.state = result.state;
    this.records = result.records;
    return outbox;
  }

  send(text: string): Promise<Outgoing[]> {
    return this.turn({ kind: "text", text });
  }

  tap(replyId: string, title = replyId): Promise<Outgoing[]> {
    return this.turn({ kind: "reply", text: title, replyId });
  }

  upload(media: InboundMedia = { id: "media-1", type: "image", mime: "image/jpeg" }, caption = ""): Promise<Outgoing[]> {
    return this.turn({ kind: "media", text: caption, media });
  }

  effectsOf<T extends Effect["type"]>(type: T): Array<Extract<Effect, { type: T }>> {
    return this.effects.filter((effect): effect is Extract<Effect, { type: T }> => effect.type === type);
  }

  events(): string[] {
    return this.effectsOf("event").map((effect) => effect.event);
  }
}

/** Every button and list-row id in a set of messages. */
export function ids(messages: Outgoing[]): string[] {
  return messages.flatMap((message) =>
    message.type === "buttons" ? message.buttons.map((b) => b.id) : message.type === "list" ? message.rows.map((r) => r.id) : []
  );
}

/** Every button and list-row title in a set of messages. */
export function titles(messages: Outgoing[]): string[] {
  return messages.flatMap((message) =>
    message.type === "buttons"
      ? message.buttons.map((b) => b.title)
      : message.type === "list"
        ? message.rows.map((r) => r.title)
        : []
  );
}

/** All message text, as the customer would read it. */
export function textOf(messages: Outgoing[]): string {
  return messages.map(transcriptOf).join("\n---\n");
}
