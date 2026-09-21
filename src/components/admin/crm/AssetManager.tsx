"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Textarea } from "@/components/ui/field";
import { ConfirmButton, Modal } from "../client/Modal";
import { useMutation } from "../client/api";

export interface AssetRow {
  id: string;
  label: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  installedAt: string | null;
  warrantyUntil: string | null;
  location: string | null;
  notes: string | null;
}

type Draft = { label: string; brand: string; model: string; serialNumber: string; installedAt: string; warrantyUntil: string; location: string; notes: string };
const EMPTY: Draft = { label: "", brand: "", model: "", serialNumber: "", installedAt: "", warrantyUntil: "", location: "", notes: "" };
const toDraft = (row: AssetRow): Draft => ({
  label: row.label, brand: row.brand ?? "", model: row.model ?? "", serialNumber: row.serialNumber ?? "", installedAt: row.installedAt ?? "",
  warrantyUntil: row.warrantyUntil ?? "", location: row.location ?? "", notes: row.notes ?? "",
});

/** The machines installed at a customer's site — model, serial number, warranty. */
export function AssetManager({ customerId, rows, canEdit }: { customerId: string; rows: AssetRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<{ id?: string; draft: Draft } | null>(null);
  const { run, pending, fields } = useMutation();
  const change = (patch: Partial<Draft>) => editing && setEditing({ ...editing, draft: { ...editing.draft, ...patch } });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const result = editing.id
      ? await run("PATCH", `/api/admin/assets/${editing.id}`, editing.draft, { success: "Machine saved." })
      : await run("POST", "/api/admin/assets", { ...editing.draft, customerId }, { success: "Machine added." });
    if (result.ok) setEditing(null);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {rows.length ? (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 text-sm">
                <p className="font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground">
                  {[[row.brand, row.model].filter(Boolean).join(" "), row.serialNumber && `SN ${row.serialNumber}`, row.location].filter(Boolean).join(" · ") || "No details"}
                </p>
                {(row.installedAt || row.warrantyUntil) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.installedAt && `Installed ${row.installedAt}`}
                    {row.installedAt && row.warrantyUntil && " · "}
                    {row.warrantyUntil && (
                      <span className={row.warrantyUntil < today ? "text-rose-600" : undefined}>
                        Warranty {row.warrantyUntil < today ? "ended" : "until"} {row.warrantyUntil}
                      </span>
                    )}
                  </p>
                )}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setEditing({ id: row.id, draft: toDraft(row) })} aria-label={`Edit ${row.label}`}>
                    <Pencil className="text-muted-foreground" />
                  </Button>
                  <ConfirmButton
                    title={`Remove “${row.label}”?`}
                    message="The machine is removed from this customer's profile. Tickets raised for it are kept."
                    confirmLabel="Remove"
                    variant="ghost"
                    size="icon"
                    onConfirm={() => run("DELETE", `/api/admin/assets/${row.id}`, undefined, { success: "Machine removed." })}
                  >
                    <Trash2 className="text-muted-foreground" />
                  </ConfirmButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No machines recorded.</p>
      )}
      {canEdit && (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setEditing({ draft: EMPTY })}>
          <Plus /> Add machine
        </Button>
      )}

      <Modal open={Boolean(editing)} onClose={() => !pending && setEditing(null)} title={editing?.id ? "Edit machine" : "Add machine"}>
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Name" htmlFor="a-label" required hint="How the customer refers to it, e.g. “Admin block photocopier”." error={fields.label}>
              <Input id="a-label" value={editing.draft.label} onChange={(e) => change({ label: e.target.value })} required maxLength={120} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Brand" htmlFor="a-brand" error={fields.brand}>
                <Input id="a-brand" value={editing.draft.brand} onChange={(e) => change({ brand: e.target.value })} maxLength={60} />
              </Field>
              <Field label="Model" htmlFor="a-model" error={fields.model}>
                <Input id="a-model" value={editing.draft.model} onChange={(e) => change({ model: e.target.value })} maxLength={80} />
              </Field>
              <Field label="Serial number" htmlFor="a-serial" error={fields.serialNumber}>
                <Input id="a-serial" value={editing.draft.serialNumber} onChange={(e) => change({ serialNumber: e.target.value })} maxLength={60} />
              </Field>
              <Field label="Location" htmlFor="a-loc" error={fields.location}>
                <Input id="a-loc" value={editing.draft.location} onChange={(e) => change({ location: e.target.value })} maxLength={160} />
              </Field>
              <Field label="Installed on" htmlFor="a-inst" error={fields.installedAt}>
                <Input id="a-inst" type="date" value={editing.draft.installedAt} onChange={(e) => change({ installedAt: e.target.value })} />
              </Field>
              <Field label="Warranty until" htmlFor="a-war" error={fields.warrantyUntil}>
                <Input id="a-war" type="date" value={editing.draft.warrantyUntil} onChange={(e) => change({ warrantyUntil: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="a-notes" error={fields.notes}>
              <Textarea id="a-notes" value={editing.draft.notes} onChange={(e) => change({ notes: e.target.value })} maxLength={1000} className="min-h-[70px]" />
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
    </>
  );
}
