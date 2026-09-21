import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/staff";
import { OWN, safeQuery } from "@/lib/admin/queries";
import { Callout, DbNotice, PageHeader, StatCard } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import {
  BookOpen,
  MessageCircleQuestion,
  MessagesSquare,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { config } from "@/lib/config";
import { formatDateTime, truncate } from "@/lib/utils";

export const metadata = { title: "AI Training" };

/**
 * AI Training.
 *
 * Two jobs: show what the assistant is currently grounded in, and surface the
 * questions it handled without a knowledge-base match — those unanswered
 * queries are the highest-value edits to make next.
 */
export default async function AiTrainingPage() {
  await requirePagePermission("knowledge.manage", "/admin/ai-training");

  const { data, error } = await safeQuery(
    async () => {
      const [knowledgeCount, questionCount, handoffs, recentQuestions] = await Promise.all([
        prisma.knowledgeArticle.count({ where: { state: "PUBLISHED" } }),
        prisma.message.count({ where: { role: "USER", ...OWN } }),
        prisma.conversation.count({ where: { handedOff: true, ...OWN } }),
        prisma.message.findMany({
          where: { role: "USER", ...OWN },
          orderBy: { createdAt: "desc" },
          take: 25,
          select: { id: true, content: true, language: true, createdAt: true },
        }),
      ]);
      return { knowledgeCount, questionCount, handoffs, recentQuestions };
    },
    { knowledgeCount: 0, questionCount: 0, handoffs: 0, recentQuestions: [] }
  );

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="AI Training"
        description="What the assistant knows, which provider it's running on, and the real questions people are asking."
      />

      {error && <DbNotice error={error} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Knowledge entries"
          value={data.knowledgeCount}
          hint="Published and indexed"
          icon={BookOpen}
          href="/admin/knowledge"
        />
        <StatCard
          label="Questions asked"
          value={data.questionCount}
          hint="Across web chat and WhatsApp"
          icon={MessagesSquare}
          href="/admin/conversations"
        />
        <StatCard
          label="Handed off"
          value={data.handoffs}
          hint="Conversations the assistant couldn't finish"
          icon={TriangleAlert}
          href="/admin/conversations?filter=handoff"
        />
        <StatCard label="AI provider" value={config.ai.provider} hint={config.ai.model} icon={Sparkles} />
      </div>

      <Callout title="How training works here">
        The assistant is grounded, not fine-tuned. It answers from published knowledge-base
        entries, and is instructed to say it isn't sure — and offer a
        human — when nothing matches. To improve an answer, edit the entry; the change takes
        effect on the next message. No retraining run is required.
      </Callout>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <MessageCircleQuestion className="size-4 text-accent" />
            <h2 className="text-sm font-semibold">Recent questions</h2>
          </div>
          {data.recentQuestions.length ? (
            <ul className="space-y-2.5">
              {data.recentQuestions.map((question) => (
                <li key={question.id} className="border-l-2 border-secondary pl-3">
                  <p className="text-sm">{truncate(question.content, 150)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {question.language ?? "EN"} · {formatDateTime(question.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No questions recorded yet. They appear here as soon as people start chatting.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Improvement checklist</h2>
          <ol className="space-y-3 text-sm">
            <ChecklistItem step={1} title="Read the handed-off conversations">
              Each one is a question the assistant could not answer. Read what the visitor actually
              wanted before writing anything.
            </ChecklistItem>
            <ChecklistItem step={2} title="Add or edit the knowledge entry">
              Write it as a question and an answer, in the words customers use. Add the misspellings
              and Roman Urdu phrasings to the keyword list.
            </ChecklistItem>
            <ChecklistItem step={3} title="Publish it">
              Set the entry to <strong>Published</strong> in the{" "}
              <Link href="/admin/knowledge" className="text-primary hover:underline">
                Knowledge Base
              </Link>
              . Draft entries are never used in answers.
            </ChecklistItem>
            <ChecklistItem step={4} title="Test it in the assistant">
              Ask the original question again, in the original language, and confirm the answer is
              right before closing the loop.
            </ChecklistItem>
          </ol>
        </Card>
      </div>
    </>
  );
}

function ChecklistItem({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {step}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}
