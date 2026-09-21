"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, LogOut, Menu, X } from "lucide-react";
import { visibleNav } from "./nav";
import { Logo } from "@/components/branding/Logo";
import { cn, humanise } from "@/lib/utils";

export interface AdminUser {
  name: string;
  role: string;
}

export interface NavBadges {
  openTickets?: number;
  newLeads?: number;
}

/**
 * Admin console shell — midnight sidebar, mobile drawer and a light workspace.
 *
 * The nav tree is built HERE rather than in the server layout, because each
 * item carries a Lucide `icon` — a function, which React cannot serialize
 * across the server/client boundary. The server passes only the serializable
 * input the filter needs (the granted `permissions`), and the icons never
 * leave the client bundle.
 */
export function AdminShell({
  user,
  permissions,
  badges,
  children,
}: {
  user: AdminUser;
  /** Granted permission keys. */
  permissions: string[];
  badges: NavBadges;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const groups = visibleNav(new Set(permissions));
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const sidebar = (
    <div className="dark brand-gradient flex h-full flex-col text-foreground">
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <Logo href="/admin" descriptor="Admin console" size="sm" />
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground lg:hidden"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="scroll-slim flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.label} className="mt-4 first:mt-1">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                const badge = item.badgeKey ? badges[item.badgeKey] : undefined;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all",
                        active
                          ? "bg-white/[0.07] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                          : "text-white/60 hover:bg-white/[0.04] hover:text-white"
                      )}
                    >
                      {active && (
                        <span
                          className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand-cyan shadow-glow-cyan"
                          aria-hidden
                        />
                      )}
                      <item.icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          active ? "text-brand-cyan" : "text-white/45 group-hover:text-white/80"
                        )}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge ? (
                        <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                          {badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <Link
          href="/chat"
          target="_blank"
          className="mb-2 flex items-center justify-between rounded-xl px-3 py-2 text-[12px] font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-white"
        >
          Open the live assistant
          <ExternalLink className="size-3.5" />
        </Link>
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
            {initials || "B"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="truncate text-[11px] text-white/45">{humanise(user.role)}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
            className="grid size-8 place-items-center rounded-lg text-white/50 transition hover:bg-white/5 hover:text-rose-300"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-[17rem] shrink-0 lg:block">
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-brand-ink/60 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[17rem] shadow-elevated lg:hidden">
            {sidebar}
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="dark sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-brand-ink/95 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="grid size-9 place-items-center rounded-xl text-white hover:bg-white/5"
          >
            <Menu className="size-5" />
          </button>
          <Logo href="/admin" size="sm" />
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 lg:px-10">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
