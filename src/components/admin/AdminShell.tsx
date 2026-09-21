"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ExternalLink, LogOut, Menu, Search, X } from "lucide-react";
import { flatNav, visibleNav, type BadgeKey, type NavItem } from "./nav";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "./client/toast";
import { Logo } from "@/components/branding/Logo";
import { cn } from "@/lib/utils";

export interface AdminUser {
  name: string;
  role: string;
  roleLabel: string;
}

export type NavBadges = Partial<Record<BadgeKey, number>>;

/**
 * The console frame: navy sidebar, a top bar with search and notifications,
 * and a mobile drawer. The navigation is built here rather than in the server
 * layout because each item carries an icon component, which cannot cross the
 * server/client boundary; the server passes only the granted permissions.
 */
export function AdminShell({
  user,
  permissions,
  badges,
  children,
}: {
  user: AdminUser;
  permissions: string[];
  badges: NavBadges;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);

  const granted = new Set(permissions);
  const groups = visibleNav(granted);
  const pages = flatNav(granted);
  const canNotify = granted.has("notifications.view");
  const unread = badges.unreadNotifications ?? 0;
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setDrawer(false), [pathname]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-ink text-white">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo href="/admin" descriptor="Admin" size="sm" />
        <button
          type="button"
          onClick={() => setDrawer(false)}
          aria-label="Close navigation"
          className="grid size-8 place-items-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white lg:hidden"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="scroll-slim flex-1 overflow-y-auto px-3 pb-4" aria-label="Console">
        {groups.map((group) => (
          <div key={group.label} className="mt-5 first:mt-2">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{group.label}</p>
            <ul className="space-y-px">
              {group.items.map((item) => {
                const active = isActive(item);
                const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-colors",
                        active ? "bg-white/[0.08] text-white" : "text-white/65 hover:bg-white/[0.04] hover:text-white"
                      )}
                    >
                      {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand-sky" aria-hidden />}
                      <item.icon className={cn("size-4 shrink-0", active ? "text-brand-sky" : "text-white/45 group-hover:text-white/75")} aria-hidden />
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge ? (
                        <span className="min-w-5 rounded-full bg-brand-blue px-1.5 py-px text-center text-[10px] font-bold tabular-nums text-white">
                          {badge > 99 ? "99+" : badge}
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

      <div className="border-t border-white/[0.07] p-3">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-blue text-xs font-bold">{initials || "?"}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-[11px] text-white/50">{user.roleLabel}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
            className="grid size-8 place-items-center rounded-lg text-white/55 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>

      {drawer && (
        <>
          <div className="fixed inset-0 z-40 bg-brand-ink/60 lg:hidden" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 shadow-elevated lg:hidden">{sidebar}</aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
            className="grid size-9 place-items-center rounded-lg text-foreground hover:bg-secondary lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <button
            type="button"
            onClick={() => setPalette(true)}
            className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg border bg-background px-3 text-left text-sm text-muted-foreground transition hover:border-foreground/20 md:max-w-md"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate">Search records or jump to a page</span>
            <kbd className="hidden rounded border bg-secondary px-1.5 py-0.5 font-sans text-[10px] font-semibold sm:inline">Ctrl K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/chat"
              target="_blank"
              className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground md:inline-flex"
            >
              Open assistant <ExternalLink className="size-3.5" aria-hidden />
            </Link>
            {canNotify && (
              <Link
                href="/admin/notifications"
                aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
                className="relative grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Bell className="size-[18px]" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[9px] font-bold leading-4 text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-[1360px]">{children}</div>
        </main>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} pages={pages.map(({ label, href }) => ({ label, href }))} />
      <Toaster />
    </div>
  );
}
