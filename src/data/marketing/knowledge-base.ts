import type { KnowledgeEntry } from "@/types";
import { BRAND as brand } from "@/config/brand";
import { MARKETING_SERVICES } from "./services";

/**
 * =============================================================================
 *  BITSOL Marketing — knowledge base
 * =============================================================================
 *
 *  The assistant answers from this content first and only falls back to
 *  general model knowledge when nothing matches.
 *
 *  Two sources make up the base:
 *    1. Hand-written company entries below (about, process, pricing, support…)
 *    2. Auto-derived entries, one per service, built from the catalogue so a
 *       service edit updates the assistant's answers in exactly one place.
 *
 *  Seeded into `knowledge_base_marketing` and editable from Admin → Knowledge
 *  Base thereafter.
 * =============================================================================
 */

const COMPANY_ENTRIES: KnowledgeEntry[] = [
  {
    id: "mk-about",
    kind: "ARTICLE",
    category: "About",
    question: "What is BITSOL Marketing and what do you do?",
    answer: `${brand.description}\n\nWe work across four areas: **AI & Automation**, **WhatsApp Solutions**, **Digital Marketing & Growth** and **Websites & Software**. Practically, that means AI agents and chatbots, WhatsApp automation and our WhatBot Pro platform, lead generation, SEO and paid advertising, websites, mobile apps, CRM and custom software, UI/UX and branding. We are based in  and serve businesses internationally.`,
    keywords: ["about", "who are you", "company", "bitsol marketing", "what do you do", "introduction"],
  },
  {
    id: "mk-why-us",
    kind: "ARTICLE",
    category: "About",
    question: "Why should we choose BITSOL Marketing?",
    answer:
      "Three reasons clients give us:\n\n1. **We build and market.** Most agencies do one or the other. We can design your brand, build the software, and then run the campaigns that fill it — so nothing falls between vendors.\n2. **AI is our core, not an add-on.** We ship production AI systems, so automation advice comes from delivery experience rather than a sales deck.\n3. **You own everything.** Source code, design files, ad accounts and data stay yours. No lock-in.\n\nWe also report honestly — including when something isn't working.",
    keywords: ["why", "why choose", "different", "better", "competitors", "advantage"],
  },
  {
    id: "mk-services-overview",
    kind: "SERVICE",
    category: "Services",
    question: "What services does BITSOL Marketing offer?",
    answer: `We offer:\n\n**AI & Automation** — AI Agents, AI Chatbots, AI Sales Agents, AI Customer Support, n8n and workflow automation, CRM automation\n**WhatsApp Solutions** — WhatsApp AI chatbots, WhatBot Pro, team inbox, broadcasts, WhatsApp Cloud API\n**Marketing & Growth** — Lead Generation, SEO, Meta Ads, Google Ads, TikTok, LinkedIn, Social Media, Content\n**Brand & Design** — Branding, UI/UX Design\n**Engineering** — Websites, E-commerce, Web Applications, Mobile Apps, CRM and Custom Software\n\nAsk about any one of these and I'll walk you through what it does, who it's for and how it would work for your business — and I can book you a consultation or prepare a quote request.`,
    keywords: ["services", "what do you offer", "list", "solutions", "offerings", "menu"],
  },
  {
    id: "mk-process",
    kind: "ARTICLE",
    category: "How we work",
    question: "How does the process work from first contact to delivery?",
    answer:
      "1. **Discovery call (free)** — 30 minutes to understand your goal, current setup and constraints.\n2. **Proposal & quote** — scope, deliverables, timeline and a fixed price, usually within 2–3 working days.\n3. **Kickoff** — advance payment, project channel opened, milestones agreed.\n4. **Delivery in milestones** — you review and approve at each stage rather than at the end.\n5. **Launch & handover** — files, access, training and documentation transferred to you.\n6. **Support** — an optional monthly care or retainer plan.\n\nYou get a named point of contact throughout.",
    keywords: ["process", "how it works", "steps", "workflow", "procedure", "how do you work", "timeline"],
  },
  {
    id: "mk-pricing",
    kind: "POLICY",
    category: "Pricing",
    question: "How much do your services cost?",
    answer:
      "Pricing depends on scope, integrations and timeline, so we quote each project after understanding the requirement rather than working from a fixed rate card. The only standard prices we publish are listed under *Published pricing*. For anything else, share a few details and our team will prepare an exact quote.",
    keywords: ["price", "pricing", "cost", "rate", "how much", "budget", "charges", "fees", "quotation"],
  },
  {
    id: "mk-payment-terms",
    kind: "POLICY",
    category: "Pricing",
    question: "What are your payment terms?",
    answer:
      "Projects typically run on a milestone schedule — an advance to begin, one or more progress payments, and a balance on delivery. Monthly services (marketing, SEO, care plans) are billed in advance each month. We accept bank transfer and can invoice international clients. Exact terms are confirmed in your written quotation before any work starts.",
    keywords: ["payment", "advance", "instalment", "installment", "invoice", "terms", "billing", "bank"],
  },
  {
    id: "mk-quote",
    kind: "ARTICLE",
    category: "Quote",
    question: "How do I request a quote?",
    answer:
      "Tell me what you need. I'll ask a few quick questions — your business, the service, your goal, timeline and budget range — then pass it to our team with a reference number. They review the requirement and send a written quotation.",
    keywords: ["quote", "quotation", "estimate", "proposal", "pricing request", "request quote"],
  },
  {
    id: "mk-consultation",
    kind: "ARTICLE",
    category: "Consultation",
    question: "Can I book a consultation or meeting?",
    answer: `Yes — the first consultation is free. Choose whichever suits you: **office visit** in , **Zoom**, **Google Meet** or a **WhatsApp call**. I'll take your name, phone, email, business name, preferred date and time, then confirm the booking with a reference number. Our office hours are .`,
    keywords: ["meeting", "consultation", "book", "appointment", "call", "zoom", "google meet", "visit", "schedule"],
  },
  {
    id: "mk-contact",
    kind: "ARTICLE",
    category: "Contact",
    question: "How do I contact BITSOL Marketing?",
    answer: `**WhatsApp:** \n**Phone:** \n**Email:** \n**Office:** , \n**Hours:** \n**Website:** \n\nYou can also carry on right here — I can capture your requirement, book a meeting or raise a support ticket without you needing to call.`,
    keywords: ["contact", "phone", "number", "email", "address", "location", "office", "reach", "call", "whatsapp"],
  },
  {
    id: "mk-support",
    kind: "ARTICLE",
    category: "Support",
    question: "I need support with an existing project or service.",
    answer:
      "I can raise a support ticket right now. We handle five categories: **Technical Support**, **Billing**, **Sales**, **Complaint** and **General Inquiry**. Tell me which fits and describe the issue — I'll generate a ticket reference and route it to the right team. Urgent production issues are prioritised.",
    keywords: ["support", "help", "issue", "problem", "ticket", "complaint", "not working", "bug", "billing"],
  },
  {
    id: "mk-portfolio",
    kind: "ARTICLE",
    category: "Portfolio",
    question: "Can I see your portfolio or past work?",
    answer:
      "We'd rather show you work that's relevant to your business than generic claims. Tell me your industry and the service you're interested in, and our team will walk you through relevant projects and results on a free strategy call. Case studies the team has published are listed under *Our Work & Results* in the WhatsApp menu.",
    keywords: ["portfolio", "work", "case study", "projects", "examples", "clients", "previous work", "samples"],
  },
  {
    id: "mk-reviews",
    kind: "ARTICLE",
    category: "Portfolio",
    question: "What do your clients say about you?",
    answer:
      "Our team can share client references relevant to your industry on a strategy call. I won't quote reviews here that I can't show you in full.",
    keywords: ["reviews", "testimonials", "feedback", "rating", "clients say", "references"],
  },
  {
    id: "mk-timeline",
    kind: "ARTICLE",
    category: "How we work",
    question: "How long do projects take?",
    answer:
      "Typical delivery windows:\n\n- Website — 3–6 weeks\n- WhatsApp automation — 2–4 weeks\n- AI chatbot — 2–6 weeks depending on integrations\n- Brand identity — 3–5 weeks\n- Mobile app — 8–16 weeks\n- Custom software — 10–24 weeks depending on scope\n- Marketing/SEO — ongoing monthly, with first results in weeks 4–8\n\nRush delivery is sometimes possible for an agreed premium. Your quotation confirms the exact schedule.",
    keywords: ["how long", "duration", "timeline", "delivery time", "when", "deadline", "fast", "urgent"],
  },
  {
    id: "mk-ownership",
    kind: "POLICY",
    category: "How we work",
    question: "Who owns the code, designs and accounts?",
    answer:
      "You do. On final payment we transfer full intellectual property — source code, repositories, design source files, brand assets and documentation. Ad accounts, hosting, domains and business tool accounts are created in your name from the start wherever possible, so you are never locked in.",
    keywords: ["ownership", "own", "ip", "intellectual property", "source code", "rights", "handover", "transfer"],
  },
  {
    id: "mk-industries",
    kind: "ARTICLE",
    category: "About",
    question: "Which industries do you work with?",
    answer:
      "Our growth, automation and software systems are built for businesses of any industry — real estate, healthcare and clinics, e-commerce and retail, hospitality, professional services, manufacturing and more. What changes between industries is the research and the messaging, which we do at the start of every engagement. Tell me yours and I'll explain how it would apply.",
    keywords: ["industry", "industries", "sector", "niche", "who do you work with", "experience"],
  },
  {
    id: "mk-individual-courses",
    kind: "ARTICLE",
    category: "About",
    question: "Do you offer courses or classes?",
    answer:
      "No — BITSOL Marketing is a growth and digital transformation agency, so we don't offer courses, classes or enrolment. What we do is build and run AI, WhatsApp, marketing and software systems for businesses. If that's useful, I'd be glad to help with any of those.",
    keywords: ["course", "courses", "learn", "training for me", "student", "admission", "institute", "classes", "teach"],
  },
];

/** One knowledge entry per service, derived from the catalogue. */
const SERVICE_ENTRIES: KnowledgeEntry[] = MARKETING_SERVICES.map((service) => ({
  id: `mk-service-${service.slug}`,
  kind: "SERVICE" as const,
  category: "Services",
  question: `Tell me about ${service.name}.`,
  answer: [
    `**${service.name}** — ${service.tagline}`,
    "",
    `**Overview**\n${service.overview}`,
    "",
    `**Benefits**\n${service.benefits.map((b) => `- ${b}`).join("\n")}`,
    "",
    `**What's included**\n${service.features.map((f) => `- ${f}`).join("\n")}`,
    "",
    `**Our process**\n${service.process.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
    "",
    // No prices and no portfolio here: the assistant quotes only the published
    // pricing in the chatbot configuration, and names no work it cannot verify.
    `**Pricing**\nQuoted by our team after reviewing scope — ${service.pricing.model.toLowerCase()}.`,
    "",
    `**FAQs**\n${service.faqs.map((f) => `**${f.question}**\n${f.answer}`).join("\n\n")}`,
  ].join("\n"),
  keywords: [service.slug.replace(/-/g, " "), service.name.toLowerCase(), ...service.keywords],
}));

export const MARKETING_KNOWLEDGE_BASE: KnowledgeEntry[] = [
  ...COMPANY_ENTRIES,
  ...SERVICE_ENTRIES,
];

/** Categories surfaced to the model as its scope statement. */
export const MARKETING_KB_CATEGORIES = Array.from(
  new Set(MARKETING_KNOWLEDGE_BASE.map((e) => e.category))
);
