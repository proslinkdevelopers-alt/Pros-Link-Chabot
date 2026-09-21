"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal toasts for the console: `toast.success("Saved")` from anywhere in a
 * client component, rendered by the one <Toaster/> in the admin shell.
 */

interface Toast {
  id: number;
  tone: "success" | "error";
  message: string;
}

let toasts: Toast[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function push(tone: Toast["tone"], message: string) {
  const id = ++counter;
  toasts = [...toasts.slice(-3), { id, tone, message }];
  emit();
  setTimeout(() => dismiss(id), tone === "error" ? 7000 : 3500);
}

function dismiss(id: number) {
  toasts = toasts.filter((entry) => entry.id !== id);
  emit();
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
};

export function Toaster() {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toasts,
    () => toasts
  );

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {current.map((entry) => (
        <div
          key={entry.id}
          role={entry.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-3.5 text-sm shadow-elevated animate-fade-in-up",
            entry.tone === "error" ? "border-destructive/30" : "border-border"
          )}
        >
          {entry.tone === "error" ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          )}
          <p className="flex-1 leading-snug">{entry.message}</p>
          <button type="button" onClick={() => dismiss(entry.id)} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
