import { NextRequest } from "next/server";
import { findProduct, listCategories, listProducts, verifiedBrands } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public product catalogue — what customers may see: active categories,
 * PUBLISHED products and brands staff have verified.
 *
 *   GET /api/catalog                        → categories and brands
 *   GET /api/catalog?category=printers      → published products in a category
 *   GET /api/catalog?product=<id or slug>   → one published product
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const productKey = params.get("product");
  const category = params.get("category");

  if (productKey) {
    const product = await findProduct(productKey);
    return product ? Response.json({ product }) : Response.json({ error: "Not found." }, { status: 404 });
  }
  if (category) {
    if (!/^[a-z0-9-]{1,80}$/.test(category)) return Response.json({ error: "Invalid category." }, { status: 400 });
    const products = await listProducts(category);
    return Response.json({ category, count: products.length, products });
  }

  const [categories, brands] = await Promise.all([listCategories(), verifiedBrands()]);
  return Response.json(
    { categories: categories.map(({ id: _id, ...rest }) => rest), brands },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
