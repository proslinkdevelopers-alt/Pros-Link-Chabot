import { BRAND } from "@/config/brand";
import { DEFAULT_CATEGORIES } from "@/data/catalog";
import type { KnowledgeSeed } from "./types";

/**
 * One entry per product category. Each says what the category is and how to
 * see the range — never which models exist, their specifications or prices.
 * The assistant reads actual products from the catalogue at answer time.
 */
export const PRODUCTS: KnowledgeSeed[] = DEFAULT_CATEGORIES.map((category) => ({
  id: `pl-product-${category.slug}`,
  kind: "SERVICE" as const,
  category: "Products",
  question: `Does ${BRAND.name} offer ${category.name.toLowerCase()}?`,
  answer: `Yes — ${category.name} is one of ${BRAND.name}'s product areas. ${category.description}\n\nThe current range, specifications and availability are the ones the team has published in the catalogue; tap Explore Products to see them. For a recommendation or a price, request a quotation and the team will prepare it for your requirement.`,
  keywords: [category.name.toLowerCase(), ...category.keywords],
}));
