import { BRAND } from "@/config/brand";
import type { KnowledgeSeed } from "./types";

/**
 * How to reach the team. The phone numbers and addresses themselves come from
 * the company profile at answer time, never from here.
 */
export const CONTACT: KnowledgeSeed[] = [
  {
    id: "pl-contact-reach",
    kind: "FAQ",
    category: "Contact",
    question: `How do I contact ${BRAND.name}?`,
    answer: `You can reach the team right here: ask for Talk to Sales or Customer Support, or request a callback and they will call you. The contact details ${BRAND.name} has published are under Contact ${BRAND.name} in the menu.`,
    keywords: ["contact", "phone", "number", "email", "address", "office", "call", "reach", "whatsapp number", "rabta"],
  },
];
