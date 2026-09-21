"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, ChevronLeft, X } from "lucide-react";
import { Logo } from "@/components/branding/Logo";
import { BRAND } from "@/config/brand";
import { MARKETING_MENU } from "@/data/marketing/menu";
import type { MenuEntry } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Slide-over menu for phones and tablets, where the chat's desktop rail has no
 * room.
 *
 * Renders the menu tree from `data/marketing/menu.ts` one level at a time. A
 * leaf sends its prompt to the assistant, which takes the conversation from
 * there.
 */
export function MenuPanel({
  open,
  onClose,
  onPrompt,
}: {
  open: boolean;
  onClose: () => void;
  onPrompt: (prompt: string) => void;
}) {
  const [stack, setStack] = useState<MenuEntry[]>([]);

  const current = stack.length ? stack[stack.length - 1].children ?? [] : MARKETING_MENU;
  const title = stack.length ? stack[stack.length - 1].label : null;

  function select(entry: MenuEntry) {
    if (entry.children?.length) {
      setStack((s) => [...s, entry]);
      return;
    }
    onPrompt(entry.prompt);
    close();
  }

  function close() {
    setStack([]);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 z-30 bg-brand-ink/70 backdrop-blur-sm"
            aria-hidden
          />

          <motion.aside
            role="dialog"
            aria-label={`${BRAND.name} menu`}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="absolute inset-y-0 left-0 z-40 flex w-[min(20rem,88%)] flex-col border-r border-white/[0.08] bg-brand-ink shadow-glow"
          >
            <header className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-3">
              {stack.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setStack((s) => s.slice(0, -1))}
                    aria-label="Back"
                    className="grid size-8 place-items-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <p className="flex-1 truncate text-sm font-semibold text-white">{title}</p>
                </>
              ) : (
                <div className="flex-1 px-1">
                  <Logo href={null} size="sm" descriptor="Menu" />
                </div>
              )}
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="grid size-8 place-items-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </header>

            <nav className="scroll-slim flex-1 overflow-y-auto p-2">
              <ul className="space-y-0.5">
                {current.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => select(entry)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors",
                        "hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      )}
                    >
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-white/90">{entry.label}</span>
                        {entry.labelUr !== entry.label && (
                          <span className="urdu block text-[11px] text-white/40">
                            {entry.labelUr}
                          </span>
                        )}
                      </span>
                      {entry.children?.length ? (
                        <ChevronRight className="size-4 shrink-0 text-white/35" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <footer className="border-t border-white/[0.06] px-4 py-3 text-[11px] text-white/45">
              {BRAND.tagline}
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
