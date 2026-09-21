import { z } from "zod";
import { KNOWLEDGE_CATEGORIES } from "@/data/knowledge";

/** A knowledge entry as staff edit it. The assistant answers from published entries only. */
export const knowledgeSchema = z.object({
  category: z.enum(KNOWLEDGE_CATEGORIES),
  question: z.string().trim().min(5, "Write the question or title.").max(300),
  answer: z.string().trim().min(5, "Write the answer.").max(8000),
  keywords: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  kind: z.enum(["FAQ", "ARTICLE", "SERVICE", "POLICY", "DOCUMENT"]).default("FAQ"),
  state: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});
