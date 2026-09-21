"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "./client/api";
import { toast } from "./client/toast";
import { cn, formatDateTime } from "@/lib/utils";

export interface NotificationRow {
  id: string;
  subject: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

/** The signed-in person's notifications; opening one marks it read. */
export function NotificationList({ rows }: { rows: NotificationRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const unread = rows.filter((row) => !row.read).length;

  async function markAll() {
    setBusy(true);
    const result = await api("PATCH", "/api/admin/notifications", { all: true });
    setBusy(false);
    if (!result.ok) return toast.error(result.data.error ?? "Could not update notifications.");
    router.refresh();
  }

  async function open(row: NotificationRow) {
    if (!row.read) await api("PATCH", "/api/admin/notifications", { ids: [row.id] });
    if (row.link) router.push(row.link);
    else router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{unread ? `${unread} unread` : "All caught up."}</p>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAll} disabled={busy}>
            <CheckCheck /> Mark all read
          </Button>
        )}
      </div>
      <Card className="divide-y overflow-hidden p-0">
        {rows.map((row) => (
          <button key={row.id} type="button" onClick={() => open(row)} className={cn("flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-secondary/40", !row.read && "bg-primary/[0.03]")}>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", row.read ? "bg-transparent" : "bg-primary")} aria-label={row.read ? undefined : "Unread"} />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm", !row.read && "font-semibold")}>{row.subject}</span>
              {row.body && <span className="mt-0.5 block text-[13px] text-muted-foreground">{row.body}</span>}
              <span className="mt-1 block text-[11px] text-muted-foreground">{formatDateTime(row.createdAt)}</span>
            </span>
            {row.link && <span className="shrink-0 text-xs font-medium text-primary">Open</span>}
          </button>
        ))}
        {!rows.length && (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            No notifications. You&apos;ll be told here when something is assigned to you or needs attention — see also <Link href="/admin" className="text-primary hover:underline">the dashboard</Link>.
          </p>
        )}
      </Card>
    </>
  );
}
