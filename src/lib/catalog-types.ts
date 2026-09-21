import type { ProductAvailability } from "@prisma/client";

/** Catalogue shapes shared by the server, the assistant and the console. Isomorphic. */

export interface CatalogCategory {
  id: string | null;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  productCount: number;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  sku: string | null;
  model: string | null;
  summary: string | null;
  description: string | null;
  images: string[];
  features: string[];
  specifications: Array<{ label: string; value: string }>;
  documents: Array<{ title: string; url: string }>;
  availability: ProductAvailability;
  category: { slug: string; name: string } | null;
  brand: { name: string } | null;
  keywords: string[];
}

export const AVAILABILITY_LABEL: Record<ProductAvailability, string> = {
  IN_STOCK: "In stock",
  LIMITED_STOCK: "Limited stock",
  OUT_OF_STOCK: "Out of stock",
  ON_ORDER: "Available to order",
  ON_REQUEST: "Availability confirmed on request",
  DISCONTINUED: "Discontinued",
};
