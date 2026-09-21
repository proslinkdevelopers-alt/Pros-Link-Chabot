import { BRAND } from "@/config/brand";
import type { KnowledgeSeed } from "./types";

/** Quotations, demonstrations, corporate orders and dealers. */
export const SALES: KnowledgeSeed[] = [
  {
    id: "pl-sales-quote",
    kind: "FAQ",
    category: "Sales",
    question: "How do I request a quotation?",
    answer: `Tap Request a Quote. The assistant asks what you need, how many, your city and how you'd like to be contacted, then logs a quote request with a reference number. The ${BRAND.name} sales team prepares the quotation and contacts you.`,
    keywords: ["quote", "quotation", "estimate", "proposal", "rfq", "offer"],
  },
  {
    id: "pl-sales-demo",
    kind: "FAQ",
    category: "Sales",
    question: "Can I see a demonstration?",
    answer: "You can ask for one: tap Book a Demo and choose a visit at your office, a phone call or a WhatsApp call, with a day and time that suit you. The team confirms the appointment — it isn't booked until they do.",
    keywords: ["demo", "demonstration", "see the machine", "trial", "show"],
  },
  {
    id: "pl-sales-corporate",
    kind: "FAQ",
    category: "Sales",
    question: "Do you handle corporate and bulk orders?",
    answer: `Yes. For several machines, several branches or a tender, share your organisation's requirements — the assistant passes them to the ${BRAND.name} team handling corporate orders, who contact you directly.`,
    keywords: ["bulk", "corporate", "tender", "branches", "large order", "wholesale", "procurement", "fleet", "institution"],
  },
  {
    id: "pl-sales-dealer",
    kind: "FAQ",
    category: "Sales",
    question: `Can I become a ${BRAND.name} dealer or partner?`,
    answer: "Share your business details and what you have in mind, and the sales team will get back to you about working together.",
    keywords: ["dealer", "dealership", "distributor", "reseller", "partner", "franchise"],
  },
];
