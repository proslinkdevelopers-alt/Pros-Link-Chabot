"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/ui/field";
import { ListEditor } from "./client/editors";
import { ConfirmButton, Modal } from "./client/Modal";
import { useMutation } from "./client/api";
import { StatusBadge } from "./ui";
import { PUBLISH_STATE_LABEL } from "@/lib/admin/labels";
import { cn } from "@/lib/utils";

export interface KnowledgeRow {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  kind: string;
  state: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  sortOrder: number;
  updatedAt: string;
}

type Draft = Omit<KnowledgeRow, "id" | "updatedAt">;

/**
 * The assistant's knowledge, by category. Published entries are what it may
 * say; drafts are work in progress and archived entries are kept but unused.
 */
export function KnowledgeManager({ rows, categories, canEdit }: { rows: KnowledgeRow[]; categories: readonly string[]; canEdit: boolean }) {
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id?: string; draft: Draft } | null>(null);
  const { run, pending, fields } = useMutation();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (category === "all" || row.category === category) &&
        (!q || row.question.toLowerCase().includes(q) || row.answer.toLowerCase().includes(q) || row.keywords.some((word) => word.includes(q)))
    );
  }, [rows, category, query]);

  const count = (value: string) => rows.filter((row) => row.category === value && row.state === "PUBLISHED").length;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const body = { ...editing.draft, keywords: editing.draft.keywords.map((word) => word.trim()).filter(Boolean) };
    const result = editing.id
      ? await run("PATCH", `/api/admin/knowledge/${editing.id}`, body, { success: "Entry saved." })
      : await run("POST", "/api/admin/knowledge", body, { success: "Entry added." });
    if (result.ok) setEditing(null);
  }

  const change = (patch: Partial<Draft>) => editing && setEditing({ ...editing, draft: { ...editing.draft, ...patch } });

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Categories" className="flex gap-1 overflow-x-auto lg:flex-col">
        {["all", ...categories].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setCategory(value)}
            className={cn(
              "flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
              category === value ? "bg-brand-ink font-semibold text-white" : "hover:bg-secondary"
            )}
          >
            {value === "all" ? "All categories" : value}
            <span className={cn("text-xs tabular-nums", category === value ? "text-brand-sky" : "text-muted-foreground")}>
              {value === "all" ? rows.filter((row) => row.state === "PUBLISHED").length : count(value)}
            </span>
          </button>
        ))}
      </nav>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[14rem] flex-1">
            <span className="sr-only">Search the knowledge base</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions, answers and search words" className="bg-card pl-9" />
          </label>
          {canEdit && (
            <Button
              variant="brand"
              size="sm"
              onClick={() =>
                setEditing({ draft: { category: category === "all" ? categories[0] : category, question: "", answer: "", keywords: [], kind: "FAQ", state: "DRAFT", sortOrder: 0 } })
              }
            >
              <Plus /> Add entry
            </Button>
          )}
        </div>

        {shown.length === 0 && <Card className="p-10 text-center text-sm text-muted-foreground">No entries match.</Card>}
        {shown.map((row) => (
          <Card key={row.id} className={cn("p-4", row.state !== "PUBLISHED" && "bg-secondary/30")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">{row.category}</span>
                  <StatusBadge value={row.state} label={PUBLISH_STATE_LABEL[row.state]} />
                </div>
                <h3 className="font-semibold leading-snug">{row.question}</h3>
                <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{row.answer}</p>
                {row.keywords.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">Search words: {row.keywords.join(", ")}</p>}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" aria-label={`Edit “${row.question}”`} onClick={() => setEditing({ id: row.id, draft: { category: row.category, question: row.question, answer: row.answer, keywords: row.keywords, kind: row.kind, state: row.state, sortOrder: row.sortOrder } })}>
                    <Pencil className="text-muted-foreground" />
                  </Button>
                  <ConfirmButton
                    title="Delete this entry?"
                    message="It is removed for good. To stop the assistant using it but keep it, set it to Archived instead."
                    confirmLabel="Delete"
                    variant="ghost"
                    size="icon"
                    onConfirm={() => run("DELETE", `/api/admin/knowledge/${row.id}`, undefined, { success: "Entry deleted." })}
                  >
                    <Trash2 className="text-muted-foreground" />
                  </ConfirmButton>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={Boolean(editing)} onClose={() => !pending && setEditing(null)} title={editing?.id ? "Edit entry" : "Add entry"} className="w-[min(46rem,calc(100vw-2rem))]">
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Category" htmlFor="k-cat">
                <Select id="k-cat" value={editing.draft.category} onChange={(e) => change({ category: e.target.value })}>
                  {categories.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kind" htmlFor="k-kind">
                <Select id="k-kind" value={editing.draft.kind} onChange={(e) => change({ kind: e.target.value })}>
                  <option value="FAQ">Question and answer</option>
                  <option value="ARTICLE">Article</option>
                  <option value="SERVICE">Service</option>
                  <option value="POLICY">Policy</option>
                  <option value="DOCUMENT">Document</option>
                </Select>
              </Field>
              <Field label="Status" htmlFor="k-state" hint="Only published entries are used.">
                <Select id="k-state" value={editing.draft.state} onChange={(e) => change({ state: e.target.value as Draft["state"] })}>
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </Field>
            </div>
            <Field label="Question or title" htmlFor="k-q" required error={fields.question}>
              <Input id="k-q" value={editing.draft.question} onChange={(e) => change({ question: e.target.value })} required maxLength={300} />
            </Field>
            <Field label="Answer" htmlFor="k-a" required hint="Only confirmed facts. The assistant repeats this to customers." error={fields.answer}>
              <Textarea id="k-a" value={editing.draft.answer} onChange={(e) => change({ answer: e.target.value })} required maxLength={8000} className="min-h-[180px]" />
            </Field>
            <Field label="Search words" htmlFor="k-words">
              <ListEditor id="k-words" values={editing.draft.keywords} onChange={(list) => change({ keywords: list })} placeholder="e.g. warranty" addLabel="Add word" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
