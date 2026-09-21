"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Textarea } from "@/components/ui/field";
import { ConfirmButton, Modal } from "../client/Modal";
import { useMutation } from "../client/api";
import { DataTable, StatusBadge } from "../ui";

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  isVerified: boolean;
  isActive: boolean;
  sortOrder: number;
  notes: string | null;
  products: number;
}

type Draft = Omit<BrandRow, "id" | "products" | "description" | "website" | "logoUrl" | "notes"> & { description: string; website: string; logoUrl: string; notes: string };
const EMPTY: Draft = { name: "", slug: "", description: "", website: "", logoUrl: "", isVerified: false, isActive: false, sortOrder: 0, notes: "" };

export function BrandManager({ rows, canEdit }: { rows: BrandRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<{ id?: string; draft: Draft } | null>(null);
  const { run, pending, fields } = useMutation();

  const draft = editing?.draft;
  const change = (patch: Partial<Draft>) => editing && setEditing({ ...editing, draft: { ...editing.draft, ...patch } });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const body = { ...editing.draft, slug: editing.draft.slug.trim() };
    const result = editing.id
      ? await run("PATCH", `/api/admin/brands/${editing.id}`, body, { success: "Brand saved." })
      : await run("POST", "/api/admin/brands", body, { success: "Brand added." });
    if (result.ok) setEditing(null);
  }

  return (
    <>
      {canEdit && (
        <div className="mb-4 flex justify-end">
          <Button variant="brand" size="sm" onClick={() => setEditing({ draft: { ...EMPTY, sortOrder: rows.length } })}>
            <Plus /> Add brand
          </Button>
        </div>
      )}
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        empty="No brands yet."
        minWidth={640}
        columns={[
          {
            header: "Brand",
            cell: (row) => (
              <div>
                <p className="font-semibold">{row.name}</p>
                {row.notes && <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{row.notes}</p>}
              </div>
            ),
          },
          {
            header: "Shown to customers",
            cell: (row) =>
              row.isVerified && row.isActive ? (
                <StatusBadge value="ACTIVE" label="Yes" />
              ) : (
                <StatusBadge value="PENDING" label={!row.isVerified ? "Not verified" : "Inactive"} />
              ),
          },
          { header: "Products", cell: (row) => <span className="tabular-nums">{row.products}</span> },
          {
            header: "",
            className: "text-right",
            cell: (row) =>
              canEdit ? (
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setEditing({
                        id: row.id,
                        draft: {
                          name: row.name, slug: row.slug, description: row.description ?? "", website: row.website ?? "", logoUrl: row.logoUrl ?? "",
                          isVerified: row.isVerified, isActive: row.isActive, sortOrder: row.sortOrder, notes: row.notes ?? "",
                        },
                      })
                    }
                  >
                    <Pencil /> Edit
                  </Button>
                  <ConfirmButton
                    title={`Delete “${row.name}”?`}
                    message="Only a brand no product uses can be deleted. Otherwise, untick Active."
                    confirmLabel="Delete"
                    variant="ghost"
                    onConfirm={() => run("DELETE", `/api/admin/brands/${row.id}`, undefined, { success: "Brand deleted." })}
                  >
                    <Trash2 />
                  </ConfirmButton>
                </div>
              ) : null,
          },
        ]}
      />

      <Modal open={Boolean(editing)} onClose={() => !pending && setEditing(null)} title={editing?.id ? "Edit brand" : "Add brand"}>
        {draft && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Name" htmlFor="b-name" required error={fields.name}>
              <Input id="b-name" value={draft.name} onChange={(e) => change({ name: e.target.value })} required maxLength={80} />
            </Field>
            <Field label="Website" htmlFor="b-web" error={fields.website}>
              <Input id="b-web" type="url" value={draft.website} onChange={(e) => change({ website: e.target.value })} placeholder="https://" />
            </Field>
            <Field label="Logo image" htmlFor="b-logo" error={fields.logoUrl}>
              <Input id="b-logo" type="url" value={draft.logoUrl} onChange={(e) => change({ logoUrl: e.target.value })} placeholder="https://" />
            </Field>
            <Field label="Description" htmlFor="b-desc" error={fields.description}>
              <Textarea id="b-desc" value={draft.description} onChange={(e) => change({ description: e.target.value })} maxLength={500} className="min-h-[70px]" />
            </Field>
            <Field label="Internal notes" htmlFor="b-notes" hint="Not shown to customers — e.g. how the partnership was confirmed." error={fields.notes}>
              <Textarea id="b-notes" value={draft.notes} onChange={(e) => change({ notes: e.target.value })} maxLength={1000} className="min-h-[70px]" />
            </Field>
            <div className="space-y-2 rounded-lg border bg-secondary/40 p-3">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" checked={draft.isVerified} onChange={(e) => change({ isVerified: e.target.checked })} />
                <span>
                  <span className="font-medium">Verified</span>
                  <span className="block text-xs text-muted-foreground">Pros-Link has confirmed it supplies or supports this brand.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" checked={draft.isActive} onChange={(e) => change({ isActive: e.target.checked })} />
                <span>
                  <span className="font-medium">Active</span>
                  <span className="block text-xs text-muted-foreground">Customers and the assistant see the brand only when it is both verified and active.</span>
                </span>
              </label>
            </div>
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
