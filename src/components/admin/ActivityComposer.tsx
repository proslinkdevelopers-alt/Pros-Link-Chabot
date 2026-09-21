"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, Textarea } from "@/components/ui/field";

const TYPES = ["NOTE", "FOLLOW_UP", "REMINDER", "CALL", "EMAIL", "WHATSAPP", "MEETING"] as const;

/**
 * Adds a note, follow-up or reminder to a CRM record's timeline.
 *
 * Follow-ups and reminders take a due date so they surface on the Follow-ups
 * board; plain notes don't ask for one, which keeps the common case to two
 * clicks and a sentence.
 */
export function ActivityComposer({
  entityType,
  entityId,
}: {
  entityType: "Lead" | "Customer" | "Ticket" | "Project";
  entityId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof TYPES)[number]>("NOTE");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const needsDueDate = type === "FOLLOW_UP" || type === "REMINDER";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          type,
          body: body.trim(),
          dueAt: needsDueDate && dueAt ? dueAt : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not save that.");
      }
      setBody("");
      setDueAt("");
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add note or follow-up
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-xl border bg-secondary/40 p-3">
      <div className="flex flex-wrap gap-2">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
          className="h-9 w-auto min-w-[9rem] flex-none text-xs"
          aria-label="Activity type"
        >
          {TYPES.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
            </option>
          ))}
        </Select>

        {needsDueDate && (
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="h-9 w-auto flex-1 text-xs"
            aria-label="Due date"
          />
        )}
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What happened, and what's next?"
        className="min-h-[72px] text-sm"
        required
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || !body.trim()} className="gap-1.5">
          {saving && <Loader2 className="size-4 animate-spin" />} Save
        </Button>
      </div>
    </form>
  );
}
