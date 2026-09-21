"use client";

import { useState } from "react";
import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/field";
import { Modal } from "./client/Modal";
import { useMutation } from "./client/api";
import { DataTable, StatusBadge } from "./ui";
import { formatDateTime } from "@/lib/utils";

export interface TeamRow {
  id: string;
  name: string;
  email: string | null;
  role: string;
  roleLabel: string;
  isActive: boolean;
  lastLoginAt: string | null;
  self: boolean;
}

type Mode = { kind: "add" } | { kind: "edit"; row: TeamRow } | { kind: "password"; row: TeamRow } | null;

/** Staff accounts: add, change role, deactivate and reset passwords. */
export function TeamManager({ rows, roles }: { rows: TeamRow[]; roles: Array<{ value: string; label: string; description: string }> }) {
  const [mode, setMode] = useState<Mode>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "SALES", password: "", isActive: true });
  const { run, pending, fields } = useMutation();

  function openAdd() {
    setForm({ name: "", email: "", role: "SALES", password: "", isActive: true });
    setMode({ kind: "add" });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!mode) return;
    let ok = false;
    if (mode.kind === "add") {
      ok = (await run("POST", "/api/admin/team", { name: form.name, email: form.email, role: form.role, password: form.password }, { success: `${form.name} can now sign in.` })).ok;
    } else if (mode.kind === "edit") {
      ok = (await run("PATCH", `/api/admin/team/${mode.row.id}`, { name: form.name, role: form.role, isActive: form.isActive }, { success: "Account updated." })).ok;
    } else {
      ok = (await run("PATCH", `/api/admin/team/${mode.row.id}`, { password: form.password }, { success: "Password changed. Share it with them securely." })).ok;
    }
    if (ok) setMode(null);
  }

  const role = roles.find((entry) => entry.value === form.role);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="brand" size="sm" onClick={openAdd}>
          <UserPlus /> Add team member
        </Button>
      </div>
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        minWidth={680}
        columns={[
          {
            header: "Person",
            cell: (row) => (
              <div>
                <p className="font-semibold">
                  {row.name} {row.self && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                </p>
                <p className="text-xs text-muted-foreground">{row.email}</p>
              </div>
            ),
          },
          { header: "Role", cell: (row) => row.roleLabel },
          { header: "Status", cell: (row) => <StatusBadge value={row.isActive ? "ACTIVE" : "INACTIVE"} label={row.isActive ? "Active" : "Deactivated"} /> },
          { header: "Last sign-in", cell: (row) => <span className="text-xs text-muted-foreground">{row.lastLoginAt ? formatDateTime(row.lastLoginAt) : "Never"}</span> },
          {
            header: "",
            className: "text-right",
            cell: (row) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setForm({ name: row.name, email: row.email ?? "", role: row.role, password: "", isActive: row.isActive });
                    setMode({ kind: "edit", row });
                  }}
                >
                  <Pencil /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setForm({ ...form, password: "" });
                    setMode({ kind: "password", row });
                  }}
                >
                  <KeyRound /> Password
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Modal
        open={Boolean(mode)}
        onClose={() => !pending && setMode(null)}
        title={mode?.kind === "add" ? "Add team member" : mode?.kind === "edit" ? `Edit ${mode.row.name}` : mode?.kind === "password" ? `New password for ${mode.row.name}` : ""}
      >
        {mode && (
          <form onSubmit={submit} className="space-y-4">
            {mode.kind !== "password" && (
              <>
                <Field label="Name" htmlFor="t-name" required error={fields.name}>
                  <Input id="t-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} />
                </Field>
                {mode.kind === "add" && (
                  <Field label="Email" htmlFor="t-email" required hint="They sign in with this address." error={fields.email}>
                    <Input id="t-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={160} autoComplete="off" />
                  </Field>
                )}
                <Field label="Role" htmlFor="t-role" hint={role?.description} error={fields.role}>
                  <Select id="t-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={mode.kind === "edit" && mode.row.self}>
                    {roles.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {mode.kind === "edit" && !mode.row.self && (
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                    <span>
                      Active
                      <span className="block text-xs text-muted-foreground">A deactivated account is signed out on its next request and cannot sign in.</span>
                    </span>
                  </label>
                )}
              </>
            )}
            {mode.kind !== "edit" && (
              <Field label={mode.kind === "add" ? "Temporary password" : "New password"} htmlFor="t-pass" required hint="At least 10 characters, with a letter and a number." error={fields.password}>
                <Input id="t-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={10} maxLength={200} autoComplete="new-password" />
              </Field>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)} disabled={pending}>
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
