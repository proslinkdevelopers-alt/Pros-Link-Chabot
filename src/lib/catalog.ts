import type { ProductAvailability } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { DEFAULT_CATEGORIES } from "@/data/catalog";

/**
 * =============================================================================
 *  Catalogue reads for customers
 * =============================================================================
 *
 *  What the site, the public catalogue API and the assistant may show: active
 *  categories, PUBLISHED products and brands staff have verified. Cached for a
 *  short while because every assistant turn may read it. A database outage
 *  falls back to the default category names with no products — the assistant
 *  then offers a quote or a callback instead of inventing a range.
 * =============================================================================
 */

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

const CACHE_MS = 30_000;
let cache: { categories: CatalogCategory[]; products: CatalogProduct[]; brands: string[]; at: number } | null = null;

function asPairs(value: unknown, a: string, b: string): Array<Record<string, string>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({ [a]: String(item[a] ?? "").trim(), [b]: String(item[b] ?? "").trim() }))
    .filter((item) => item[a] && item[b]);
}

async function load(): Promise<NonNullable<typeof cache>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  try {
    const [categories, products, brands] = await Promise.all([
      prisma.productCategory.findMany({
        where: { department: DEPARTMENT, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { products: { where: { status: "PUBLISHED" } } } } },
      }),
      prisma.product.findMany({
        where: { department: DEPARTMENT, status: "PUBLISHED" },
        orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
        take: 500,
        include: {
          category: { select: { slug: true, name: true, isActive: true } },
          brand: { select: { name: true, isActive: true, isVerified: true } },
        },
      }),
      prisma.brand.findMany({
        where: { department: DEPARTMENT, isActive: true, isVerified: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { name: true },
      }),
    ]);

    cache = {
      categories: categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        icon: c.icon,
        productCount: c._count.products,
      })),
      products: products.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        sku: p.sku,
        model: p.model,
        summary: p.summary,
        description: p.description,
        images: p.images ?? [],
        features: p.features ?? [],
        specifications: asPairs(p.specifications, "label", "value") as CatalogProduct["specifications"],
        documents: asPairs(p.documents, "title", "url") as CatalogProduct["documents"],
        availability: p.availability,
        category: p.category?.isActive ? { slug: p.category.slug, name: p.category.name } : null,
        // A brand is named only once staff have verified it.
        brand: p.brand?.isActive && p.brand.isVerified ? { name: p.brand.name } : null,
        keywords: p.keywords ?? [],
      })),
      brands: brands.map((b) => b.name),
      at: Date.now(),
    };
  } catch (error) {
    console.warn("[catalog] using defaults:", error instanceof Error ? error.message.split("\n").find(Boolean) : error);
    cache = {
      categories: DEFAULT_CATEGORIES.map((c) => ({
        id: null,
        slug: c.slug,
        name: c.name,
        description: c.description,
        icon: c.icon,
        productCount: 0,
      })),
      products: [],
      brands: [],
      at: Date.now() - CACHE_MS + 5_000,
    };
  }
  return cache;
}

/** Forget the cache after an edit in the console. */
export function invalidateCatalog(): void {
  cache = null;
}

export async function listCategories(): Promise<CatalogCategory[]> {
  return (await load()).categories;
}

export async function listProducts(categorySlug?: string): Promise<CatalogProduct[]> {
  const { products } = await load();
  return categorySlug ? products.filter((p) => p.category?.slug === categorySlug) : products;
}

export async function findProduct(idOrSlug: string): Promise<CatalogProduct | null> {
  const { products } = await load();
  return products.find((p) => p.id === idOrSlug || p.slug === idOrSlug) ?? null;
}

export async function verifiedBrands(): Promise<string[]> {
  return (await load()).brands;
}

/**
 * Published products that match a customer's message, for the assistant's
 * prompt — so it recommends only what is really in the catalogue.
 */
export async function matchProducts(query: string, limit = 5): Promise<CatalogProduct[]> {
  const text = ` ${query.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ")} `;
  const { products } = await load();
  return products
    .map((product) => {
      let score = 0;
      const terms = [product.name, product.model ?? "", product.sku ?? "", product.brand?.name ?? "", ...product.keywords];
      for (const term of terms) {
        const clean = term.toLowerCase().trim();
        if (clean.length > 2 && text.includes(` ${clean} `)) score += clean.includes(" ") ? 5 : 3;
      }
      if (product.category && text.includes(product.category.name.toLowerCase().split(/[ /]/)[0])) score += 1;
      return { product, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.product);
}
