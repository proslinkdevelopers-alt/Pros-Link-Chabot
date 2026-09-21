import type { KnowledgeEntry } from "@/types";
import { MARKETING_KNOWLEDGE_BASE } from "@/data/marketing/knowledge-base";

/**
 * Knowledge retrieval.
 *
 * Light keyword-overlap search — intentionally dependency-free (no embeddings)
 * so the system runs anywhere, including offline demos. It scores entries by
 * keyword hits, question-word overlap and category match, then returns the top
 * results, which are injected into the system prompt so the assistant answers
 * from BITSOL's own content before reaching for general model knowledge.
 *
 * Swapping this for a vector search later means changing only this file.
 */
export function retrieveKnowledge(query: string, limit = 6): KnowledgeEntry[] {
  const q = normalize(query);
  if (!q) return [];

  const terms = new Set(q.split(" ").filter((t) => t.length > 2));

  return MARKETING_KNOWLEDGE_BASE
    .map((entry) => {
      let score = 0;

      for (const keyword of entry.keywords) {
        const kw = normalize(keyword);
        if (!kw) continue;
        if (q.includes(kw)) score += kw.includes(" ") ? 5 : 3;
      }

      for (const word of normalize(entry.question).split(" ")) {
        if (word.length > 2 && terms.has(word)) score += 1;
      }

      if (q.includes(normalize(entry.category))) score += 2;

      // Service entries are the most common intent — nudge them up when the
      // query already looks like a catalogue lookup.
      if (entry.kind === "SERVICE" && score > 0) {
        score += 1;
      }

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
    .replace(/[^a-z0-9؀-ۿ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Forget cached knowledge after an edit in the console. */
export function invalidateKnowledge(): void {
  /* the static knowledge base has no cache */
}
