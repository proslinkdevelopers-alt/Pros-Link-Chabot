import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BOT_CONFIG } from "@/data/bot";
import type { BotConfig } from "../schema";
import { KNOWN_REQUEST, TestConversation, ids, textOf, titles } from "./harness";

const MAIN_MENU = ["n:products", "n:quote", "n:service", "n:repair", "n:supplies", "n:sales", "n:support", "n:track", "n:about", "n:contact"];

describe("welcome and menus", () => {
  it("greets a new conversation with the welcome message and the ten main menu options", async () => {
    const chat = new TestConversation();
    const out = await chat.send("Hi");

    assert.equal(out.length, 1);
    assert.equal(out[0].type, "list");
    assert.match(textOf(out), /Welcome to Pros-Link/);
    assert.match(textOf(out), /Pros-Link Assistant/);
    assert.deepEqual(ids(out), MAIN_MENU);
  });

  it("ends every sub-menu with Main Menu", async () => {
    const chat = new TestConversation();
    const out = await chat.tap("n:service");
    assert.deepEqual(ids(out), [
      "n:svc_installation", "n:svc_technical", "n:svc_maintenance", "n:svc_repair", "n:svc_request", "n:svc_parts", "n:svc_general", "a:main_menu",
    ]);
  });

  it("returns to the main menu on 'menu' and abandons an open flow", async () => {
    const chat = new TestConversation();
    await chat.tap("n:quote");
    assert.equal(chat.state.flow?.id, "quote");
    const out = await chat.send("menu");
    assert.equal(chat.state.flow, undefined);
    assert.deepEqual(ids(out), MAIN_MENU);
  });

  it("answers a stale button with the main menu instead of failing", async () => {
    const chat = new TestConversation();
    const out = await chat.tap("n:grow");
    assert.match(textOf(out), /isn't available any more/);
    assert.deepEqual(ids(out).slice(0, 10), MAIN_MENU);
  });

  it("says nothing while a person is handling the conversation", async () => {
    const chat = new TestConversation();
    chat.botPaused = true;
    assert.deepEqual(await chat.send("Hello, anyone there?"), []);
  });
});

describe("catalogue", () => {
  it("lists the active categories", async () => {
    const chat = new TestConversation();
    const out = await chat.tap("n:products");
    assert.deepEqual(ids(out), [
      "cat:digital-duplicators", "cat:photocopiers-mfps", "cat:printers", "cat:office-equipment", "cat:office-supplies",
      "cat:consumables", "cat:parts-accessories", "a:main_menu",
    ]);
    assert.ok(chat.events().includes("CATALOG_VIEWED"));
  });

  it("lists the published products in a category and shows one with its details", async () => {
    const chat = new TestConversation();
    let out = await chat.tap("cat:digital-duplicators");
    assert.deepEqual(ids(out), ["pr:prod_fixture", "a:get_quote"]);
    assert.equal(chat.details.productCategory, "digital-duplicators");
    assert.equal(chat.state.intent, "DIGITAL_DUPLICATOR");

    out = await chat.tap("pr:prod_fixture");
    const body = textOf(out);
    assert.match(body, /Fixture Duplicator/);
    assert.match(body, /Fixture spec: Fixture value/);
    assert.match(body, /Availability confirmed on request/);
    assert.deepEqual(ids(out), ["a:get_quote", "a:request_callback", "a:talk_to_sales"]);
    assert.equal(chat.details.productId, "prod_fixture");
    assert.ok(chat.events().includes("PRODUCT_VIEWED"));
  });

  it("offers a quotation instead of inventing products for an empty category", async () => {
    const chat = new TestConversation();
    const out = await chat.tap("cat:printers");
    assert.match(textOf(out), /\*Printers\* — our team will share the current range/);
    assert.deepEqual(ids(out), ["a:get_quote", "a:request_callback", "a:talk_to_sales"]);
  });

  it("copes with no categories at all", async () => {
    const chat = new TestConversation({ categories: [] });
    const out = await chat.tap("n:products");
    assert.match(textOf(out), /^our team will share the current range/m);
    assert.ok(ids(out).includes("a:get_quote"));
  });

  it("opens the matching category when asked for a product range in words", async () => {
    const chat = new TestConversation();
    const out = await chat.send("Show me your photocopier catalogue");
    assert.match(textOf(out), /Photocopiers \/ MFPs/);
    assert.equal(chat.details.productCategory, "photocopiers-mfps");
    assert.equal(chat.replies.length, 0);
  });

  it("shows the categories when asked what is sold", async () => {
    const chat = new TestConversation();
    const out = await chat.send("What do you sell?");
    assert.equal(ids(out)[0], "cat:digital-duplicators");
  });
});

describe("natural language", () => {
  it("answers a product question with the model and product next steps", async () => {
    const chat = new TestConversation();
    chat.aiReply = () => "Yes, we supply digital duplicators. Our sales team can recommend a model for your volume.";
    const out = await chat.send("Do you have digital duplicators for a school?");

    assert.equal(chat.replies[0].intent, "DIGITAL_DUPLICATOR");
    assert.equal(chat.details.productCategory, "digital-duplicators");
    assert.equal(chat.details.businessType, "Education");
    assert.match(textOf(out), /digital duplicators/);
    assert.deepEqual(ids(out), ["a:get_quote", "a:request_callback", "a:talk_to_sales"]);
  });

  it("never states a price itself and steers price questions to a quotation", async () => {
    const chat = new TestConversation();
    chat.aiReply = () => "Prices depend on the model and quantity, so our team prepares a quotation.";
    const out = await chat.send("What is the price of a photocopier?");
    assert.equal(chat.replies[0].intent, "PHOTOCOPIER");
    assert.equal(chat.replies[0].classification.request, "PRICING");
    assert.deepEqual(ids(out), ["a:get_quote", "a:request_callback", "a:talk_to_sales"]);
  });

  it("shows only prices the team has published", async () => {
    const config: BotConfig = structuredClone(DEFAULT_BOT_CONFIG);
    config.actions.see_prices = { title: { en: "See prices" }, do: { type: "pricing" } };
    const root = config.menu.nodes.root;
    if (root.kind === "menu") root.children.push("prices");
    config.menu.nodes.prices = { kind: "action", title: { en: "Prices" }, intent: "PHOTOCOPIER", do: { type: "pricing" } };

    const none = new TestConversation({ config });
    let out = await none.tap("n:prices");
    assert.match(textOf(out), /our team prepares a quotation for Photocopier/);
    assert.deepEqual(ids(out), ["a:get_quote", "a:request_callback", "a:talk_to_sales"]);

    config.pricing = [
      { id: "fixture", label: "Fixture", intents: ["PHOTOCOPIER"], summary: { en: "Fixture price published by the team." }, actions: ["get_quote"] },
    ];
    const published = new TestConversation({ config });
    out = await published.tap("n:prices");
    assert.match(textOf(out), /Fixture price published by the team/);
  });

  it("holds back buttons when the reply is waiting on an answer", async () => {
    const chat = new TestConversation();
    chat.aiReply = () => "Happy to help. How many pages do you print each month?";
    const out = await chat.send("I want a printer for my office");
    assert.equal(out.length, 1);
    assert.equal(out[0].type, "text");
  });

  it("offers the main menu when the model is unavailable", async () => {
    const chat = new TestConversation();
    chat.aiReply = () => "";
    const out = await chat.send("Tell me about your company");
    assert.match(textOf(out), /having trouble replying/);
    assert.deepEqual(ids(out), ["a:talk_to_person", "a:main_menu"]);
  });

  it("offers a person after repeated answers the assistant was unsure of", async () => {
    const chat = new TestConversation();
    chat.aiReply = () => "I'm not sure about that — I can connect you with our team.";
    await chat.send("Do you stock parts for a 1998 copier model?");
    const out = await chat.send("What about the fuser for it?");
    assert.match(textOf(out), /bring in someone from our team/);
  });

  it("starts a service request in Roman Urdu", async () => {
    const chat = new TestConversation({ language: "ur_roman" });
    const out = await chat.send("mera photocopier kharab ho gaya hai");
    assert.equal(chat.state.flow?.id, "service");
    assert.equal(chat.details.machineType, "Photocopier / MFP");
    assert.match(textOf(out), /Afsos hua/);
  });
});

describe("quote flow", () => {
  it("collects every field the sales team needs on the website", async () => {
    const chat = new TestConversation({ channel: "WEB" });

    let out = await chat.tap("n:quote");
    assert.match(textOf(out), /Happy to prepare a quotation/);
    assert.equal(ids(out)[0], "c:productCategory:0");

    await chat.tap("c:productCategory:1");
    assert.equal(chat.details.productCategory, "photocopiers-mfps");

    await chat.send("A3 colour copier for our accounts department");
    out = await chat.tap("c:quantity:1");
    assert.match(textOf(out), /May I have your name/);

    await chat.send("Sara Khan");
    await chat.send("Nova Traders");
    out = await chat.send("not a number");
    assert.match(textOf(out), /didn't quite catch that/);

    out = await chat.send("0300 1234567");
    assert.deepEqual(ids(out), ["q:whatsapp:0", "s:whatsapp"]);
    await chat.tap("q:whatsapp:0");
    await chat.tap("s:email");
    await chat.send("Lahore");
    out = await chat.tap("s:budget");
    assert.match(textOf(out), /How would you like us to contact you/);
    out = await chat.tap("c:preferredContact:1");

    assert.match(textOf(out), /Thank you\. Your request has been submitted to Pros-Link\./);
    assert.match(textOf(out), /PL-QTE-TEST/);
    assert.deepEqual(ids(out), ["a:explore_products", "a:track_request", "a:main_menu"]);
    assert.equal(chat.records.quote, "PL-QTE-TEST");
    assert.equal(chat.state.flow, undefined);

    const [quote] = chat.effectsOf("quote");
    assert.equal(quote.team, "SALES");
    assert.equal(quote.title, "Photocopiers / MFPs");
    assert.deepEqual(
      {
        name: quote.details.name,
        company: quote.details.company,
        phone: quote.details.phone,
        whatsapp: quote.details.whatsapp,
        city: quote.details.city,
        quantity: quote.details.quantity,
        preferredContact: quote.details.preferredContact,
        requirements: quote.details.requirements,
      },
      {
        name: "Sara Khan",
        company: "Nova Traders",
        phone: "0300 1234567",
        whatsapp: "0300 1234567",
        city: "Lahore",
        quantity: "2–5 units",
        preferredContact: "WhatsApp",
        requirements: "A3 colour copier for our accounts department",
      }
    );
    assert.ok(chat.effectsOf("sync").some((effect) => effect.force && effect.stage === "QUOTE_REQUESTED"));
    assert.ok(chat.events().includes("QUOTE_REQUESTED"));
    assert.ok(chat.events().includes("LEAD_CAPTURED"));
  });

  it("skips what WhatsApp already tells it and what the message said", async () => {
    const chat = new TestConversation({ profileName: "Adeel" });
    const out = await chat.send("I need a quotation for photocopiers");
    assert.equal(chat.state.flow?.id, "quote");
    assert.equal(chat.details.productCategory, "photocopiers-mfps");
    assert.equal(chat.state.flow?.pending, "requirements");
    assert.doesNotMatch(textOf(out), /Which product/);

    await chat.send("Two machines for the admin office");
    // The name is offered from the WhatsApp profile rather than asked for.
    const confirm = await chat.tap("c:quantity:1");
    assert.deepEqual(ids(confirm), ["y:name", "o:name"]);
    await chat.tap("y:name");
    assert.equal(chat.details.name, "Adeel");
    const asked = chat.sent.map((message) => textOf([message])).join("\n");
    assert.doesNotMatch(asked, /phone number/i);
  });

  it("answers a question in the middle of a flow and then resumes it", async () => {
    const chat = new TestConversation({ channel: "WEB" });
    await chat.tap("n:quote");
    await chat.tap("c:productCategory:0");
    await chat.send("For printing exam papers");
    chat.aiReply = () => "Yes, we deliver across Pakistan.";
    const out = await chat.send("Do you deliver to Quetta?");
    assert.match(chat.replies.at(-1)?.pendingQuestion ?? "", /How many/);
    assert.match(textOf(out), /deliver across Pakistan/);
    assert.match(textOf(out), /Coming back to where we were/);
    assert.equal(chat.state.flow?.pending, "quantity");
  });
});

describe("service requests", () => {
  it("opens a repair ticket with the machine details and a photo on WhatsApp", async () => {
    const chat = new TestConversation({ profileName: "Bilal" });
    let out = await chat.send("Our photocopier is not working, paper jam on every page");
    assert.equal(chat.state.flow?.id, "service");
    assert.match(textOf(out), /technician comes prepared/);
    assert.equal(chat.details.requirements, "Our photocopier is not working, paper jam on every page");

    await chat.tap("y:name");
    await chat.tap("s:company");
    await chat.send("Multan");
    await chat.tap("q:machineBrand:0");
    await chat.send("FX-1");
    await chat.tap("q:serialNumber:0");
    out = await chat.tap("c:priority:0");
    await chat.tap("s:visitSlot");
    out = await chat.upload();

    assert.match(textOf(out), /attached that for our team/);
    assert.match(textOf(out), /Your service request has been logged/);
    assert.match(textOf(out), /PL-TKT-TEST/);
    assert.equal(chat.records.ticket, "PL-TKT-TEST");

    const [ticket] = chat.effectsOf("ticket");
    assert.equal(ticket.context.supportCategory, "REPAIR");
    assert.equal(ticket.team, "SERVICE");
    assert.equal(ticket.details.machineType, "Photocopier / MFP");
    assert.equal(ticket.details.machineBrand, "Not sure");
    assert.equal(ticket.details.machineModel, "FX-1");
    assert.equal(ticket.details.city, "Multan");
    assert.equal(ticket.details.priority, "URGENT");
    assert.ok(ticket.since, "media sent during the flow is attached");
    assert.ok(ticket.handover, "a machine that has stopped goes straight to the team");
    assert.ok(chat.events().includes("TICKET_CREATED"));
    assert.ok(chat.events().includes("ATTACHMENT_RECEIVED"));

    out = await chat.upload({ id: "media-2", type: "document", mime: "application/pdf" });
    assert.deepEqual(chat.effectsOf("attach").map((effect) => effect.ticketReference), ["PL-TKT-TEST"]);
    assert.match(textOf(out), /PL-TKT-TEST/);
  });

  it("does not ask for a photo on the website", async () => {
    const chat = new TestConversation({ channel: "WEB" });
    await chat.tap("n:svc_maintenance");
    await chat.tap("c:machineType:2");
    await chat.send("Needs routine servicing and cleaning");
    await chat.send("Ali Raza");
    await chat.tap("s:company");
    await chat.send("0321 7654321");
    await chat.send("Karachi");
    await chat.tap("q:machineBrand:0");
    await chat.tap("q:machineModel:0");
    await chat.tap("q:serialNumber:0");
    await chat.tap("c:priority:2");
    const out = await chat.tap("s:visitSlot");

    assert.match(textOf(out), /Your service request has been logged/);
    const [ticket] = chat.effectsOf("ticket");
    assert.equal(ticket.context.supportCategory, "MAINTENANCE");
    assert.equal(ticket.details.machineType, "Printer");
    assert.equal(ticket.details.phone, "0321 7654321");
    assert.equal(ticket.handover, undefined);
  });

  it("never confirms a request that could not be saved, and retries on the next message", async () => {
    const chat = new TestConversation({ profileName: "Bilal" });
    chat.failing.add("ticket");
    await chat.tap("n:svc_general");
    await chat.send("Need help with a scanning setting");
    await chat.tap("y:name");
    await chat.tap("s:company");
    let out = await chat.tap("s:email");

    assert.match(textOf(out), /hasn't been submitted yet/);
    assert.doesNotMatch(textOf(out), /registered|logged/);
    assert.deepEqual(ids(out), ["a:talk_to_person", "a:main_menu"]);
    assert.ok(!chat.events().includes("TICKET_CREATED"));
    assert.equal(chat.records.ticket, undefined);
    assert.equal(chat.state.flow?.id, "support");

    chat.failing.clear();
    out = await chat.send("please try again");
    assert.match(textOf(out), /your request has been registered/);
    assert.equal(chat.records.ticket, "PL-TKT-TEST");
  });

  it("tells the customer a photo reached the team when there is nothing to attach it to", async () => {
    const chat = new TestConversation();
    const out = await chat.upload();
    assert.match(textOf(out), /can't open files myself/);
    assert.equal(chat.effectsOf("attach").length, 0);
  });
});

describe("tracking", () => {
  it("finds a request by the reference in a message, checked against the WhatsApp number", async () => {
    const chat = new TestConversation();
    const out = await chat.send(`What's the status of ${KNOWN_REQUEST.reference}?`);
    assert.match(textOf(out), /PL-TKT-7F3K2Q9A/);
    assert.match(textOf(out), /Service ticket: \*Technician Dispatched\*/);
    assert.ok(chat.events().includes("TRACK_REQUESTED"));
  });

  it("does not reveal a request to another number", async () => {
    const chat = new TestConversation({ phone: "+923339999999" });
    const out = await chat.send(`Status of ${KNOWN_REQUEST.reference}`);
    assert.match(textOf(out), /couldn't find a request/);
    assert.doesNotMatch(textOf(out), /Technician Dispatched/);
  });

  it("asks the website visitor for the reference and the phone number used", async () => {
    const chat = new TestConversation({ channel: "WEB" });
    let out = await chat.tap("n:track");
    assert.match(textOf(out), /reference number/);
    out = await chat.send("pl-tkt-7f3k2q9a");
    assert.match(textOf(out), /phone number you used/);
    out = await chat.send("0300-1234567");
    assert.match(textOf(out), /Technician Dispatched/);
  });
});

describe("people and corporate customers", () => {
  it("asks which team when someone wants a person without saying why", async () => {
    const chat = new TestConversation();
    const out = await chat.send("I want to talk to a person");
    assert.deepEqual(ids(out), [
      "n:expert_sales", "n:expert_corporate", "n:expert_service", "n:expert_support", "n:expert_parts", "n:expert_accounts", "a:main_menu",
    ]);
  });

  it("hands over to sales once and does not open a second ticket", async () => {
    const chat = new TestConversation();
    let out = await chat.tap("n:sales");
    assert.match(textOf(out), /passed your conversation to our \*Sales\* team/);
    assert.match(textOf(out), /PL-TKT-HAND/);
    assert.equal(chat.effectsOf("handover").length, 1);

    out = await chat.tap("n:sales");
    assert.match(textOf(out), /already with our \*Sales\* team/);
    assert.equal(chat.effectsOf("handover").length, 1);
  });

  it("hands an upset customer to a person instead of answering", async () => {
    const chat = new TestConversation();
    await chat.send("This is useless, worst service ever");
    assert.equal(chat.replies.length, 0);
    assert.equal(chat.effectsOf("handover").length, 1);
  });

  it("switches to corporate mode for a large organisation", async () => {
    const chat = new TestConversation();
    const out = await chat.send("We need photocopiers for our bank, around 300 employees");
    assert.equal(chat.state.signals.enterprise, true);
    assert.equal(chat.state.team, "CORPORATE");
    const [handover] = chat.effectsOf("handover");
    assert.equal(handover.silent, true);
    assert.equal(handover.summary.team, "CORPORATE");
    assert.match(textOf(out), /corporate or bulk requirement/);
    assert.deepEqual(ids(out), ["a:corporate_requirements", "a:request_callback", "a:talk_to_sales"]);
  });

  it("takes a callback request", async () => {
    const chat = new TestConversation({ profileName: "Hina" });
    await chat.send("Please call me back about toner");
    assert.equal(chat.state.flow?.id, "callback");
    await chat.tap("y:name");
    await chat.tap("s:company");
    const out = await chat.tap("s:requirements");
    assert.match(textOf(out), /our team will call you back/);
    assert.match(textOf(out), /PL-LEAD-TEST/);
    assert.ok(chat.events().includes("CALL_REQUESTED"));
  });

  it("shows only the contact details in the company profile", async () => {
    const none = new TestConversation();
    let out = await none.tap("n:contact");
    assert.match(textOf(out), /reach our team right here/);
    assert.doesNotMatch(textOf(out), /📞|✉️/);

    const listed = new TestConversation({
      company: { phone: "+92 00 0000000", whatsapp: "", email: "team@example.test", website: "", address: "", hours: "", offices: [] },
    });
    out = await listed.tap("n:contact");
    assert.match(textOf(out), /📞 \+92 00 0000000/);
    assert.match(textOf(out), /✉️ team@example\.test/);
    assert.doesNotMatch(textOf(out), /WhatsApp:/);
  });
});

describe("subscriptions", () => {
  it("opts a WhatsApp customer out and back in", async () => {
    const chat = new TestConversation();
    let out = await chat.send("stop");
    assert.equal(chat.optedOut, true);
    assert.match(textOf(out), /won't receive promotional messages/);

    out = await chat.send("start");
    assert.equal(chat.optedOut, false);
    assert.deepEqual(ids(out), MAIN_MENU);
  });

  it("does not treat 'stop' on the website as an opt-out", async () => {
    const chat = new TestConversation({ channel: "WEB" });
    await chat.send("stop");
    assert.equal(chat.effectsOf("optOut").length, 0);
  });

  it("does not opt out a customer describing a fault", async () => {
    const chat = new TestConversation();
    await chat.send("my printer won't stop jamming");
    assert.equal(chat.effectsOf("optOut").length, 0);
    assert.equal(chat.state.flow?.id, "service");
  });
});

describe("languages", () => {
  it("offers Roman Urdu buttons to a customer writing in Roman Urdu", async () => {
    const chat = new TestConversation({ language: "ur_roman" });
    const out = await chat.send("salam");
    assert.ok(titles(out).includes("Quotation Lein"));
  });
});
