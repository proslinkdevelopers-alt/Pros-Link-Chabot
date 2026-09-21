import type { KnowledgeEntry, KnowledgeKind } from "@/types";
import { DEFAULT_KNOWLEDGE } from "@/data/knowledge";

/**
 * =============================================================================
 *  Knowledge retrieval
 * =============================================================================
 *
 *  The assistant answers from the knowledge base first. Entries are edited in
 *  Admin → Knowledge and read from the database here — published ones only —
 *  so an edit reaches the next answer without a deploy. They are cached for a
 *  short while and the cache is dropped when someone saves an entry. When the
 *  database cannot be reached, the seed content in `src/data/knowledge` stands
 *  in, so the assistant keeps answering during an outage.
 *
 *  Scoring is light keyword overlap — dependency-free by design. Swapping in
 *  vector search later means changing only `retrieveKnowledge`.
 * =============================================================================
 */

const CACHE_MS = 60_000;
let cache: { entries: KnowledgeEntry[]; at: number } | null = null;

/** The published knowledge base. Never throws. */
export async function loadKnowledge(): Promise<KnowledgeEntry[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.entries;
  try {
    // Imported lazily so the pure retrieval below stays usable without a database.
    const [{ prisma }, { DEPARTMENT }] = await Promise.all([import("@/lib/db"), import("@/config/brand")]);
    const rows = await prisma.knowledgeArticle.findMany({
      where: { department: DEPARTMENT, state: "PUBLISHED" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 500,
      select: { slug: true, kind: true, category: true, question: true, answer: true, keywords: true },
    });
    // A database that has never been seeded answers from the built-in starting content.
    if (!rows.length && !(await prisma.knowledgeArticle.count({ where: { department: DEPARTMENT } }))) {
      cache = { entries: DEFAULT_KNOWLEDGE, at: Date.now() };
      return cache.entries;
    }
    const entries: KnowledgeEntry[] = rows.map((row) => ({
      id: row.slug,
      kind: (row.kind === "COURSE" ? "ARTICLE" : row.kind) as KnowledgeKind,
      category: row.category,
      question: row.question,
      answer: row.answer,
      keywords: row.keywords ?? [],
    }));
    cache = { entries, at: Date.now() };
  } catch (error) {
    console.warn("[knowledge] using seed content:", error instanceof Error ? error.message.split("\n").find(Boolean) : error);
    cache = { entries: DEFAULT_KNOWLEDGE, at: Date.now() - CACHE_MS + 5_000 };
  }
  return cache.entries;
}

/** Forget cached knowledge after an edit in the console. */
export function invalidateKnowledge(): void {
  cache = null;
}

/** The entries that best match a customer's message, most relevant first. */
export function retrieveKnowledge(query: string, entries: KnowledgeEntry[] = DEFAULT_KNOWLEDGE, limit = 6): KnowledgeEntry[] {
  const q = normalize(query);
  if (!q) return [];

  const terms = new Set(q.split(" ").filter((t) => t.length > 2));

  return entries
    .map((entry) => {
      let score = 0;

      for (const keyword of entry.keywords) {
        const kw = normalize(keyword);
        if (!kw) continue;
        if (` ${q} `.includes(` ${kw} `)) score += kw.includes(" ") ? 5 : 3;
      }

      for (const word of normalize(entry.question).split(" ")) {
        if (word.length > 2 && terms.has(word)) score += 1;
      }

      if (q.includes(normalize(entry.category))) score += 2;

      return { entry, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
