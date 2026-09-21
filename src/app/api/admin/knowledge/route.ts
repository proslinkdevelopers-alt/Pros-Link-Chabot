import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { invalidateKnowledge } from "@/lib/ai/knowledge";
import { shortId } from "@/lib/utils";
import { fail, ok, readBody, slugify } from "@/lib/admin/http";
import { knowledgeSchema } from "@/lib/admin/knowledge-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("knowledge.manage", req);
  if ("response" in guard) return guard.response;
  const body = await readBody(req, knowledgeSchema);
  if ("response" in body) return body.response;
  const input = body.data;

  try {
    // Slugs are unique across the whole table, so ours carry a prefix and a suffix.
    const slug = `pl-${slugify(input.question).slice(0, 50)}-${shortId(6).toLowerCase()}`;
    const entry = await prisma.knowledgeArticle.create({
      data: { ...input, keywords: input.keywords.map((word) => word.toLowerCase()), slug, department: DEPARTMENT, language: "EN", indexedAt: new Date() },
      select: { id: true },
    });
    invalidateKnowledge();
    await audit({
      action: "knowledge.created",
      entity: "KnowledgeArticle",
      entityId: entry.id,
      userId: guard.staff.id,
      message: `${guard.staff.name} added the knowledge entry “${input.question}”.`,
      after: input,
      req,
    });
    return ok({ id: entry.id }, 201);
  } catch (error) {
    console.error("[knowledge] create failed:", error);
    return fail("The entry could not be saved.", 500);
  }
}
