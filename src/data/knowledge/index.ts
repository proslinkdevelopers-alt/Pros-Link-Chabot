import type { KnowledgeSeed } from "./types";
import { COMPANY } from "./company";
import { PRODUCTS } from "./products";
import { SERVICES } from "./services";
import { SUPPORT } from "./support";
import { FAQ } from "./faq";
import { POLICIES } from "./policies";
import { CONTACT } from "./contact";
import { SALES } from "./sales";
import { TECHNICAL } from "./technical";

/**
 * =============================================================================
 *  Knowledge base — seed content
 * =============================================================================
 *
 *  Organised the way the team thinks about it: company, products, services,
 *  support, FAQ, policies, contact, sales, technical. `npm run db:seed` loads
 *  it into the database; from then on it is edited in Admin → Knowledge and the
 *  assistant reads the published entries from there. This file is also the
 *  fallback when the database cannot be reached.
 *
 *  Written only from what Pros-Link has said about itself. Specifications,
 *  prices, stock, delivery times and policy terms are deliberately absent:
 *  they reach customers through the catalogue and the team, never from here.
 * =============================================================================
 */
export const DEFAULT_KNOWLEDGE: KnowledgeSeed[] = [
  ...COMPANY,
  ...PRODUCTS,
  ...SERVICES,
  ...SUPPORT,
  ...FAQ,
  ...POLICIES,
  ...CONTACT,
  ...SALES,
  ...TECHNICAL,
];

export const KNOWLEDGE_CATEGORIES = [
  "Company",
  "Products",
  "Services",
  "Support",
  "FAQ",
  "Policies",
  "Contact",
  "Sales",
  "Technical",
] as const;
