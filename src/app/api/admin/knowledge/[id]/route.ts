import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { DEPARTMENT } from "@/config/brand";
import { requireApiPermission } from "@/lib/staff";
import { audit } from "@/lib/notify";
import { invalidateKnowledge } from "@/lib/ai/knowledge";
import { notFound, ok, readBody } from "@/lib/admin/http";
import { knowledgeSchema } from "@/lib/admin/knowledge-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const FIELDS = { category: true, question: true, answer: true, keywords: true, kind: true, state: true, sortOrder: true, version: true } as const;

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireApiPermission("knowledge.manage", req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const body = await readBody(req, knowledgeSchema.partial());
  if ("response" in body) return body.response;
  const input = body.data;

  const before = await prisma.knowledgeArticle.findFirst({ where: { id, department: DEPARTMENT }, select: FIELDS });
  if (!before) return notFound();

  const contentChanged = input.question !== undefined || input.answer !== undefined;
  await prisma.knowledgeArticle.update({
    where: { id },
    data: {
      ...input,
      ...(input.keywords ? { keywords: input.keywords.map((word) => word.toLowerCase()) } : {}),
      ...(contentChanged ? { version: { increment: 1 } } : {}),
      indexedAt: new Date(),
    },
  });
  invalidateKnowledge();
  const { version: _version, ...previous } = before;
  await audit({
    action: "knowledge.updated",
    entity: "KnowledgeArticle",
    entityId: id,
    userId: guard.staff.id,
    message: `${guard.staff.name} updated the knowledge entry “${input.question ?? before.question}”.`,
    before: previous,
    after: input,
    req,
  });
  return ok({ id });
}

/** Delete an entry for good. Archiving keeps it out of the assistant's answers but in the records. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requireApiPermission("knowledge.manage", req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const before = await prisma.knowledgeArticle.findFirst({ where: { id, department: DEPARTMENT }, select: FIELDS });
  if (!before) return notFound();
  await prisma.knowledgeArticle.delete({ where: { id } });
  invalidateKnowledge();
  await audit({
    action: "knowledge.deleted",
    entity: "KnowledgeArticle",
    entityId: id,
    userId: guard.staff.id,
    message: `${guard.staff.name} deleted the knowledge entry “${before.question}”.`,
    before,
    after: { deleted: true },
    req,
  });
  return ok();
}
