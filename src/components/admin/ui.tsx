import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, Database, Inbox, Info, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { labelFor } from "@/lib/admin/labels";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * Presentation pieces shared by the console's pages. Server-component safe
 * (no hooks), so a page can query Prisma and render without a client bundle.
 */

// ------------------------------------------------------------ PageHeader ----

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-3.5" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- StatCard ---

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const body = (
    <Card className={cn("group relative flex h-full flex-col gap-3 p-5", href && "transition hover:border-primary/40 hover:shadow-elevated")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div>
        <p className="text-[1.65rem] font-bold leading-none tracking-tight tabular-nums">{value}</p>
        {hint && <p className="mt-2 text-[11.5px] text-muted-foreground">{hint}</p>}
      </div>
      {href && <ArrowUpRight className="absolute bottom-4 right-4 size-4 text-transparent transition-colors group-hover:text-primary" aria-hidden />}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

// ------------------------------------------------------------------ Badges --

const TONE = {
  good: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20",
  bad: "bg-rose-500/10 text-rose-700 ring-rose-600/20",
  attention: "bg-amber-500/15 text-amber-800 ring-amber-600/25",
  flight: "bg-sky-500/10 text-sky-800 ring-sky-600/20",
  progress: "bg-indigo-500/10 text-indigo-700 ring-indigo-600/20",
  neutral: "bg-secondary text-secondary-foreground ring-border",
} as const;

const STATUS_TONES: Record<string, string> = {
  WON: TONE.good, RESOLVED: TONE.good, ACCEPTED: TONE.good, COMPLETED: TONE.good, CONFIRMED: TONE.good, DELIVERED: TONE.good,
  PUBLISHED: TONE.good, SENT: TONE.good, ACTIVE: TONE.good, APPROVED: TONE.good, READ: TONE.good, IN_STOCK: TONE.good,
  LOST: TONE.bad, REJECTED: TONE.bad, CANCELLED: TONE.bad, FAILED: TONE.bad, NO_SHOW: TONE.bad, URGENT: TONE.bad,
  SPAM: TONE.bad, OPTED_OUT: TONE.bad, OUT_OF_STOCK: TONE.bad, DISCONTINUED: TONE.bad, HIGH_PRIORITY: TONE.bad, COMPLAINT: TONE.bad,
  WAITING_CUSTOMER: TONE.attention, HIGH: TONE.attention, HOT: TONE.attention, PAUSED: TONE.attention, LIMITED_STOCK: TONE.attention,
  QUOTE_REQUESTED: TONE.attention, REQUESTED: TONE.attention, NEGOTIATION: TONE.attention, PENDING: TONE.attention, DRAFT: TONE.neutral,
  NEW: TONE.flight, OPEN: TONE.flight, WARM: TONE.flight, PROSPECT: TONE.flight, ON_ORDER: TONE.flight, ON_REQUEST: TONE.neutral,
  ASSIGNED: TONE.progress, IN_PROGRESS: TONE.progress, TECHNICIAN_DISPATCHED: TONE.progress, CONTACTED: TONE.progress,
  QUALIFIED: TONE.progress, QUOTED: TONE.progress, RESCHEDULED: TONE.attention, SENDING: TONE.flight,
  INACTIVE: TONE.neutral, CLOSED: TONE.neutral, ARCHIVED: TONE.neutral, EXPIRED: TONE.neutral, LOW: TONE.neutral, NORMAL: TONE.neutral, COLD: TONE.neutral,
};

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", STATUS_TONES[value] ?? TONE.neutral)}>
      {label ?? labelFor(value)}
    </span>
  );
}

/** Which surface a conversation arrived on. */
export function ChannelBadge({ value }: { value: string }) {
  const whatsapp = value === "WHATSAPP";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        whatsapp ? "bg-whatsapp/10 text-whatsapp-dark ring-whatsapp/25" : "bg-primary/10 text-primary ring-primary/20"
      )}
    >
      <span className={cn("size-1.5 rounded-full", whatsapp ? "bg-whatsapp" : "bg-primary")} aria-hidden />
      {whatsapp ? "WhatsApp" : "Website"}
    </span>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

// ----------------------------------------------------------------- Filters --

export function FilterChip({ href, label, count, active }: { href: string; label: string; count?: number; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        active ? "border-brand-ink bg-brand-ink text-white" : "bg-card text-foreground/80 hover:border-foreground/25 hover:text-foreground"
      )}
    >
      {label}
      {count != null && <span className={cn("ml-1.5 tabular-nums", active ? "text-brand-sky" : "text-muted-foreground")}>{count}</span>}
    </Link>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="scroll-slim -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">{children}</div>;
}

/**
 * A GET search form that keeps the page's other filters. Works without
 * JavaScript; the results are server-rendered.
 */
export function SearchForm({
  action,
  query,
  placeholder = "Search…",
  keep = {},
  children,
}: {
  action: string;
  query?: string;
  placeholder?: string;
  keep?: Record<string, string | undefined>;
  children?: React.ReactNode;
}) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-center gap-2" role="search">
      {Object.entries(keep).map(([key, value]) => (value ? <input key={key} type="hidden" name={key} value={value} /> : null))}
      <label className="relative min-w-[14rem] flex-1 sm:max-w-sm">
        <span className="sr-only">{placeholder}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          name="q"
          defaultValue={query}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {children}
      <button type="submit" className="h-10 rounded-lg border bg-card px-4 text-sm font-semibold hover:bg-secondary">
        Search
      </button>
    </form>
  );
}

// -------------------------------------------------------------- DataTable ---

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  empty = "Nothing here yet.",
  emptyHint,
  rowKey,
  minWidth = 720,
}: {
  rows: T[];
  columns: Column<T>[];
  empty?: string;
  emptyHint?: string;
  rowKey: (row: T, index: number) => string;
  minWidth?: number;
}) {
  if (!rows.length) return <EmptyState message={empty} hint={emptyHint} />;
  return (
    <Card className="overflow-hidden p-0">
      <div className="scroll-slim relative overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead>
            <tr className="border-b bg-secondary/50 text-left">
              {columns.map((column) => (
                <th key={column.header} scope="col" className={cn("whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground", column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={rowKey(row, index)} className="border-b transition-colors last:border-0 hover:bg-secondary/35">
                {columns.map((column) => (
                  <td key={column.header} className={cn("px-4 py-3 align-top", column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** The main link of a table row: its title, and a line under it. */
export function RowTitle({ href, title, sub }: { href?: string; title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      {href ? (
        <Link href={href} className="font-semibold text-foreground hover:text-primary hover:underline">
          {title}
        </Link>
      ) : (
        <span className="font-semibold">{title}</span>
      )}
      {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground" aria-label="Pagination">
      <p>
        {from}–{to} of {total}
      </p>
      <div className="flex gap-1">
        {page > 1 ? (
          <Link href={href(page - 1)} className="inline-flex h-8 items-center gap-1 rounded-lg border bg-card px-3 font-semibold text-foreground hover:bg-secondary">
            <ChevronLeft className="size-3.5" aria-hidden /> Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className="inline-flex h-8 items-center gap-1 rounded-lg border bg-card px-3 font-semibold text-foreground hover:bg-secondary">
            Next <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------- Detail pieces ---

export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn("overflow-hidden p-0", className)}>
      <div className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </Card>
  );
}

/** Label/value pairs; empty values are left out rather than shown as dashes. */
export function DetailList({ items, columns = 1 }: { items: Array<[string, React.ReactNode]>; columns?: 1 | 2 }) {
  const shown = items.filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== false);
  if (!shown.length) return <p className="text-sm text-muted-foreground">No details yet.</p>;
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm", columns === 2 && "sm:grid-cols-2")}>
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11.5px] font-medium text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface TimelineItem {
  id: string;
  at: Date | string;
  title: React.ReactNode;
  body?: React.ReactNode;
  actor?: string | null;
  tone?: "default" | "primary" | "good" | "bad";
}

export function Timeline({ items, empty = "No activity yet." }: { items: TimelineItem[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const dot = { default: "bg-border", primary: "bg-primary", good: "bg-emerald-500", bad: "bg-rose-500" };
  return (
    <ol className="relative space-y-5 border-l pl-5">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span className={cn("absolute -left-[26px] top-1 size-2.5 rounded-full ring-4 ring-card", dot[item.tone ?? "default"])} aria-hidden />
          <p className="text-sm font-medium leading-snug">{item.title}</p>
          {item.body && <div className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{item.body}</div>}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formatDateTime(item.at)}
            {item.actor ? ` · ${item.actor}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function LinkTabs({ tabs, active }: { tabs: Array<{ key: string; label: string; href: string; count?: number }>; active: string }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b" role="tablist">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          role="tab"
          aria-selected={tab.key === active}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition",
            tab.key === active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
          {tab.count != null && <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{tab.count}</span>}
        </Link>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- Messages ----

export function EmptyState({ message, hint, action }: { message: string; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 border-dashed px-6 py-12 text-center shadow-none">
      <span className="mb-1 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
        <Inbox className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-semibold">{message}</p>
      {hint && <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </Card>
  );
}

/** Shown when a page's query failed, instead of a 500. */
export function DbNotice({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <Card className="mb-6 flex items-start gap-3 border-amber-500/30 bg-amber-500/5 p-4 shadow-none" role="alert">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-700">
        <Database className="size-4" aria-hidden />
      </span>
      <div className="text-sm">
        <p className="font-semibold">Database unavailable</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          This page is showing empty results. Check <code>DATABASE_URL</code>, then run <code>npx prisma migrate deploy</code> and{" "}
          <code>npm run db:seed</code>. ({error})
        </p>
      </div>
    </Card>
  );
}

export function Callout({ title, children, tone = "info" }: { title: string; children?: React.ReactNode; tone?: "info" | "warning" }) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <Card className={cn("flex items-start gap-3 p-4 shadow-none", tone === "warning" ? "border-amber-500/30 bg-amber-500/5" : "border-primary/20 bg-primary/[0.04]")}>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tone === "warning" ? "bg-amber-500/15 text-amber-700" : "bg-primary/10 text-primary")}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="text-sm">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{children}</div>}
      </div>
    </Card>
  );
}
