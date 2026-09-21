"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { humanise } from "@/lib/utils";

/**
 * Inline status control used across the CRM, ticket, meeting and knowledge
 * tables. PATCHes the shared admin endpoint, then refreshes the server
 * component so counts and badges elsewhere on the page stay accurate.
 *
 * Optimistic: the select shows the new value immediately and rolls back if the
 * request fails, so moving a lead down the pipeline never feels laggy.
 */
export function StatusSelect({
  entity,
  id,
  field,
  value,
  options,
  className,
}: {
  /** Resource segment on /api/admin/<entity>/<id>. */
  entity: "leads" | "tickets" | "meetings" | "knowledge" | "quotes";
  id: string;
  /** Which field this control writes. */
  field: "stage" | "status" | "priority" | "state";
  value: string;
  options: readonly string[];
  className?: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    const previous = current;
    setCurrent(next);
    setError(false);
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/${entity}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      });
      if (!res.ok) throw new Error("failed");
      startTransition(() => router.refresh());
    } catch {
      setCurrent(previous);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={current}
        disabled={saving}
        onChange={(e) => void change(e.target.value)}
        aria-label={`Change ${field}`}
        className={`h-7 rounded-full border bg-card px-2.5 text-[11px] font-semibold shadow-sm transition hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
          error ? "border-destructive" : ""
        } ${className ?? ""}`}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {humanise(option)}
          </option>
        ))}
      </select>
      {(saving || pending) && (
        <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden />
      )}
      {error && <span className="text-[10px] text-destructive">Failed</span>}
    </span>
  );
}
