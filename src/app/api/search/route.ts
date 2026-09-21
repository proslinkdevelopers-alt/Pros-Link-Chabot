import { NextRequest } from "next/server";
import { loadKnowledge, retrieveKnowledge } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * Public knowledge search over the published knowledge base.
 *
 *   GET /api/search?q=photocopier maintenance
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, 200);

  if (query.length < 2) {
    return Response.json({ query, count: 0, results: [] });
  }

  const limit = Math.min(Number(params.get("limit") ?? 10) || 10, 25);
  const results = retrieveKnowledge(query, await loadKnowledge(), limit).map((entry) => ({
    id: entry.id,
    category: entry.category,
    question: entry.question,
    answer: entry.answer,
  }));

  return Response.json({ query, count: results.length, results });
}
