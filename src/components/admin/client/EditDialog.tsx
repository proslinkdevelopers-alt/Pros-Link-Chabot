"use client";

import { createContext, useContext, useState } from "react";
import { Pencil } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Modal } from "./Modal";

const CloseContext = createContext<(() => void) | null>(null);

/** Inside an <EditDialog>, closes it — for a form to call after saving. */
export function useCloseDialog(): (() => void) | undefined {
  return useContext(CloseContext) ?? undefined;
}

/**
 * A button that opens its children (usually a form) in a dialog. Usable from
 * server pages: the form is a client component with serializable props, and
 * reaches the dialog's close function through `useCloseDialog`.
 */
export function EditDialog({
  title,
  description,
  label = "Edit",
  icon = true,
  variant = "outline",
  wide,
  children,
}: {
  title: string;
  description?: string;
  label?: string;
  icon?: boolean;
  variant?: ButtonProps["variant"];
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Button type="button" variant={variant} size="sm" onClick={() => setOpen(true)}>
        {icon && <Pencil />} {label}
      </Button>
      <Modal open={open} onClose={close} title={title} description={description} className={wide ? "w-[min(50rem,calc(100vw-2rem))]" : undefined}>
        <CloseContext.Provider value={close}>{open && children}</CloseContext.Provider>
      </Modal>
    </>
  );
}
