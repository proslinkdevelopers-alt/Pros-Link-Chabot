import { BRAND } from "@/config/brand";
import type { KnowledgeSeed } from "./types";

/**
 * Policies. None have been supplied, so there is one entry saying where terms
 * come from. Add real warranty, return and service terms in Admin → Knowledge
 * once they are confirmed — the assistant never states terms that are not here.
 */
export const POLICIES: KnowledgeSeed[] = [
  {
    id: "pl-policy-terms",
    kind: "POLICY",
    category: "Policies",
    question: "What are the warranty, return and service terms?",
    answer: `Warranty, return and service terms depend on the product and the agreement, and the ${BRAND.name} team confirms them with your quotation or service request. The assistant does not quote terms it has not been given — ask the team and they will confirm them.`,
    keywords: ["warranty", "guarantee", "return", "refund", "exchange", "terms", "policy", "conditions"],
  },
];
