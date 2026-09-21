import { BRAND } from "@/config/brand";
import type { KnowledgeSeed } from "./types";

/** Who Pros-Link is — only what Pros-Link has said about itself. */
export const COMPANY: KnowledgeSeed[] = [
  {
    id: "pl-company-about",
    kind: "ARTICLE",
    category: "Company",
    question: `Who is ${BRAND.name}?`,
    answer: `${BRAND.description}\n\n${BRAND.name} works across: ${BRAND.businessAreas.join(", ")}.\n\nIts positioning is simple: ${BRAND.tagline.toLowerCase()}.`,
    keywords: ["about", "who are you", "company", "pros-link", "pros link", "proslink", "what do you do", "introduction", "kaun"],
  },
  {
    id: "pl-company-coverage",
    kind: "FAQ",
    category: "Company",
    question: `Where does ${BRAND.name} operate?`,
    answer: `${BRAND.name} serves businesses across ${BRAND.serviceArea}, with a nationwide sales and distribution presence and after-sales support. Share your city and the team will let you know how they can support you there.`,
    keywords: ["where", "location", "city", "cities", "nationwide", "pakistan", "karachi", "lahore", "islamabad", "branch", "coverage"],
  },
];
