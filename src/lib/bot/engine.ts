import type { Language } from "@/lib/i18n";
import { findReference, mergeDetails, type CustomerDetails, type CustomerIntent } from "@/lib/ai/customer";
import { AVAILABILITY_LABEL, type CatalogProduct } from "@/lib/catalog-types";
import {
  classify,
  detectEnterprise,
  detectIndustry,
  isFrustrated,
  isGreetingOnly,
  isMenuRequest,
  isOptIn,
  isOptOut,
  isQuestion,
  wantsHuman,
  type Classification,
} from "./detect";
import { isOpen, nextOpening } from "./hours";
import { offer, type Choice, type Outgoing } from "./render";
import { scoreLead, warmedUp, type LeadScore } from "./scoring";
import type { BotConfig } from "./schema";
import { handoverSummary, machineLine, plainBrief, projectBrief, type HandoverSummary } from "./summary";
import { fill, pick, wordCount, type TemplateValues } from "./text";
import {
  SERVICE_LINE_INTENTS,
  isServiceIntent,
  type ActionRef,
  type ActiveFlow,
  type BotEventType,
  type BotIntent,
  type BotState,
  type ChoiceOption,
  type FlowContext,
  type FlowId,
  type FlowStep,
  type ProofSection,
  type StepField,
  type SupportCategory,
  type TeamKey,
  type Temperature,
} from "./types";

/**
 * =============================================================================
 *  Pros-Link Assistant — conversation engine
 * =============================================================================
 *
 *  One customer message in, the replies and CRM effects out. The engine decides
 *  *what happens*; a `BotRuntime` does the I/O — sending to WhatsApp or back to
 *  the website, reading the catalogue, writing the CRM.
 *  Swapping the runtime is how the same engine runs on WhatsApp, on the web
 *  assistant, inside the console simulator and under tests with no network or
 *  database at all.
 *
 *  Order of precedence for a message:
 *
 *    1. Opt-out / opt-in (WhatsApp)      — always honoured first
 *    2. A person is handling the thread  — stay silent if configured to
 *    3. Photos and documents             — attached to the request they belong to
 *    4. Button and list taps             — menus, catalogue, actions, flow answers
 *    5. "menu", greetings                — back to the top
 *    6. Upset, or asking for a person    — hand over with a full summary
 *    7. Corporate signals                — corporate mode
 *    8. An open flow                     — take the answer, ask the next thing
 *    9. Typed requests                   — quote, service, tracking and callback
 *                                          requests start flows, a product opens
 *                                          its catalogue, a known intent gets its
 *                                          buttons and anything else the main menu
 *
 *  The assistant answers with its menus, catalogue and flows only; it never
 *  composes a reply. A message it cannot route always gets the main menu;
 *  after a few in a row the menu also says how to reach a person.
 * =============================================================================
 */

// ------------------------------------------------------------------ Types ---

export interface InboundMedia {
  /** Meta's media id. */
  id: string;
  type: string;
  mime?: string;
}

export interface InboundTurn {
  kind: "text" | "reply" | "media" | "location" | "unsupported";
  /** What the customer wrote — or, for a tap, the title of what they tapped. */
  text: string;
  replyId?: string;
  media?: InboundMedia;
}

export interface Records {
  lead?: string;
  meeting?: string;
  ticket?: string;
  quote?: string;
}

/** The contact details from the company profile the assistant may give out. */
export interface CompanyContact {
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  address: string;
  hours: string;
  offices: Array<{ city: string; address: string; phone: string }>;
}

export interface TurnContext {
  config: BotConfig;
  channel: "WEB" | "WHATSAPP";
  company: CompanyContact;
  /** Active product categories, for the catalogue and category questions. */
  categories: Array<{ slug: string; name: string }>;
  language: Language;
  /** The number the customer is writing from on WhatsApp (`+923001234567`); empty on the web. */
  phone: string;
  profileName?: string;
  isNewConversation: boolean;
  optedOut: boolean;
  /** A person has taken the thread from the console. */
  botPaused: boolean;
  details: CustomerDetails;
  state: BotState;
  records: Records;
  now: Date;
}

export type TrackResult =
  | { found: false }
  | {
      found: true;
      reference: string;
      /** "Service ticket", "Quote request"… */
      kind: string;
      status: string;
      updatedAt: Date;
      /** What happens next, in a sentence. */
      next?: string;
    };

export type Effect =
  | {
      type: "event";
      event: BotEventType;
      intent?: string;
      team?: TeamKey;
      value?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      /** Keep the conversation's capture and lead current; create the lead when due. */
      type: "sync";
      details: CustomerDetails;
      state: BotState;
      score: LeadScore;
      /** Create the lead even if the conversational criteria are not met — a flow finished. */
      force?: boolean;
      nextAction?: string;
      team?: TeamKey;
      /** Move the lead to this stage if it is earlier in the pipeline. */
      stage?: "QUOTE_REQUESTED";
    }
  | {
      type: "quote";
      details: CustomerDetails;
      state: BotState;
      score: LeadScore;
      title: string;
      nextAction: string;
      team: TeamKey;
    }
  | {
      type: "ticket";
      details: CustomerDetails;
      state: BotState;
      context: FlowContext;
      team: TeamKey;
      /** When the flow started, so media sent during it is attached. */
      since?: string;
      /** The visit time the customer asked for, in their own words. */
      note?: string;
      /** Also hand the conversation to the team. */
      handover?: HandoverSummary;
    }
  | {
      type: "meeting";
      details: CustomerDetails;
      state: BotState;
      score: LeadScore;
      topic: string;
      note?: string;
      nextAction: string;
      team: TeamKey;
    }
  | {
      type: "handover";
      details: CustomerDetails;
      state: BotState;
      score: LeadScore;
      summary: HandoverSummary;
      /** Tell the team without telling the customer they were transferred. */
      silent: boolean;
      /** Reuse this reference instead of opening a new ticket. */
      reference?: string;
    }
  | { type: "alert"; details: CustomerDetails; state: BotState; score: LeadScore; summary: HandoverSummary }
  /** A photo or document sent after a ticket exists: add it to that ticket. */
  | { type: "attach"; media: InboundMedia; ticketReference: string }
  | { type: "optOut" }
  | { type: "optIn" };

export interface EffectResult {
  reference?: string;
  leadReference?: string;
  /** True when this effect created the lead rather than updating it. */
  leadCreated?: boolean;
}

export interface BotRuntime {
  send(message: Outgoing): Promise<void>;
  /** Contact details the transcript — including the message being handled — adds to `known`. */
  extract(known: CustomerDetails): Promise<CustomerDetails>;
  /** What the customer said, briefly, for a handover. */
  summarize(): Promise<string>;
  /** Published products in a category. */
  products(categorySlug: string): Promise<CatalogProduct[]>;
  /** One published product. */
  product(id: string): Promise<CatalogProduct | null>;
  /** Status of a request, if `reference` exists and belongs to `phone`. */
  track(reference: string, phone: string): Promise<TrackResult>;
  commit(effect: Effect): Promise<EffectResult>;
}

export interface TurnResult {
  details: CustomerDetails;
  state: BotState;
  records: Records;
}

// ---------------------------------------------------------------- Helpers ---

/** Service lines and the flow and ticket category each opens. */
const SERVICE_FLOW: Partial<Record<BotIntent, { flow: FlowId; category: SupportCategory; label: string }>> = {
  INSTALLATION: { flow: "installation", category: "INSTALLATION", label: "Installation request" },
  MAINTENANCE: { flow: "service", category: "MAINTENANCE", label: "Maintenance request" },
  REPAIR: { flow: "service", category: "REPAIR", label: "Repair request" },
  TECHNICAL_SUPPORT: { flow: "service", category: "TECHNICAL", label: "Technical support" },
  PARTS_ACCESSORIES: { flow: "parts", category: "PARTS", label: "Parts request" },
  CONSUMABLES: { flow: "parts", category: "PARTS", label: "Consumables request" },
};

/** Words for a machine type, from the product intent a message mentioned. */
const MACHINE_FOR_INTENT: Partial<Record<BotIntent, string>> = {
  DIGITAL_DUPLICATOR: "Digital duplicator",
  PHOTOCOPIER: "Photocopier / MFP",
  PRINTER: "Printer",
};

const SAVE_FAILED = {
  en: "Sorry — something went wrong while saving your request, so it hasn't been submitted yet. Send any message to try again, or tap *Talk to a Person*.",
};

// Defaults for messages that a messages section saved before they existed lacks.
const NOT_UNDERSTOOD = {
  en: "Thanks for your message! 😊 Please choose an option from the menu below and I'll help you right away.",
  ur_roman: "Aap ke message ka shukriya! 😊 Neeche diye gaye menu se ek option chunein, main foran aap ki madad karta hoon.",
  ur: "آپ کے پیغام کا شکریہ! 😊 نیچے دیے گئے مینو سے ایک آپشن چنیں، میں فوراً آپ کی مدد کرتا ہوں۔",
};
const INTENT_BUTTONS = {
  en: "Here's how I can help — please choose an option below.",
  ur_roman: "Main is tarah madad kar sakta hoon — neeche se ek option chunein.",
  ur: "میں اس طرح مدد کر سکتا ہوں — نیچے سے ایک آپشن چنیں۔",
};
const QUESTION_LATER = {
  en: "Our team will answer that when they get in touch. For now — {question}",
  ur_roman: "Is ka jawab hamari team rabta karne par degi. Filhal — {question}",
  ur: "اس کا جواب ہماری ٹیم رابطہ کرنے پر دے گی۔ فی الحال — {question}",
};

const NOT_SURE = "not-sure";
const SAME_NUMBER = "same-number";

/** Run one customer message through the assistant. */
export async function runTurn(input: InboundTurn, context: TurnContext, runtime: BotRuntime): Promise<TurnResult> {
  const turn = new Turn(input, context, runtime);
  await turn.run();
  return { details: turn.details, state: turn.state, records: turn.records };
}

class Turn {
  details: CustomerDetails;
  state: BotState;
  records: Records;

  private readonly config: BotConfig;
  private readonly language: Language;
  private synced = false;
  private readonly startTemperature: Temperature | undefined;

  constructor(
    private readonly input: InboundTurn,
    private readonly context: TurnContext,
    private readonly runtime: BotRuntime
  ) {
    this.config = context.config;
    this.language = context.language;
    this.details = { ...context.details };
    this.state = structuredClone(context.state);
    this.records = { ...context.records };
    this.startTemperature = context.state.score?.temperature;
  }

  private get whatsapp(): boolean {
    return this.context.channel === "WHATSAPP";
  }

  // ------------------------------------------------------------ Top level --

  async run(): Promise<void> {
    const { input, context } = this;
    const text = input.text.trim();
    const typed = input.kind === "text" || input.kind === "location";

    // 1. Subscription controls come before everything, even a paused bot —
    //    on WhatsApp, where broadcasts can reach the customer.
    if (this.whatsapp && typed && isOptOut(text)) {
      await this.runtime.commit({ type: "optOut" });
      await this.event("OPTED_OUT");
      this.state.flow = undefined;
      if (!context.botPaused) await this.say(pick(this.config.messages.optOut, this.language));
      return;
    }
    if (this.whatsapp && context.optedOut && typed && (isOptIn(text) || isMenuRequest(text) || isGreetingOnly(text))) {
      await this.runtime.commit({ type: "optIn" });
      await this.event("OPTED_IN");
    }

    // 2. A person is replying from the console, or the team asked for silence
    //    after a handover: the transcript is kept, the assistant says nothing.
    if (context.botPaused) return;
    if (this.state.handover && !this.state.handover.silent && this.config.handover.pauseBot && !(typed && isMenuRequest(text))) return;

    // 3. Photos and documents.
    if (input.kind === "media") {
      const handled = await this.receiveMedia();
      if (handled || !text) return;
    }
    if (input.kind === "unsupported" || (!text && !input.replyId)) {
      await this.openNode(this.config.menu.root, 0, { welcome: context.isNewConversation });
      return;
    }

    // 4. Taps.
    if (input.replyId) {
      await this.handleReply(input.replyId);
      await this.finish(true);
      return;
    }

    // 5. Back to the top.
    if (isMenuRequest(text)) {
      this.state.flow = undefined;
      await this.openNode(this.config.menu.root, 0);
      return;
    }
    if (isGreetingOnly(text)) {
      if (this.state.flow?.pending) {
        await this.askNext(pick(this.config.messages.resumeFlow, this.language));
      } else {
        await this.openNode(this.config.menu.root, 0, { welcome: true });
      }
      return;
    }

    // 6. People first when it matters.
    if (isFrustrated(text, this.config.handover.frustrationKeywords)) {
      this.state.flow = undefined;
      await this.handover(this.teamFor(), "Customer is upset and needs a person");
      await this.finish(true);
      return;
    }

    const classification = classify(text, this.config);

    if (wantsHuman(text)) {
      this.state.flow = undefined;
      const team = classification.service
        ? this.config.intents[classification.service]?.team
        : this.state.team ?? (this.state.intent ? this.config.intents[this.state.intent]?.team : undefined);
      if (team) {
        await this.handover(team, "Customer asked to speak to a person");
      } else {
        await this.openNode("expert", 0);
      }
      await this.finish(true);
      return;
    }

    // Everything below reads what the customer said.
    await this.learn(text);

    // 7. Corporate mode, once per conversation.
    if (!this.state.signals.enterprise && this.state.flow?.id !== "corporate") {
      const signal = detectEnterprise(text, this.details.companySize, this.config.enterprise);
      if (signal.enterprise) {
        await this.enterEnterpriseMode(signal.reason ?? "corporate signals");
        await this.finish(true);
        return;
      }
    }

    // 8. An open flow takes the message as an answer.
    if (this.state.flow) {
      await this.continueFlow(text, classification);
      await this.finish(true);
      return;
    }

    // 9. Natural language.
    await this.converse(text, classification);
    await this.finish(true);
  }

  // ---------------------------------------------------------------- Media --

  /** A photo or document. Returns true when it was fully handled. */
  private async receiveMedia(): Promise<boolean> {
    const { media } = this.input;
    const { messages } = this.config;
    if (media) await this.event("ATTACHMENT_RECEIVED", { value: media.type });

    const current = this.currentFlow();
    if (current && media && current.definition.steps.some((step) => step.field === "attachment")) {
      current.active.attachments = (current.active.attachments ?? 0) + 1;
      const acknowledgement = pick(messages.mediaAttached, this.language);
      if (this.nextStep()) {
        await this.askNext(acknowledgement);
      } else {
        // The photo was the last thing the flow needed: acknowledge it, then complete.
        await this.say(acknowledgement);
        await this.askNext();
        await this.finish(true);
      }
      return true;
    }
    if (media && this.records.ticket) {
      await this.runtime.commit({ type: "attach", media, ticketReference: this.records.ticket });
      await this.say(`${pick(messages.mediaAttached, this.language)} (${this.records.ticket})`);
      return true;
    }
    if (this.input.text.trim()) return false;

    // Nothing to attach it to: acknowledge it and carry on with the open
    // flow's question, or the main menu.
    const acknowledgement = pick(messages.media, this.language);
    if (current) {
      await this.askNext(acknowledgement);
    } else {
      const root = this.config.menu.nodes[this.config.menu.root];
      const menuBody = root?.kind === "menu" ? pick(root.body, this.language) : "";
      await this.openNode(this.config.menu.root, 0, { intro: [acknowledgement, menuBody].filter(Boolean).join("\n\n") });
    }
    return true;
  }

  // ---------------------------------------------------------------- Taps ---

  private async handleReply(id: string): Promise<void> {
    const [kind, first, second] = id.split(":");

    switch (kind) {
      case "n":
        return this.openNode(first, Number(second ?? 0) || 0);
      case "a":
        return this.runAction(first);
      case "c":
      case "q":
        return this.answerChoice(first as StepField, Number(second), kind === "q");
      case "p":
        return this.askNext(undefined, Number(second) || 0);
      case "s":
        return this.skip(first as StepField);
      case "y":
        return this.confirmName(true);
      case "o":
        return this.confirmName(false);
      case "cc":
        return this.showCategories(Number(first) || 0);
      case "cat":
        return this.showCategory(first, Number(second) || 0);
      case "pr":
        return this.showProduct(first);
      default:
        await this.say(pick(this.config.messages.unknownButton, this.language));
        return this.openNode(this.config.menu.root, 0);
    }
  }

  private async openNode(nodeId: string, pageNumber: number, options: { welcome?: boolean; intro?: string } = {}): Promise<void> {
    const { config, language } = this;
    const node = config.menu.nodes[nodeId];
    if (!node) {
      await this.say(pick(config.messages.unknownButton, language));
      if (nodeId !== config.menu.root) await this.openNode(config.menu.root, 0);
      return;
    }

    if (node.intent) this.setIntent(node.intent);
    if (node.team) this.state.team = node.team;

    if (node.kind === "menu") {
      this.state.menu = { node: nodeId, page: pageNumber };
      if (nodeId !== config.menu.root) this.remember(pick(node.title, "en"));

      const children = node.children
        .map((child) => [child, config.menu.nodes[child]] as const)
        .filter(([, child]) => Boolean(child))
        .map(([child, entry]) => ({
          id: `n:${child}`,
          title: pick(entry!.title, language),
          description: entry!.description ? pick(entry!.description, language) : undefined,
        }));
      if (nodeId !== config.menu.root) {
        children.push({ id: "a:main_menu", title: pick(config.messages.mainMenu, language), description: undefined });
      }

      const body = options.intro ?? (options.welcome ? pick(config.messages.welcome, language) : pick(node.body, language));
      await this.event("MENU_OPENED", { value: nodeId });
      await this.offer(this.fillCopy(body), children, {
        pageId: (next) => `n:${nodeId}:${next}`,
        page: pageNumber,
        forceList: true,
      });
      return;
    }

    if (node.kind === "service") {
      this.setIntent(node.intent);
      this.state.team = node.team;
      if (node.categorySlug) this.details.productCategory = node.categorySlug;
      if (node.interest) this.details.interest = node.interest;
      this.remember(pick(node.title, "en"));
      await this.event("SERVICE_VIEWED", { value: nodeId, intent: node.intent, team: node.team });

      await this.offer(this.fillCopy(pick(node.body, language)), this.actionChoices(node.actions), { footer: this.footer() });
      return;
    }

    this.remember(pick(node.title, "en"));
    await this.runRef(node.do, { intent: node.intent, team: node.team });
  }

  private async runAction(key: string): Promise<void> {
    const action = this.config.actions[key];
    if (!action) {
      await this.say(pick(this.config.messages.unknownButton, this.language));
      return this.openNode(this.config.menu.root, 0);
    }
    if (key !== "main_menu") this.remember(pick(action.title, "en"));
    return this.runRef(action.do, {});
  }

  private async runRef(ref: ActionRef, hint: { intent?: BotIntent; team?: TeamKey }): Promise<void> {
    switch (ref.type) {
      case "menu":
        if (ref.node === this.config.menu.root) this.state.flow = undefined;
        return this.openNode(ref.node, 0);

      case "flow":
        return this.startFlow(ref.flow, {
          ...ref.context,
          intent: ref.context?.intent ?? hint.intent ?? this.currentServiceIntent(),
          team: ref.context?.team ?? hint.team,
        });

      case "handover": {
        const team = ref.team ?? hint.team ?? this.teamFor();
        return this.handover(team, `Customer asked to talk to ${this.config.teams[team]?.label ?? team}`);
      }

      case "pricing":
        return this.showPricing(hint.intent ?? this.currentServiceIntent());

      case "catalog":
        return ref.category ? this.showCategory(ref.category, 0) : this.showCategories(0);

      case "contact":
        return this.showContact();

      case "request": {
        await this.event(ref.event, { intent: this.state.intent });
        await this.sync({ force: true, nextAction: ref.nextAction });
        await this.offer(this.fillCopy(pick(ref.body, this.language)), this.actionChoices(ref.actions ?? []));
        return;
      }

      case "say":
        return this.offer(this.fillCopy(pick(ref.body, this.language)), this.actionChoices(ref.actions ?? []));

      case "proof":
        return this.showProof(ref.section);
    }
  }

  // ------------------------------------------------------------ Catalogue --

  private async showCategories(pageNumber: number): Promise<void> {
    const { categories } = this.context;
    const { messages } = this.config;
    await this.event("CATALOG_VIEWED");
    if (!categories.length) {
      await this.offer(
        this.fillCopy(pick(messages.categoryEmpty, this.language), { category: "" }),
        this.actionChoices(["get_quote", "request_callback", "main_menu"])
      );
      return;
    }
    const rows: Choice[] = categories.map((category) => ({ id: `cat:${category.slug}`, title: category.name }));
    rows.push({ id: "a:main_menu", title: pick(messages.mainMenu, this.language) });
    await this.offer(pick(messages.catalogIntro, this.language), rows, {
      pageId: (next) => `cc:${next}`,
      page: pageNumber,
      forceList: true,
    });
  }

  private async showCategory(slug: string, pageNumber: number): Promise<void> {
    const { messages } = this.config;
    const category = this.context.categories.find((entry) => entry.slug === slug);
    if (!category) {
      await this.say(pick(messages.unknownButton, this.language));
      return this.showCategories(0);
    }

    this.details.productCategory = category.slug;
    this.details.interest = category.name;
    const intent = this.intentForCategory(category.slug);
    if (intent) this.setIntent(intent);
    this.remember(category.name);
    await this.event("CATALOG_VIEWED", { value: category.slug, intent });

    const products = await this.runtime.products(category.slug).catch(() => [] as CatalogProduct[]);
    if (!products.length) {
      await this.offer(
        this.fillCopy(pick(messages.categoryEmpty, this.language), { category: category.name }),
        this.actionChoices(["get_quote", "request_callback", "talk_to_sales"])
      );
      return;
    }

    const rows: Choice[] = products.map((product) => ({
      id: `pr:${product.id}`,
      title: product.name,
      description: [product.brand?.name, product.model, AVAILABILITY_LABEL[product.availability]].filter(Boolean).join(" · "),
      imageUrl: product.images[0],
    }));
    rows.push({ id: "a:get_quote", title: pick(this.config.actions.get_quote.title, this.language) });
    await this.offer(this.fillCopy(pick(messages.categoryIntro, this.language), { category: category.name }), rows, {
      pageId: (next) => `cat:${category.slug}:${next}`,
      page: pageNumber,
      forceList: true,
    });
  }

  private async showProduct(id: string): Promise<void> {
    const product = await this.runtime.product(id).catch(() => null);
    if (!product) {
      await this.say(pick(this.config.messages.unknownButton, this.language));
      return this.showCategories(0);
    }

    this.state.productId = product.id;
    this.details.productId = product.id;
    this.details.interest = product.name;
    if (product.category) {
      this.details.productCategory = product.category.slug;
      const intent = this.intentForCategory(product.category.slug);
      if (intent) this.setIntent(intent);
    }
    this.remember(product.name);
    await this.event("PRODUCT_VIEWED", { value: product.id });

    const specs = product.specifications.slice(0, 6).map((spec) => `• ${spec.label}: ${spec.value}`);
    const features = product.features.slice(0, 4).map((feature) => `• ${feature}`);
    const docs = product.documents.slice(0, 2).map((doc) => `📄 ${doc.title}: ${doc.url}`);
    const body = [
      `*${product.name}*`,
      [product.brand?.name, product.model ? `Model ${product.model}` : null, product.sku ? `SKU ${product.sku}` : null]
        .filter(Boolean)
        .join(" · "),
      product.summary ?? "",
      specs.length ? `*Specifications*\n${specs.join("\n")}` : "",
      features.length ? `*Features*\n${features.join("\n")}` : "",
      `*Availability:* ${AVAILABILITY_LABEL[product.availability]}`,
      docs.join("\n"),
      pick(this.config.messages.productActions, this.language),
    ]
      .filter(Boolean)
      .join("\n\n");

    await this.offer(body, this.actionChoices(["get_quote", "request_callback", "talk_to_sales"]), {
      header: product.images[0] ? { imageUrl: product.images[0] } : undefined,
    });
  }

  private async showContact(): Promise<void> {
    const { company } = this.context;
    const { messages } = this.config;
    const lines = [
      company.phone && `📞 ${company.phone}`,
      company.whatsapp && `💬 WhatsApp: ${company.whatsapp}`,
      company.email && `✉️ ${company.email}`,
      company.address && `📍 ${company.address}`,
      ...company.offices.map((office) => `📍 ${office.city}${office.address ? ` — ${office.address}` : ""}${office.phone ? ` · ${office.phone}` : ""}`),
      company.hours && `🕘 ${company.hours}`,
      company.website && `🌐 ${company.website}`,
    ].filter(Boolean);

    if (!lines.length) {
      await this.offer(pick(messages.contactMissing, this.language), this.actionChoices(["request_callback", "talk_to_sales", "main_menu"]));
      return;
    }
    await this.offer(
      `${pick(messages.contactIntro, this.language)}\n\n${lines.join("\n")}`,
      this.actionChoices(["request_callback", "talk_to_sales", "main_menu"])
    );
  }

  // -------------------------------------------------------- Typed requests --

  private async converse(text: string, classification: Classification): Promise<void> {
    const { config } = this;
    const { request, service } = classification;

    if (service) this.setIntent(service);
    if (classification.primary !== "GENERAL_INQUIRY") this.details.topic = classification.primary;
    const issue = wordCount(text) >= 4 ? text : undefined;

    // Messages in a row that led nowhere; any that is routed starts the count again.
    const misses = this.state.fallbacks;
    this.state.fallbacks = 0;

    // Requests that have a flow of their own start it straight away.
    switch (request) {
      case "QUOTE":
        return this.startFlow("quote", this.contextFor(service));
      case "DEMO":
        return this.startFlow("demo", this.contextFor(service));
      case "CALLBACK":
        return this.startFlow("callback", this.contextFor(service));
      case "TRACK_REQUEST":
        return this.startFlow("track", {}, undefined, findReference(text));
      case "PRODUCTS":
        if (!service || !this.categoryForIntent(service)) return this.showCategories(0);
        return this.showCategory(this.categoryForIntent(service)!, 0);
      case "BILLING":
        return this.startFlow(
          "support",
          { intent: "BILLING", supportCategory: "BILLING", topicLabel: "Billing", team: "ACCOUNTS" },
          issue
        );
      case "SERVICE_REQUEST": {
        const line = (service && SERVICE_FLOW[service]) || SERVICE_FLOW.REPAIR!;
        if (service && MACHINE_FOR_INTENT[service] && !this.details.machineType) {
          this.details.machineType = MACHINE_FOR_INTENT[service];
        }
        return this.startFlow(
          line.flow,
          { intent: "SERVICE_REQUEST", supportCategory: line.category, topicLabel: line.label, team: line.flow === "parts" ? "PARTS" : "SERVICE" },
          issue
        );
      }
    }

    // A price question: the prices the team has published, or the way to a quotation.
    if (request === "PRICING") return this.showPricing(service ?? this.currentServiceIntent());

    // A product range in words opens that part of the catalogue.
    const slug = service ? this.categoryForIntent(service) : undefined;
    if (slug) return this.showCategory(slug, 0);

    // Anything else understood gets the buttons configured for its intent.
    const intent = service ?? request;
    const actions = intent && intent !== "GENERAL_INQUIRY" ? (config.intents[intent]?.actions ?? []) : [];
    if (actions.length) {
      await this.offer(pick(config.messages.intentButtons ?? INTENT_BUTTONS, this.language), this.actionChoices(actions));
      return;
    }

    // Not understood: the main menu, every time, so the customer always has a
    // way forward. After a few in a row its intro also says how to reach a person.
    await this.event("FALLBACK", { intent: intent ?? "GENERAL_INQUIRY" });
    this.state.fallbacks = misses + 1;
    const intro =
      this.state.fallbacks >= config.handover.lowConfidenceTurns
        ? config.messages.lowConfidence
        : (config.messages.notUnderstood ?? NOT_UNDERSTOOD);
    await this.openNode(config.menu.root, 0, { intro: pick(intro, this.language) });
  }

  // ---------------------------------------------------------------- Flows ---

  /**
   * `issue` is the customer's own description of a problem, for a ticket flow;
   * `reference` a reference number to track, when the message carried one.
   */
  private async startFlow(id: FlowId, context: FlowContext, issue?: string, reference?: string): Promise<void> {
    const flow = this.config.flows[id];
    if (!flow) return this.openNode(this.config.menu.root, 0);

    // A ticket describes this problem, not what was discussed earlier.
    if (flow.completion === "ticket") this.details.requirements = issue;
    // Each tracking request asks afresh unless the message named a reference.
    if (id === "track") this.details.trackingReference = reference;

    const intent = context.intent ?? flow.intent;
    if (intent) this.setIntent(intent);
    this.state.team = context.team ?? flow.team;

    if (context.categorySlug) this.details.productCategory = context.categorySlug;
    if (context.interest) this.details.interest = context.interest;
    if (context.supportCategory) {
      this.details.intent = "SERVICE";
      this.details.supportCategory = context.supportCategory;
    }
    if (id === "demo") this.state.signals.wantsDemo = true;
    if (id === "callback") this.state.signals.wantsCall = true;
    if (id === "quote") this.state.signals.wantsQuote = true;

    this.state.flow = {
      id,
      context: { ...context, intent },
      retries: 0,
      skipped: [],
      startedAt: this.context.now.toISOString(),
    };
    this.remember(pick(flow.title, "en"));

    await this.event("FLOW_STARTED", { value: id, intent, team: this.state.team });
    if (flow.event && flow.event !== "TICKET_CREATED") await this.event(flow.event, { value: id, intent });

    await this.askNext(flow.intro ? pick(flow.intro, this.language) : undefined);
  }

  private currentFlow() {
    const active = this.state.flow;
    const definition = active ? this.config.flows[active.id] : undefined;
    return active && definition ? { active, definition } : null;
  }

  private applies(step: FlowStep, active: ActiveFlow): boolean {
    if (step.goals && !step.goals.includes(active.context.goal ?? "")) return false;
    if (step.channels && !step.channels.includes(this.context.channel)) return false;
    return true;
  }

  /** The next unanswered step of the open flow, or null when it is complete. */
  private nextStep() {
    const current = this.currentFlow();
    if (!current) return null;
    const { active, definition } = current;
    for (const step of definition.steps) {
      if (!this.applies(step, active)) continue;
      if (active.skipped.includes(step.field)) continue;
      if (this.known(step.field, active)) continue;
      return step;
    }
    return null;
  }

  private known(field: StepField, active: ActiveFlow): boolean {
    const d = this.details;
    switch (field) {
      case "visitSlot":
        return Boolean(active.meetingNote);
      case "productCategory":
        return Boolean(d.productCategory || d.productId);
      case "phone":
        return Boolean(d.phone || (this.whatsapp && this.context.phone));
      case "whatsapp":
        return Boolean(d.whatsapp || this.whatsapp);
      case "attachment":
        return !this.whatsapp || (active.attachments ?? 0) > 0;
      default:
        return Boolean(d[field as keyof CustomerDetails]);
    }
  }

  /** Ask the open flow's next question, or complete the flow. */
  private async askNext(prefix?: string, pageNumber = 0): Promise<void> {
    const current = this.currentFlow();
    if (!current) return this.openNode(this.config.menu.root, 0);

    const step = this.nextStep();
    if (!step) return this.completeFlow();

    const { active } = current;
    if (active.pending !== step.field) active.retries = 0;
    active.pending = step.field;

    const { messages } = this.config;
    const question = pick(step.ask, this.language);
    const lead = (body: string) =>
      prefix ? (prefix.includes("{question}") ? fill(prefix, { question: body }) : `${prefix}\n\n${body}`) : body;

    // A WhatsApp profile name is offered rather than asked for.
    if (step.field === "name" && this.context.profileName) {
      const confirm = fill(pick(messages.nameConfirm, this.language), { name: this.context.profileName });
      await this.offer(lead(confirm), [
        { id: "y:name", title: pick(messages.nameConfirmYes, this.language) },
        { id: "o:name", title: pick(messages.nameConfirmOther, this.language) },
      ]);
      return;
    }

    const skip = step.optional ? [{ id: `s:${step.field}`, title: pick(messages.skip, this.language) }] : [];

    if (step.kind === "choice") {
      const choices = this.optionsFor(step).map((option, index) => ({
        id: `c:${step.field}:${index}`,
        title: pick(option.title, this.language),
        description: option.description ? pick(option.description, this.language) : undefined,
      }));
      await this.offer(lead(question), [...choices, ...skip], {
        pageId: (next) => `p:${step.field}:${next}`,
        page: pageNumber,
      });
      return;
    }

    const quick = (step.quickAnswers ?? [])
      // "Same number" only makes sense once there is a number.
      .filter((option) => option.value !== SAME_NUMBER || this.details.phone)
      .map((option, index) => ({ id: `q:${step.field}:${index}`, title: pick(option.title, this.language) }));
    await this.offer(lead(question), [...quick, ...skip]);
  }

  private optionsFor(step: { options?: ChoiceOption[]; optionsFrom?: string }): ChoiceOption[] {
    if (step.options?.length) return step.options;
    const { options } = this.config;
    switch (step.optionsFrom) {
      case "categories":
        return [
          ...this.context.categories.map((category) => ({
            value: category.slug,
            title: { en: category.name },
            categorySlug: category.slug,
          })),
          { value: NOT_SURE, title: { en: "🤔 Not sure yet", ur_roman: "🤔 Abhi pata nahi", ur: "🤔 ابھی معلوم نہیں" } },
        ];
      case "machines":
        return options.machines;
      case "quantities":
        return options.quantities;
      case "budgets":
        return options.budgets;
      case "timelines":
        return options.timelines;
      case "contactMethods":
        return options.contactMethods;
      default:
        return [];
    }
  }

  /** A tapped option — or quick answer — for the question the flow is waiting on. */
  private async answerChoice(field: StepField, index: number, quick: boolean): Promise<void> {
    const current = this.currentFlow();
    const step = current?.definition.steps.find((candidate) => candidate.field === field && this.applies(candidate, current.active));
    const pool = step ? (quick ? (step.quickAnswers ?? []).filter((o) => o.value !== SAME_NUMBER || this.details.phone) : this.optionsFor(step)) : [];
    const option = pool[index];

    if (!current || !step || !option) {
      await this.say(pick(this.config.messages.unknownButton, this.language));
      return this.openNode(this.config.menu.root, 0);
    }

    this.apply(field, option.value, option);
    await this.askNext();
  }

  private async skip(field: StepField): Promise<void> {
    const current = this.currentFlow();
    if (!current) return this.openNode(this.config.menu.root, 0);
    if (!current.active.skipped.includes(field)) current.active.skipped.push(field);
    await this.askNext();
  }

  private async confirmName(yes: boolean): Promise<void> {
    const current = this.currentFlow();
    if (!current) return this.openNode(this.config.menu.root, 0);
    if (yes && this.context.profileName) {
      this.details.name = this.context.profileName;
      return this.askNext();
    }
    current.active.pending = "name";
    await this.say(pick(current.definition.steps.find((step) => step.field === "name")?.ask ?? { en: "May I have your name?" }, this.language));
  }

  /** A typed message while a flow is open. */
  private async continueFlow(text: string, classification: Classification): Promise<void> {
    const current = this.currentFlow()!;
    const { active } = current;
    const field = active.pending;
    const step = field
      ? current.definition.steps.find((candidate) => candidate.field === field && this.applies(candidate, active))
      : undefined;

    // A new quote, demo or tracking request replaces what was in progress.
    if (classification.request === "QUOTE" && active.id !== "quote") {
      return this.startFlow("quote", this.contextFor(classification.service));
    }
    if (classification.request === "DEMO" && active.id !== "demo") {
      return this.startFlow("demo", this.contextFor(classification.service));
    }
    if (classification.request === "TRACK_REQUEST" && active.id !== "track" && findReference(text)) {
      return this.startFlow("track", {}, undefined, findReference(text));
    }

    if (!field || !step || this.known(field, active)) {
      // The customer answered (possibly several questions at once), or there
      // was no question pending.
      return this.askNext();
    }

    // A question in the middle of a flow is left for the team; the flow carries on.
    if (field !== "requirements" && (isQuestion(text) || (classification.request === "PRICING" && wordCount(text) > 2))) {
      return this.askNext(pick(this.config.messages.questionLater ?? QUESTION_LATER, this.language));
    }

    if (step.kind === "choice") {
      const options = this.optionsFor(step);
      const matched = matchOption(text, options, this.language);
      if (matched) {
        this.apply(field, matched.value, matched);
        return this.askNext();
      }
      if (field === "productCategory" && classification.service) {
        const slug = this.categoryForIntent(classification.service);
        const byIntent = options.find((option) => option.categorySlug === slug);
        if (byIntent) {
          this.apply(field, byIntent.value, byIntent);
          return this.askNext();
        }
      }
      // A short free-text answer is still an answer: "Multan", "about 3 lakh".
      if (wordCount(text) <= 8) {
        this.apply(field, text);
        return this.askNext();
      }
      return this.retry(step.ask);
    }

    // Text questions.
    if (field === "visitSlot") {
      // Kept in the customer's words; the team confirms the actual time.
      active.meetingNote = text;
      return this.askNext();
    }
    if (field === "attachment") {
      // Words instead of a photo: move on rather than insist.
      active.skipped.push("attachment");
      return this.askNext();
    }

    const value = acceptText(field, text);
    if (value) {
      this.apply(field, value);
      return this.askNext();
    }
    return this.retry(step.ask);
  }

  private async retry(ask: { en: string }): Promise<void> {
    const active = this.state.flow!;
    active.retries += 1;
    if (active.retries >= 3 && active.pending) {
      // Three misses: move on rather than loop.
      active.skipped.push(active.pending);
      return this.askNext();
    }
    await this.say(fill(pick(this.config.messages.askAgain, this.language), { question: pick(ask, this.language) }));
  }

  private apply(field: StepField, value: string, option?: ChoiceOption): void {
    const d = this.details;
    switch (field) {
      case "productCategory": {
        if (value === NOT_SURE) {
          d.interest = d.interest ?? "Not sure yet — needs a recommendation";
          this.state.flow?.skipped.push("productCategory");
          return;
        }
        const category = this.context.categories.find((entry) => entry.slug === (option?.categorySlug ?? value));
        if (category) {
          d.productCategory = category.slug;
          d.interest = d.interest && d.productId ? d.interest : category.name;
          const intent = this.intentForCategory(category.slug);
          if (intent) this.setIntent(intent);
        } else {
          d.interest = value;
          this.state.flow?.skipped.push("productCategory");
        }
        return;
      }
      case "machineType":
        d.machineType = option ? pick(option.title, "en").replace(/^\P{L}+/u, "").trim() : value;
        if (option?.intent) this.setIntent(option.intent);
        return;
      case "whatsapp":
        d.whatsapp = value === SAME_NUMBER ? d.phone : value;
        return;
      case "meetingMode":
        if (["SITE_VISIT", "PHONE_CALL", "WHATSAPP", "OFFICE", "ZOOM", "GOOGLE_MEET"].includes(value)) {
          d.meetingMode = value as CustomerDetails["meetingMode"];
        }
        return;
      case "priority":
        if (["LOW", "NORMAL", "HIGH", "URGENT"].includes(value)) d.priority = value as CustomerDetails["priority"];
        return;
      case "trackingReference":
        d.trackingReference = value.toUpperCase();
        return;
      case "visitSlot":
      case "attachment":
        return;
      default:
        (d as Record<string, string>)[field] = value;
    }
  }

  private async completeFlow(): Promise<void> {
    const current = this.currentFlow()!;
    const { active, definition } = current;
    const { id, context } = active;
    const team = context.team ?? definition.team;
    this.state.flow = undefined;

    if (definition.completion === "track") return this.completeTracking();

    const intent: CustomerIntent =
      definition.completion === "ticket" ? "SERVICE" : definition.completion === "meeting" ? "APPOINTMENT" : "PURCHASE";
    this.details.intent = intent;

    const score = this.score();
    let reference: string | undefined;
    let brief = "";

    switch (definition.completion) {
      case "lead": {
        const result = await this.sync({ force: true, nextAction: definition.nextAction, team });
        reference = result.leadReference;
        break;
      }
      case "quote": {
        await this.sync({ force: true, nextAction: definition.nextAction, team, stage: "QUOTE_REQUESTED" });
        const result = await this.runtime.commit({
          type: "quote",
          details: this.details,
          state: this.state,
          score,
          title: this.serviceLabel() ?? "Quotation request",
          nextAction: definition.nextAction,
          team,
        });
        reference = result.reference ?? this.records.lead;
        if (result.reference) this.records.quote = result.reference;
        break;
      }
      case "brief": {
        brief = projectBrief(this.details, id);
        if (!this.details.requirements) this.details.requirements = plainBrief(this.details, id);
        const result = await this.sync({ force: true, nextAction: definition.nextAction, team });
        reference = result.leadReference;
        break;
      }
      case "ticket": {
        const category = context.supportCategory ?? "GENERAL";
        const serious = category === "COMPLAINT" || category === "BILLING" || this.details.priority === "URGENT";
        const summary = serious
          ? await this.summary(team, `${context.topicLabel ?? "Support request"}${this.details.priority === "URGENT" ? " — machine down" : ""}`)
          : undefined;
        const result = await this.runtime.commit({
          type: "ticket",
          details: this.details,
          state: this.state,
          context,
          team,
          since: active.startedAt,
          note: active.meetingNote,
          handover: summary,
        });
        reference = result.reference;
        if (!reference) break;
        this.records.ticket = reference;
        if (summary) {
          this.state.handover = { team, reference, at: this.context.now.toISOString(), reason: summary.reason, silent: true };
        }
        await this.event("TICKET_CREATED", { value: context.topicLabel, team });
        break;
      }
      case "meeting": {
        await this.sync({ force: true, nextAction: definition.nextAction, team });
        const result = await this.runtime.commit({
          type: "meeting",
          details: this.details,
          state: this.state,
          score,
          topic: [pick(definition.title, "en"), this.serviceLabel()].filter(Boolean).join(" — "),
          note: active.meetingNote,
          nextAction: definition.nextAction,
          team,
        });
        reference = result.reference ?? this.records.lead;
        if (result.reference) this.records.meeting = result.reference;
        break;
      }
      case "handover":
        await this.handover(team, `${pick(definition.title, "en")} completed`);
        return;
    }

    // Never confirm a request that was not saved. The answers are kept, so the
    // next message tries again.
    if (!reference) {
      this.state.flow = { ...active, pending: undefined, retries: 0 };
      await this.event("FALLBACK", { value: `save-failed:${id}` });
      await this.offer(pick(this.config.messages.saveFailed ?? SAVE_FAILED, this.language), this.actionChoices(["talk_to_person", "main_menu"]));
      return;
    }

    if (definition.escalate) {
      const summary = await this.summary(team, `${pick(definition.title, "en")} submitted`);
      const result = await this.runtime.commit({
        type: "handover",
        details: this.details,
        state: this.state,
        score,
        summary,
        silent: true,
      });
      this.state.handover = { team, reference: result.reference, at: this.context.now.toISOString(), reason: summary.reason, silent: true };
      await this.event("HANDOVER", { team, value: id });
    }

    await this.event("FLOW_COMPLETED", { value: id, intent: this.state.intent, team });

    const body = this.fillCopy(pick(definition.done.body, this.language), {
      reference,
      brief: brief ? fill(pick(this.config.messages.brief, this.language), { brief }) : undefined,
      machine: machineLine(this.details),
    });
    await this.offer(body, this.actionChoices(definition.done.actions));
  }

  private async completeTracking(): Promise<void> {
    const { messages, flows } = this.config;
    const reference = this.details.trackingReference;
    const phone = this.whatsapp ? this.context.phone : this.details.phone ?? "";
    await this.event("TRACK_REQUESTED", { value: reference });

    const result: TrackResult =
      reference && phone ? await this.runtime.track(reference, phone).catch(() => ({ found: false }) as const) : { found: false };
    this.details.trackingReference = undefined;

    if (!result.found) {
      await this.offer(
        fill(pick(messages.trackNotFound, this.language), { reference }),
        this.actionChoices(["track_request", "talk_to_support", "main_menu"])
      );
      return;
    }
    const updated = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" }).format(result.updatedAt);
    await this.offer(
      fill(pick(messages.trackFound, this.language), {
        reference: result.reference,
        type: result.kind,
        status: result.status,
        updated,
        next: result.next,
      }),
      this.actionChoices(flows.track?.done.actions ?? ["main_menu"])
    );
  }

  // ------------------------------------------------------------- Handover ---

  private async handover(team: TeamKey, reason: string, options: { silent?: boolean } = {}): Promise<void> {
    const { config, language } = this;
    const existing = this.state.handover;
    const recent =
      existing &&
      existing.team === team &&
      this.context.now.getTime() - Date.parse(existing.at) < config.handover.dedupeHours * 3_600_000;

    if (recent && existing.reference) {
      if (!options.silent) {
        await this.offer(
          this.fillCopy(pick(config.messages.handoverExisting, language), {
            team: config.teams[team]?.label ?? team,
            reference: existing.reference,
          }),
          this.actionChoices(["main_menu"])
        );
      }
      return;
    }

    const summary = await this.summary(team, reason);
    const result = await this.runtime.commit({
      type: "handover",
      details: this.details,
      state: this.state,
      score: this.score(),
      summary,
      silent: Boolean(options.silent),
    });

    this.state.handover = { team, reference: result.reference, at: this.context.now.toISOString(), reason, silent: options.silent };
    this.state.team = team;
    await this.event("HANDOVER", { team, value: reason });
    if (options.silent) return;

    const open = isOpen(config.businessHours, this.context.now);
    const body = [
      this.fillCopy(pick(config.messages.handover, language), {
        team: config.teams[team]?.label ?? team,
        reference: result.reference,
      }),
      open
        ? ""
        : this.fillCopy(pick(config.messages.handoverOffHours, language), {
            nextOpen: nextOpening(config.businessHours, this.context.now),
          }),
    ]
      .filter(Boolean)
      .join("\n\n");

    await this.offer(body, this.actionChoices(["main_menu"]));
  }

  private async summary(team: TeamKey, reason: string): Promise<HandoverSummary> {
    const conversation = await this.runtime.summarize().catch(() => "");
    return handoverSummary({
      details: this.details,
      state: this.state,
      score: this.score(),
      phone: this.context.phone,
      profileName: this.context.profileName,
      team,
      reason,
      conversation,
      config: this.config,
      serviceLabel: this.serviceLabel(),
    });
  }

  private async enterEnterpriseMode(reason: string): Promise<void> {
    this.state.signals.enterprise = true;
    this.state.flow = undefined;
    this.state.team = "CORPORATE";
    this.details.topic = "CORPORATE";
    await this.event("ENTERPRISE_DETECTED", { value: reason, team: "CORPORATE" });

    // The corporate team hears about it now, not after the customer picks a button.
    await this.handover("CORPORATE", `Corporate or bulk enquiry (${reason})`, { silent: true });

    const actions = this.config.intents.CORPORATE?.actions ?? ["corporate_requirements", "request_callback", "talk_to_sales"];
    await this.offer(pick(this.config.messages.enterprise, this.language), this.actionChoices(actions));
  }

  // ------------------------------------------------------- Pricing & proof --

  private async showPricing(intent: BotIntent | undefined): Promise<void> {
    const { config, language } = this;
    const entries = intent ? config.pricing.filter((entry) => entry.intents.includes(intent)) : [];

    if (!entries.length) {
      const body = fill(pick(config.messages.pricingUnavailable, language), {
        service: this.serviceLabel() ?? (language === "en" ? "this" : "is"),
      });
      await this.offer(body, this.actionChoices(["get_quote", "request_callback", "talk_to_sales"]));
      return;
    }

    await this.event("PRICING_VIEWED", { intent, value: entries.map((entry) => entry.id).join(",") });
    for (const [index, entry] of entries.entries()) {
      const body = [pick(entry.summary, language), entry.details ? pick(entry.details, language) : ""].filter(Boolean).join("\n\n");
      if (index < entries.length - 1) await this.say(body);
      else await this.offer(body, this.actionChoices(entry.actions));
    }
  }

  private async showProof(section: ProofSection): Promise<void> {
    const items = this.config.proof[section];
    if (!items.length) {
      await this.offer(pick(this.config.messages.proofEmpty, this.language), this.actionChoices(["request_callback", "main_menu"]));
      return;
    }
    const body = items
      .slice(0, 6)
      .map((item) => [`*${item.title}*`, item.summary, item.link].filter(Boolean).join("\n"))
      .join("\n\n");
    await this.offer(body, this.actionChoices(["get_quote", "request_callback", "main_menu"]));
  }

  // --------------------------------------------------------- Understanding --

  /** Read the customer's message into the profile. */
  private async learn(text: string): Promise<void> {
    const extracted = await this.runtime.extract(this.details).catch(() => ({}) as CustomerDetails);
    this.details = mergeDetails(this.details, extracted);

    if (!this.details.businessType) {
      const industry = detectIndustry(text);
      if (industry) this.details.businessType = industry;
    }
    if (this.details.productCategory && !this.context.categories.some((c) => c.slug === this.details.productCategory)) {
      delete this.details.productCategory;
    }
  }

  private setIntent(intent: BotIntent): void {
    if (isServiceIntent(intent) || !this.state.intent) this.state.intent = intent;
    const entry = this.config.intents[intent];
    if (isServiceIntent(intent)) {
      this.details.topic = intent;
      if (entry?.categorySlug && !this.details.productCategory && this.context.categories.some((c) => c.slug === entry.categorySlug)) {
        this.details.productCategory = entry.categorySlug;
      }
      if (entry?.interest && !this.details.interest) this.details.interest = entry.interest;
    }
  }

  private intentForCategory(slug: string): BotIntent | undefined {
    return (Object.entries(this.config.intents) as Array<[BotIntent, BotConfig["intents"][BotIntent]]>).find(
      ([intent, entry]) => entry?.categorySlug === slug && isServiceIntent(intent)
    )?.[0];
  }

  private categoryForIntent(intent: BotIntent): string | undefined {
    const slug = this.config.intents[intent]?.categorySlug;
    return slug && this.context.categories.some((category) => category.slug === slug) ? slug : undefined;
  }

  private currentServiceIntent(): BotIntent | undefined {
    return this.state.intent && isServiceIntent(this.state.intent) ? this.state.intent : undefined;
  }

  private contextFor(service: BotIntent | undefined): FlowContext {
    if (!service) return {};
    const entry = this.config.intents[service];
    return {
      intent: service,
      categorySlug: this.categoryForIntent(service),
      interest: entry?.interest,
      team: SERVICE_LINE_INTENTS.includes(service) ? undefined : entry?.team,
    };
  }

  private teamFor(): TeamKey {
    if (this.state.team) return this.state.team;
    const intent = this.state.intent;
    return (intent && this.config.intents[intent]?.team) || "SALES";
  }

  /** What the conversation is about, in words: the product, category or service. */
  private serviceLabel(): string | undefined {
    if (this.details.interest) return this.details.interest;
    const category = this.context.categories.find((entry) => entry.slug === this.details.productCategory);
    if (category) return category.name;
    const nodeId = this.state.intent ? this.config.intents[this.state.intent]?.node : undefined;
    const node = nodeId ? this.config.menu.nodes[nodeId] : undefined;
    return node ? pick(node.title, "en").replace(/^\P{L}+/u, "").trim() : undefined;
  }

  private score(): LeadScore {
    return scoreLead(this.details, this.state, this.config);
  }

  private remember(label: string): void {
    const clean = label.replace(/^\P{L}+/u, "").trim();
    if (!clean || this.state.trail.at(-1) === clean) return;
    this.state.trail = [...this.state.trail, clean].slice(-12);
  }

  // ------------------------------------------------------------ Finishing ---

  private async sync(options: { force?: boolean; nextAction?: string; team?: TeamKey; stage?: "QUOTE_REQUESTED" } = {}): Promise<EffectResult> {
    const score = this.score();
    this.state.score = score;
    const result = await this.runtime.commit({
      type: "sync",
      details: this.details,
      state: this.state,
      score,
      force: options.force,
      nextAction: options.nextAction,
      team: options.team ?? this.teamFor(),
      stage: options.stage,
    });
    this.synced = true;
    if (result.leadReference) {
      if (result.leadCreated) await this.event("LEAD_CAPTURED", { intent: this.state.intent, team: this.teamFor() });
      this.records.lead = result.leadReference;
    }
    return result;
  }

  /**
   * End of every turn that may have changed the profile: keep the CRM current
   * and tell the team the first time a lead reaches a hot band.
   */
  private async finish(changed: boolean): Promise<void> {
    if (changed && !this.synced) await this.sync();

    const score = this.score();
    this.state.score = score;

    const notify = this.config.handover.notifyTemperatures;
    const alerted = this.state.alerted ?? [];
    if (
      this.records.lead &&
      notify.includes(score.temperature) &&
      warmedUp(this.startTemperature, score.temperature) &&
      !alerted.includes(score.temperature)
    ) {
      this.state.alerted = [...alerted, score.temperature];
      await this.event("LEAD_HOT", { value: score.temperature, intent: this.state.intent, team: this.teamFor() });
      const summary = await this.summary(this.teamFor(), `Lead reached ${score.temperature.replace("_", " ").toLowerCase()} (${score.value}/100)`);
      await this.runtime.commit({ type: "alert", details: this.details, state: this.state, score, summary });
    }
  }

  // ------------------------------------------------------------ Messaging ---

  private actionChoices(keys: string[]): Choice[] {
    return keys
      .map((key) => [key, this.config.actions[key]] as const)
      .filter(([, action]) => Boolean(action))
      .map(([key, action]) => ({
        id: `a:${key}`,
        title: pick(action!.title, this.language),
        description: action!.description ? pick(action!.description, this.language) : undefined,
      }));
  }

  private footer(): string | undefined {
    return this.whatsapp ? pick(this.config.messages.footer, this.language) : undefined;
  }

  private async say(body: string): Promise<void> {
    if (body.trim()) await this.runtime.send({ type: "text", body: body.trim() });
  }

  private async offer(
    body: string,
    choices: Choice[],
    options: { pageId?: (page: number) => string; page?: number; footer?: string; forceList?: boolean; header?: { imageUrl: string } } = {}
  ): Promise<void> {
    const { messages } = this.config;
    for (const message of offer(body, choices, {
      listButton: pick(messages.menuButton, this.language),
      moreTitle: pick(messages.moreOptions, this.language),
      ...options,
    })) {
      await this.runtime.send(message);
    }
  }

  private fillCopy(template: string, extra: TemplateValues = {}): string {
    const { company } = this.context;
    return fill(template, {
      name: this.details.name ?? this.context.profileName,
      company: this.details.company,
      service: this.serviceLabel(),
      phone: company.phone,
      whatsapp: company.whatsapp,
      hours: company.hours,
      website: company.website,
      email: company.email,
      ...extra,
    });
  }

  private async event(
    event: BotEventType,
    extra: { intent?: string; team?: TeamKey; value?: string; metadata?: Record<string, unknown> } = {}
  ): Promise<void> {
    await this.runtime.commit({ type: "event", event, ...extra });
  }
}

// ------------------------------------------------------ Answer handling -----

/** An option the customer typed rather than tapped: "2", "photocopier", "not sure". */
export function matchOption(text: string, options: ChoiceOption[], language: Language): ChoiceOption | undefined {
  const raw = text.trim();
  const numeric = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= options.length) return options[numeric - 1];

  const bare = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}$+]+/gu, " ")
      .trim();
  const typed = bare(raw);
  if (!typed) return undefined;

  return (
    options.find((option) => bare(option.value) === typed) ??
    options.find((option) => bare(pick(option.title, language)) === typed || bare(option.title.en) === typed) ??
    options.find((option) => {
      const title = bare(option.title.en);
      return typed.length >= 3 && (title.includes(typed) || bare(option.value).includes(typed));
    })
  );
}

/** A typed answer to a text question, or null when it is not a plausible one. */
export function acceptText(field: StepField, text: string): string | null {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return null;

  switch (field) {
    case "name": {
      const name = value.replace(/^(my name is|i am|i'm|this is|mera naam|main)\s+/i, "").replace(/[.!]+$/, "");
      if (name.length < 2 || name.length > 60 || /\d|@/.test(name) || wordCount(name) > 5) return null;
      return name;
    }
    case "phone":
    case "whatsapp": {
      const digits = value.replace(/\D/g, "");
      return /^[+\d\s()-]+$/.test(value) && digits.length >= 10 && digits.length <= 15 ? value : null;
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? value.toLowerCase() : null;
    case "trackingReference":
      return findReference(value) ?? null;
    case "city":
      return value.length >= 2 && value.length <= 80 && !/\d{4,}/.test(value) ? value : null;
    case "serialNumber":
      return value.length <= 60 ? value : null;
    default:
      return value.length <= 1500 ? value : value.slice(0, 1500);
  }
}
