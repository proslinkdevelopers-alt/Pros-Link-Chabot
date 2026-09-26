import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BOT_CONFIG } from "@/data/bot";
import { DEFAULT_KNOWLEDGE } from "@/data/knowledge";
import { findReference } from "@/lib/ai/customer";
import { retrieveKnowledge } from "@/lib/ai/knowledge";
import { acceptText, matchOption } from "../engine";
import { classify, detectEnterprise, detectIndustry, isFrustrated, isGreetingOnly, isOptOut, isQuestion, wantsHuman } from "../detect";
import { isOpen, nextOpening } from "../hours";
import { clampText, offer } from "../render";
import { botConfigSchema, crossReferenceIssues, sectionSchemas } from "../schema";
import { budgetInPkr, quantityCount, scoreLead, temperatureFor } from "../scoring";
import { attribute, stripRefCode } from "../source";
import { machineLine } from "../summary";
import { fill, pick } from "../text";
import { emptyBotState, readBotState } from "../types";

const config = DEFAULT_BOT_CONFIG;

describe("default configuration", () => {
  it("passes its own schema with no dangling references", () => {
    const parsed = botConfigSchema.safeParse(config);
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3)));
    assert.deepEqual(crossReferenceIssues(parsed.data), []);
  });

  it("keeps every title inside WhatsApp's limits", () => {
    for (const [id, node] of Object.entries(config.menu.nodes)) {
      for (const title of Object.values(node.title)) assert.ok(!title || title.length <= 24, `${id}: ${title}`);
    }
    for (const [id, action] of Object.entries(config.actions)) {
      for (const title of Object.values(action.title)) assert.ok(!title || title.length <= 20, `${id}: ${title}`);
    }
  });

  it("publishes no prices, references or reviews until the team enters them", () => {
    assert.deepEqual(config.pricing, []);
    assert.deepEqual(config.proof, { references: [], installations: [], reviews: [] });
  });

  it("contains no phone numbers, email addresses or web addresses of its own", () => {
    const everything = JSON.stringify(config);
    assert.doesNotMatch(everything, /(?:\+92|\b03\d{2})[\s-]?\d{3}/);
    assert.doesNotMatch(everything, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    assert.doesNotMatch(everything, /https?:\/\//);
  });

  it("carries nothing from the platform it replaced", () => {
    const everything = [JSON.stringify(config), JSON.stringify(DEFAULT_KNOWLEDGE)].join("\n").toLowerCase().replaceAll("of course", "");
    for (const word of ["bitsol", "whatbot", "conversiq", "seo", "google ads", "n8n", "course", "admission", "web development"]) {
      assert.ok(!everything.includes(word), `found "${word}"`);
    }
  });

  it("rejects a section with a broken value", () => {
    const result = sectionSchemas.businessHours.safeParse({ timezone: "Asia/Karachi", days: [1], open: "25:00", close: "18:00" });
    assert.equal(result.success, false);
  });
});

describe("classification", () => {
  const cases: Array<[string, string, string | undefined, string | undefined]> = [
    ["Do you have digital duplicators?", "DIGITAL_DUPLICATOR", "DIGITAL_DUPLICATOR", undefined],
    ["I need a quotation for 5 photocopiers", "QUOTE", "PHOTOCOPIER", "QUOTE"],
    ["What is the price of a laser printer?", "PRINTER", "PRINTER", "PRICING"],
    ["Our copier is showing an error code and paper jam", "SERVICE_REQUEST", "PHOTOCOPIER", "SERVICE_REQUEST"],
    ["mera printer kharab ho gaya hai", "SERVICE_REQUEST", "PRINTER", "SERVICE_REQUEST"],
    ["toner cartridges chahiye", "CONSUMABLES", "CONSUMABLES", undefined],
    ["We need A4 paper and stationery for the office", "OFFICE_SUPPLIES", "OFFICE_SUPPLIES", undefined],
    ["Do you have stationries?", "OFFICE_SUPPLIES", "OFFICE_SUPPLIES", undefined],
    ["Can you install the machine next week?", "INSTALLATION", "INSTALLATION", undefined],
    ["We want an annual maintenance contract", "MAINTENANCE", "MAINTENANCE", undefined],
    ["What is the status of PL-TKT-7F3K2Q9A", "TRACK_REQUEST", undefined, "TRACK_REQUEST"],
    ["Please call me back", "CALLBACK", undefined, "CALLBACK"],
    ["My invoice is wrong", "BILLING", undefined, "BILLING"],
    ["Are you hiring? I want to send my CV", "CAREER", undefined, "CAREER"],
    ["We want to become a dealer", "PARTNERSHIP", undefined, "PARTNERSHIP"],
    ["فوٹو کاپی مشین کی قیمت کیا ہے", "PHOTOCOPIER", "PHOTOCOPIER", "PRICING"],
    ["Hello, tell me about your company", "GENERAL_INQUIRY", undefined, undefined],
  ];
  for (const [message, primary, service, request] of cases) {
    it(message, () => {
      const result = classify(message, config);
      assert.equal(result.primary, primary);
      assert.equal(result.service, service);
      assert.equal(result.request, request);
    });
  }

  it("treats photocopy paper as supplies, not a photocopier", () => {
    assert.equal(classify("We need photocopy paper", config).service, "OFFICE_SUPPLIES");
  });

  it("adds keywords configured by an administrator", () => {
    const custom = structuredClone(config);
    custom.intents.OFFICE_EQUIPMENT!.keywords = ["currency counter"];
    assert.equal(classify("Do you sell a currency counter", custom).primary, "OFFICE_EQUIPMENT");
  });
});

describe("conversation signals", () => {
  it("detects requests for a person without tripping on job titles", () => {
    assert.ok(wantsHuman("Can I talk to someone?"));
    assert.ok(wantsHuman("kisi insaan se baat karwao"));
    assert.ok(!wantsHuman("I am the office manager"));
    assert.ok(!wantsHuman("please call me back"));
  });

  it("detects frustration in English and Roman Urdu", () => {
    assert.ok(isFrustrated("this is a scam"));
    assert.ok(isFrustrated("bilkul bakwas service hai"));
  });

  it("only treats short, unambiguous messages as opt-outs", () => {
    assert.ok(isOptOut("STOP"));
    assert.ok(isOptOut("message mat karo"));
    assert.ok(!isOptOut("my printer won't stop jamming"));
    assert.ok(!isOptOut("dont stop"));
  });

  it("recognises greetings and questions", () => {
    assert.ok(isGreetingOnly("Assalam o Alaikum"));
    assert.ok(isGreetingOnly("hi there!"));
    assert.ok(isGreetingOnly("Hello Pros-Link"));
    assert.ok(!isGreetingOnly("hi I need a printer"));
    assert.ok(isQuestion("Do you deliver to Quetta"));
    assert.ok(isQuestion("price?"));
    assert.ok(!isQuestion("Nova Traders"));
  });

  it("labels industries", () => {
    assert.equal(detectIndustry("we run a school in Lahore"), "Education");
    assert.equal(detectIndustry("a microfinance bank"), "Banking & finance");
    assert.equal(detectIndustry("Just looking"), undefined);
  });

  it("detects corporate buyers by headcount, branches and phrasing", () => {
    const rules = config.enterprise;
    assert.ok(detectEnterprise("We have 500 employees.", undefined, rules).enterprise);
    assert.equal(detectEnterprise("we have 1.2k staff", undefined, rules).reason, "1.2k staff");
    assert.ok(detectEnterprise("We operate 12 branches across Pakistan", undefined, rules).enterprise);
    assert.ok(detectEnterprise("This is for a government tender", undefined, rules).enterprise);
    assert.ok(detectEnterprise("tell me more", "More than 20 branches", rules).enterprise);
    assert.ok(!detectEnterprise("tell me more", "Single office", rules).enterprise);
    assert.ok(!detectEnterprise("We are a team of 8 people", undefined, rules).enterprise);
  });
});

describe("scoring", () => {
  it("reads budgets in rupees", () => {
    assert.equal(budgetInPkr("Rs 3 lakh"), 300_000);
    assert.equal(budgetInPkr("PKR 2.5M"), 2_500_000);
    assert.equal(budgetInPkr("500k"), 500_000);
    assert.equal(budgetInPkr("Not sure"), null);
  });

  it("reads quantities", () => {
    assert.equal(quantityCount("2–5 units"), 5);
    assert.equal(quantityCount("about 12 machines"), 12);
    assert.equal(quantityCount("Not sure"), null);
  });

  it("applies the bands", () => {
    assert.equal(temperatureFor(30, config.scoring.bands), "COLD");
    assert.equal(temperatureFor(31, config.scoring.bands), "WARM");
    assert.equal(temperatureFor(61, config.scoring.bands), "HOT");
    assert.equal(temperatureFor(81, config.scoring.bands), "HIGH_PRIORITY");
  });

  it("scores a large, urgent corporate order as high priority", () => {
    const state = emptyBotState();
    state.signals = { enterprise: true, wantsCall: true, wantsDemo: true };
    const score = scoreLead(
      {
        company: "Example Group",
        productCategory: "photocopiers-mfps",
        quantity: "More than 20 units",
        budget: "Above Rs 2,000,000",
        timeline: "Immediately",
      },
      state,
      config
    );
    assert.equal(score.value, 100);
    assert.equal(score.temperature, "HIGH_PRIORITY");
    assert.equal(score.reasons.length, 10);
  });

  it("does not reward unsure answers", () => {
    const score = scoreLead({ quantity: "Not sure", budget: "Not sure" }, emptyBotState(), config);
    assert.equal(score.value, 0);
  });
});

describe("attribution", () => {
  it("attributes a click-to-WhatsApp ad", () => {
    const result = attribute(
      { text: "Hi", referral: { source_type: "ad", source_id: "120200", headline: "Office printers" } },
      config.sources
    );
    assert.deepEqual([result.source, result.adId, result.campaign], ["META_ADS", "120200", "Office printers"]);
  });

  it("reads and strips a ref code", () => {
    const text = "Hi ref:qr:expo24 I need a quotation";
    const result = attribute({ text }, config.sources);
    assert.deepEqual([result.source, result.campaign], ["QR_CODE", "expo24"]);
    assert.equal(stripRefCode(text), "Hi I need a quotation");
  });

  it("attributes a reply to a recent broadcast, and falls back to direct", () => {
    assert.equal(attribute({ text: "yes", recentBroadcast: { title: "Toner offer", reference: "B1" } }, config.sources).source, "BROADCAST");
    assert.equal(attribute({ text: "hello" }, config.sources).source, "DIRECT_WHATSAPP");
  });
});

describe("rendering", () => {
  const options = { listButton: "View options", moreTitle: "More options" };

  it("uses buttons for up to three short choices and a list otherwise", () => {
    const three = offer("Pick", [1, 2, 3].map((n) => ({ id: `${n}`, title: `Option ${n}` })), options);
    assert.equal(three[0].type, "buttons");
    const four = offer("Pick", [1, 2, 3, 4].map((n) => ({ id: `${n}`, title: `Option ${n}` })), options);
    assert.equal(four[0].type, "list");
  });

  it("pages a long list, nine rows and 'More options' at a time", () => {
    const choices = Array.from({ length: 12 }, (_, n) => ({ id: `${n}`, title: `Option ${n}` }));
    const [first] = offer("Pick", choices, { ...options, pageId: (page) => `page:${page}` });
    assert.equal(first.type, "list");
    if (first.type !== "list") return;
    assert.equal(first.rows.length, 10);
    assert.equal(first.rows[9].id, "page:1");
  });

  it("moves a long body into its own message", () => {
    const out = offer("x".repeat(1500), [{ id: "a", title: "A" }], options);
    assert.deepEqual(out.map((message) => message.type), ["text", "buttons"]);
  });

  it("never splits an emoji when shortening a title", () => {
    const clamped = clampText("🧰 Installation and technical support", 20);
    assert.ok(clamped.startsWith("🧰"));
    assert.ok(clamped.length <= 20);
    assert.ok(!/[\uD800-\uDBFF]…$/.test(clamped));
  });
});

describe("text", () => {
  it("drops optional segments whose placeholders are empty", () => {
    assert.equal(fill("Thanks[[, {name}]]!", { name: "Sara" }), "Thanks, Sara!");
    assert.equal(fill("Thanks[[, {name}]]!", {}), "Thanks!");
  });

  it("falls back from Urdu script to Roman Urdu before English", () => {
    assert.equal(pick({ en: "Hello", ur_roman: "Salam" }, "ur"), "Salam");
    assert.equal(pick({ en: "Hello" }, "pa"), "Hello");
  });

  it("reads stored state defensively", () => {
    const state = readBotState({ flow: { id: "quote" }, trail: ["a", 3] });
    assert.deepEqual(state.trail, ["a"]);
    assert.deepEqual(state.signals, {});
    assert.equal(readBotState({ flow: { id: "consultation" } }).flow, undefined);
  });

  it("summarises a machine without placeholder answers", () => {
    assert.equal(
      machineLine({ machineType: "Printer", machineBrand: "Not sure", machineModel: "FX-1", serialNumber: "Not available" }),
      "Printer · FX-1"
    );
  });
});

describe("answers", () => {
  it("matches typed options by number, value and title", () => {
    const options = config.options.timelines;
    assert.equal(matchOption("1", options, "en")?.value, "Immediately");
    assert.equal(matchOption("just exploring", options, "en")?.value, "Just exploring");
    assert.equal(matchOption("foran", options, "ur_roman")?.value, "Immediately");
    assert.equal(matchOption("next year", options, "en"), undefined);
  });

  it("validates typed answers", () => {
    assert.equal(acceptText("name", "My name is Sara Khan"), "Sara Khan");
    assert.equal(acceptText("name", "call me on 0300 1234567"), null);
    assert.equal(acceptText("phone", "0300 1234567"), "0300 1234567");
    assert.equal(acceptText("phone", "12345"), null);
    assert.equal(acceptText("email", "Sara@Example.test"), "sara@example.test");
    assert.equal(acceptText("trackingReference", "it is pl-qte-7f3k2q9a"), "PL-QTE-7F3K2Q9A");
    assert.equal(acceptText("trackingReference", "no idea"), null);
  });

  it("finds a reference number in a sentence", () => {
    assert.equal(findReference("Any update on PL-TKT-7F3K2Q9A please"), "PL-TKT-7F3K2Q9A");
    assert.equal(findReference("my number is 0300 1234567"), undefined);
  });
});

describe("knowledge", () => {
  it("retrieves the relevant seed entries for a question", () => {
    const results = retrieveKnowledge("do you provide installation and maintenance", DEFAULT_KNOWLEDGE, 3);
    assert.ok(results.length > 0);
    assert.ok(results.every((entry) => entry.id.startsWith("pl-")));
  });
});

describe("business hours", () => {
  const hours = { timezone: "Asia/Karachi", days: [1, 2, 3, 4, 5, 6], open: "09:00", close: "18:00" };

  it("is always open until hours are configured", () => {
    assert.ok(isOpen(null, new Date("2026-09-13T20:00:00Z")));
  });

  it("is open on a weekday afternoon in Pakistan and closed on Sunday", () => {
    assert.ok(isOpen(hours, new Date("2026-09-14T08:00:00Z")));
    assert.ok(!isOpen(hours, new Date("2026-09-13T08:00:00Z")));
    assert.equal(nextOpening(hours, new Date("2026-09-14T03:00:00Z")), "today at 09:00");
  });
});
