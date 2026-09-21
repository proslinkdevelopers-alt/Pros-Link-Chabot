"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/ui/field";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "@/components/catalog/CategoryIcon";
import { ConfirmButton, Modal } from "../client/Modal";
import { useMutation } from "../client/api";
import { cn } from "@/lib/utils";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  products: number;
  published: number;
}

type Draft = { name: string; slug: string; description: string; icon: string; sortOrder: number; isActive: boolean };
const EMPTY: Draft = { name: "", slug: "", description: "", icon: "box", sortOrder: 0, isActive: true };

export function CategoryManager({ rows, canEdit }: { rows: CategoryRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<{ id?: string; draft: Draft } | null>(null);
  const { run, pending, fields } = useMutation();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const body = { ...editing.draft, slug: editing.draft.slug.trim(), icon: editing.draft.icon || null };
    const result = editing.id
      ? await run("PATCH", `/api/admin/categories/${editing.id}`, body, { success: "Category saved." })
      : await run("POST", "/api/admin/categories", body, { success: "Category added." });
    if (result.ok) setEditing(null);
  }

  return (
    <>
      {canEdit && (
        <div className="mb-4 flex justify-end">
          <Button variant="brand" size="sm" onClick={() => setEditing({ draft: { ...EMPTY, sortOrder: rows.length } })}>
            <Plus /> Add category
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <Card key={row.id} className={cn("flex flex-col gap-3 p-4", !row.isActive && "opacity-70")}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <CategoryIcon name={row.icon} className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{row.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">/{row.slug}</p>
              </div>
              {!row.isActive && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold">Hidden</span>}
            </div>
            {row.description && <p className="text-[13px] leading-relaxed text-muted-foreground">{row.description}</p>}
            <p className="text-xs text-muted-foreground">
              {row.published} published of {row.products} product{row.products === 1 ? "" : "s"}
            </p>
            {canEdit && (
              <div className="mt-auto flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditing({
                      id: row.id,
                      draft: { name: row.name, slug: row.slug, description: row.description ?? "", icon: row.icon ?? "", sortOrder: row.sortOrder, isActive: row.isActive },
                    })
                  }
                >
                  <Pencil /> Edit
                </Button>
                <ConfirmButton
                  title={`Delete “${row.name}”?`}
                  message="Only an empty category can be deleted. A category with products, or named on leads and quotes, can be hidden instead by unticking Active."
                  confirmLabel="Delete"
                  onConfirm={() => run("DELETE", `/api/admin/categories/${row.id}`, undefined, { success: "Category deleted." })}
                  variant="ghost"
                >
                  <Trash2 /> Delete
                </ConfirmButton>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Modal open={Boolean(editing)} onClose={() => !pending && setEditing(null)} title={editing?.id ? "Edit category" : "Add category"}>
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Name" htmlFor="c-name" required error={fields.name}>
              <Input id="c-name" value={editing.draft.name} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })} required maxLength={80} />
            </Field>
            <Field label="URL name" htmlFor="c-slug" hint={editing.id ? "Changing it breaks existing links to this category." : "Made from the name if left empty."} error={fields.slug}>
              <Input id="c-slug" value={editing.draft.slug} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, slug: e.target.value.toLowerCase() } })} maxLength={80} />
            </Field>
            <Field label="Description" htmlFor="c-desc" error={fields.description}>
              <Textarea id="c-desc" value={editing.draft.description} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, description: e.target.value } })} maxLength={300} className="min-h-[70px]" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Icon" htmlFor="c-icon">
                <Select id="c-icon" value={editing.draft.icon} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, icon: e.target.value } })}>
                  {CATEGORY_ICON_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sort order" htmlFor="c-sort">
                <Input id="c-sort" type="number" min={0} max={9999} value={editing.draft.sortOrder} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, sortOrder: Number(e.target.value) || 0 } })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={editing.draft.isActive} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, isActive: e.target.checked } })} />
              Active — shown on the site and offered by the assistant
            </label>
            <div className="flex justify-end gap-2 pt-2">
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
    </>
  );
}
