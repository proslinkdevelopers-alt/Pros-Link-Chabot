"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Loader2, Search } from "lucide-react";
import type { NavItem } from "./nav";
import { cn } from "@/lib/utils";

export interface SearchHit {
  kind: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

interface Row {
  key: string;
  group: string;
  title: string;
  subtitle?: string;
  href: string;
}

/**
 * ⌘K / Ctrl+K search across the records the signed-in role may see, plus a
 * jump to any page in their navigation.
 */
export function CommandPalette({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: Pick<NavItem, "label" | "href">[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      setQuery("");
      setHits([]);
      setActive(0);
      setTimeout(() => input.current?.focus(), 0);
    }
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await res.json()) as { results?: SearchHit[] };
        setHits(data.results ?? []);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pageRows = pages
      .filter((page) => !q || page.label.toLowerCase().includes(q))
      .slice(0, q ? 5 : 8)
      .map((page) => ({ key: `page:${page.href}`, group: "Go to", title: page.label, href: page.href }));
    const records = hits.map((hit) => ({ key: `${hit.kind}:${hit.id}`, group: hit.kind, title: hit.title, subtitle: hit.subtitle, href: hit.href }));
    return [...records, ...pageRows];
  }, [hits, pages, query]);

  useEffect(() => setActive(0), [rows.length]);

  const go = useCallback(
    (row: Row | undefined) => {
      if (!row) return;
      onClose();
      router.push(row.href);
    },
    [onClose, router]
  );

  let lastGroup = "";

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      aria-label="Search"
      className="mx-auto mt-[12vh] w-[min(40rem,calc(100vw-2rem))] rounded-2xl border bg-card p-0 text-card-foreground shadow-elevated backdrop:bg-brand-ink/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-3 border-b px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, rows.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              go(rows[active]);
            }
          }}
          placeholder="Search leads, customers, tickets, quotes, products… or a reference"
          className="h-14 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          role="combobox"
          aria-expanded
          aria-controls="palette-results"
          aria-activedescendant={rows[active] ? `palette-${active}` : undefined}
        />
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
      </div>
      <ul id="palette-results" role="listbox" className="scroll-slim max-h-[55vh] overflow-y-auto p-2">
        {rows.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-muted-foreground">{query.trim().length < 2 ? "Type to search." : "No matches."}</li>
        )}
        {rows.map((row, index) => {
          const header = row.group !== lastGroup ? row.group : null;
          lastGroup = row.group;
          return (
            <li key={row.key} role="presentation">
              {header && <p className="px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{header}</p>}
              <button
                id={`palette-${index}`}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(row)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                  index === active ? "bg-primary/10 text-foreground" : "text-foreground/85"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.title}</span>
                  {row.subtitle && <span className="block truncate text-xs text-muted-foreground">{row.subtitle}</span>}
                </span>
                {index === active && <CornerDownLeft className="size-3.5 text-muted-foreground" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}
