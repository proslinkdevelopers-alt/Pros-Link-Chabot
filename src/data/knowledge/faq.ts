import { BRAND } from "@/config/brand";
import type { KnowledgeSeed } from "./types";

/** Questions customers ask before they buy. */
export const FAQ: KnowledgeSeed[] = [
  {
    id: "pl-faq-price",
    kind: "FAQ",
    category: "FAQ",
    question: "How much does it cost?",
    answer: `Prices depend on the model, quantity and your requirement, so the ${BRAND.name} team prepares a quotation rather than quoting from a fixed list here. Tap Request a Quote and share what you need; the team comes back to you with the price.`,
    keywords: ["price", "cost", "rate", "how much", "kitne ka", "qeemat", "price list", "rates"],
  },
  {
    id: "pl-faq-delivery",
    kind: "FAQ",
    category: "FAQ",
    question: "Do you deliver?",
    answer: `${BRAND.name} has a nationwide sales and distribution presence. Delivery arrangements for your order are confirmed by the sales team with your quotation.`,
    keywords: ["delivery", "deliver", "shipping", "dispatch", "courier"],
  },
  {
    id: "pl-faq-brands",
    kind: "FAQ",
    category: "FAQ",
    question: "Which brands do you carry?",
    answer: "The brands shown in the catalogue are the ones the team has confirmed. For a brand that isn't listed, ask the team — they will tell you what they can offer.",
    keywords: ["brand", "brands", "which company", "make", "manufacturer"],
  },
  {
    id: "pl-faq-language",
    kind: "FAQ",
    category: "FAQ",
    question: "Which languages can I use?",
    answer: "English, Urdu or Roman Urdu — write the way you normally would and the assistant replies in your language.",
    keywords: ["language", "urdu", "english", "roman urdu", "zuban"],
  },
];
