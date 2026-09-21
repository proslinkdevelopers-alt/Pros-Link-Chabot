"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, Textarea } from "@/components/ui/field";
import { api } from "./api";
import { toast } from "./toast";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
}

/**
 * A select that saves itself: PATCHes `{ [field]: value }` to `url`, shows the
 * new value at once and rolls back if the server refuses.
 */
export function InlineSelect({
  url,
  field,
  value,
  options,
  label,
  empty,
  disabled,
  className,
  confirm,
}: {
  url: string;
  field: string;
  value: string | null;
  options: Option[];
  /** Accessible name. */
  label: string;
  /** Adds a "none" option that saves null, e.g. "Unassigned". */
  empty?: string;
  disabled?: boolean;
  className?: string;
  /** Ask before saving these values, e.g. Lost or Closed. */
  confirm?: Record<string, string>;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setCurrent(value ?? ""), [value]);

  async function change(next: string) {
    if (confirm?.[next] && !window.confirm(confirm[next])) return;
    const previous = current;
    setCurrent(next);
    setSaving(true);
    const result = await api("PATCH", url, { [field]: next === "" ? null : next });
    setSaving(false);
    if (!result.ok) {
      setCurrent(previous);
      toast.error(result.data.error ?? "Could not save that.");
      return;
    }
    toast.success(`${label} updated.`);
    router.refresh();
  }

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <Select
        aria-label={label}
        value={current}
        onChange={(event) => change(event.target.value)}
        disabled={disabled || saving}
        className="h-9 min-w-[9rem] pr-8 text-[13px]"
      >
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {saving && <Loader2 className="pointer-events-none absolute right-7 size-3.5 animate-spin text-muted-foreground" aria-hidden />}
    </span>
  );
}

const NOTE_TYPES: Option[] = [
  { value: "NOTE", label: "Note" },
  { value: "CALL", label: "Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "MEETING", label: "Meeting / visit" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "REMINDER", label: "Reminder" },
];

/** Add a note, logged call or follow-up to a record's timeline. */
export function NoteComposer({ entityType, entityId }: { entityType: "Lead" | "Customer" | "Ticket" | "Quote" | "Conversation"; entityId: string }) {
  const router = useRouter();
  const [type, setType] = useState("NOTE");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const needsDue = type === "FOLLOW_UP" || type === "REMINDER";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    const result = await api("POST", "/api/admin/activities", {
      entityType,
      entityId,
      type,
      body: body.trim(),
      dueAt: needsDue && dueAt ? new Date(dueAt).toISOString() : undefined,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.data.error ?? "Could not save that.");
      return;
    }
    setBody("");
    setDueAt("");
    toast.success("Added to the timeline.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a note, a call summary or a follow-up…" maxLength={4000} className="min-h-[76px]" aria-label="Note" />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={type} onChange={(event) => setType(event.target.value)} className="h-9 w-auto text-[13px]" aria-label="Type">
          {NOTE_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {needsDue && <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="h-9 w-auto text-[13px]" aria-label="Due" required />}
        <Button type="submit" size="sm" className="ml-auto" disabled={saving || !body.trim()}>
          {saving ? <Loader2 className="animate-spin" /> : <Send />} Add
        </Button>
      </div>
    </form>
  );
}

/** A button that POSTs, then opens what it created (or refreshes). */
export function ActionButton({
  url,
  body,
  children,
  success,
  navigate = true,
  variant = "outline",
  size = "sm",
  disabled,
  className,
}: {
  url: string;
  body?: unknown;
  children: React.ReactNode;
  success?: string;
  /** Follow the `href` in the response. */
  navigate?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled || busy}
      className={className}
      onClick={async () => {
        setBusy(true);
        const result = await api<{ href?: string; id?: string }>("POST", url, body ?? {});
        setBusy(false);
        if (!result.ok) {
          toast.error(result.data.error ?? "Could not do that.");
          return;
        }
        if (success) toast.success(success);
        if (navigate && result.data.href) router.push(result.data.href);
        else router.refresh();
      }}
    >
      {busy && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

export interface QuickField {
  name: string;
  label: string;
  value: string;
  type?: "text" | "number" | "textarea" | "date";
  placeholder?: string;
  hint?: string;
  /** Send numbers as numbers and empty as null. */
  numeric?: boolean;
}

/** A few fields of a record, edited in place and saved together with one PATCH. */
export function QuickEdit({ url, fields, submitLabel = "Save", success = "Saved." }: { url: string; fields: QuickField[]; submitLabel?: string; success?: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(fields.map((field) => [field.name, field.value])));
  const [saving, setSaving] = useState(false);
  const dirty = fields.some((field) => values[field.name] !== field.value);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = Object.fromEntries(
      fields
        .filter((field) => values[field.name] !== field.value)
        .map((field) => {
          const raw = values[field.name].trim();
          return [field.name, field.numeric ? (raw === "" ? null : Number(raw)) : raw === "" ? null : raw];
        })
    );
    setSaving(true);
    const result = await api("PATCH", url, body);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.data.error ?? "Could not save that.");
      return;
    }
    toast.success(success);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {fields.map((field) => (
        <label key={field.name} className="block">
          <span className="mb-1 block text-[11.5px] font-medium text-muted-foreground">{field.label}</span>
          {field.type === "textarea" ? (
            <Textarea value={values[field.name]} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} placeholder={field.placeholder} className="min-h-[72px] text-[13px]" />
          ) : (
            <Input
              type={field.type ?? "text"}
              value={values[field.name]}
              onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
              placeholder={field.placeholder}
              className="h-9 text-[13px]"
              min={field.type === "number" ? 0 : undefined}
            />
          )}
          {field.hint && <span className="mt-1 block text-[11px] text-muted-foreground">{field.hint}</span>}
        </label>
      ))}
      <Button type="submit" size="sm" variant="outline" disabled={!dirty || saving}>
        {saving && <Loader2 className="animate-spin" />} {submitLabel}
      </Button>
    </form>
  );
}

/** Tick off a follow-up on the dashboard. */
export function CompleteButton({ activityId }: { activityId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-2.5 text-xs"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const result = await api("PATCH", `/api/admin/activities/${activityId}`, { completed: true });
        setBusy(false);
        if (!result.ok) return toast.error(result.data.error ?? "Could not update the follow-up.");
        toast.success("Follow-up done.");
        router.refresh();
      }}
    >
      {busy && <Loader2 className="animate-spin" />} Done
    </Button>
  );
}
