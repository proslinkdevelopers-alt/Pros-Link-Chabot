"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A dialog on the native <dialog> element: focus is trapped, Escape closes it
 * and the page behind is inert, without a library.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl border bg-card p-0 text-card-foreground shadow-elevated backdrop:bg-brand-ink/50 backdrop:backdrop-blur-[2px]",
        className
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="scroll-slim overflow-y-auto px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** A button that asks before it acts — for deletions and other irreversible changes. */
export function ConfirmButton({
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  children,
  variant = "outline",
  size = "sm",
  destructive = true,
  disabled,
  className,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown> | unknown;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  destructive?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)} disabled={disabled} className={className}>
        {children}
      </Button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title={title}>
        <div className="text-sm leading-relaxed text-muted-foreground">{message}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
              setOpen(false);
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </Modal>
    </>
  );
}
