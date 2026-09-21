"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, FilePlus2, Loader2, PauseCircle, PlayCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, Textarea } from "@/components/ui/field";
import { api } from "../client/api";
import { toast } from "../client/toast";
import { SERVICE_CATEGORIES, SUPPORT_CATEGORIES, TICKET_CATEGORY_LABEL } from "@/lib/admin/labels";

/**
 * Replying as a person. On WhatsApp a free-form reply is possible only inside
 * the 24-hour customer service window; on the website the visitor sees it the
 * next time their chat checks for replies (every few seconds while open).
 */
export function ReplyBox({ conversationId, channel, windowOpen, canReply }: { conversationId: string; channel: "WEB" | "WHATSAPP"; windowOpen: boolean; canReply: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pause, setPause] = useState(true);
  const [sending, setSending] = useState(false);
  const blocked = channel === "WHATSAPP" && !windowOpen;

  if (!canReply) return null;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    const result = await api("POST", `/api/admin/conversations/${conversationId}/reply`, { text: text.trim(), pauseBot: pause });
    setSending(false);
    if (!result.ok) {
      toast.error(result.data.error ?? "The reply was not sent.");
      return;
    }
    setText("");
    toast.success(channel === "WHATSAPP" ? "Sent on WhatsApp." : "Reply posted to the website chat.");
    router.refresh();
  }

  return (
    <form onSubmit={send} className="border-t bg-card p-3">
      {blocked ? (
        <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-900">
          The customer last wrote more than 24 hours ago, so WhatsApp only allows an approved template message. Send one from Broadcasts, or wait for the customer to
          write again.
        </p>
      ) : (
        <>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send(event as unknown as React.FormEvent);
            }}
            placeholder={channel === "WHATSAPP" ? "Reply on WhatsApp…" : "Reply in the website chat…"}
            maxLength={4000}
            className="min-h-[72px]"
            aria-label="Reply"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={pause} onChange={(event) => setPause(event.target.checked)} className="size-3.5 accent-[hsl(var(--primary))]" />
              Pause the assistant while I handle this
            </label>
            <Button type="submit" size="sm" className="ml-auto" disabled={sending || !text.trim()}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />} Send
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

/** Pause or resume the assistant, and close or reopen the thread. */
export function ThreadToggles({ conversationId, botPaused, status, handedOff, canReply, canManage }: { conversationId: string; botPaused: boolean; status: "OPEN" | "CLOSED"; handedOff: boolean; canReply: boolean; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(key: string, body: Record<string, unknown>, success: string) {
    setBusy(key);
    const result = await api("PATCH", `/api/admin/conversations/${conversationId}`, body);
    setBusy(null);
    if (!result.ok) return toast.error(result.data.error ?? "Could not update the conversation.");
    toast.success(success);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canReply && (
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => patch("bot", { botPaused: !botPaused }, botPaused ? "Assistant resumed." : "Assistant paused.")}>
          {busy === "bot" ? <Loader2 className="animate-spin" /> : botPaused ? <PlayCircle /> : <PauseCircle />}
          {botPaused ? "Resume assistant" : "Pause assistant"}
        </Button>
      )}
      {canReply && handedOff && (
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => patch("handover", { handedOff: false }, "Handover marked as dealt with.")}>
          <Bot /> Handover dealt with
        </Button>
      )}
      {canManage && (
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => patch("status", { status: status === "OPEN" ? "CLOSED" : "OPEN" }, status === "OPEN" ? "Conversation closed." : "Conversation reopened.")}>
          {busy === "status" && <Loader2 className="animate-spin" />}
          {status === "OPEN" ? "Close conversation" : "Reopen"}
        </Button>
      )}
    </div>
  );
}

/** Short labels on a conversation, for filtering and reporting. */
export function TagEditor({ conversationId, tags, canEdit }: { conversationId: string; tags: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(next: string[]) {
    setSaving(true);
    const result = await api("PATCH", `/api/admin/conversations/${conversationId}`, { tags: next });
    setSaving(false);
    if (!result.ok) return toast.error(result.data.error ?? "Could not save the tags.");
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags.</span>}
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
            #{tag}
            {canEdit && (
              <button type="button" onClick={() => save(tags.filter((entry) => entry !== tag))} aria-label={`Remove ${tag}`} className="text-muted-foreground hover:text-foreground" disabled={saving}>
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const tag = value.trim().toLowerCase().replace(/^#/, "").slice(0, 30);
            if (!tag || tags.includes(tag)) return;
            setValue("");
            void save([...tags, tag]);
          }}
        >
          <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Add a tag" className="h-8 text-xs" aria-label="New tag" maxLength={30} />
          <Button type="submit" size="sm" variant="outline" className="h-8" disabled={saving || !value.trim()}>
            Add
          </Button>
        </form>
      )}
    </div>
  );
}

/** Turn the conversation into a lead, a quote request or a ticket. */
export function ConvertActions({ conversationId, can }: { conversationId: string; can: { lead: boolean; quote: boolean; ticket: boolean } }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [category, setCategory] = useState("REPAIR");

  async function convert(kind: "LEAD" | "QUOTE" | "TICKET") {
    setBusy(kind);
    const result = await api<{ href?: string; reference?: string; kind?: string }>("POST", `/api/admin/conversations/${conversationId}/convert`, kind === "TICKET" ? { kind, category } : { kind });
    setBusy(null);
    if (!result.ok) return toast.error(result.data.error ?? "The record could not be created.");
    toast.success(`${result.data.kind} ${result.data.reference} ready.`);
    if (result.data.href) router.push(result.data.href);
  }

  if (!can.lead && !can.quote && !can.ticket) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {can.lead && (
          <Button variant="outline" size="sm" onClick={() => convert("LEAD")} disabled={busy !== null}>
            {busy === "LEAD" ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Lead
          </Button>
        )}
        {can.quote && (
          <Button variant="outline" size="sm" onClick={() => convert("QUOTE")} disabled={busy !== null}>
            {busy === "QUOTE" ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Quote request
          </Button>
        )}
      </div>
      {can.ticket && (
        <div className="flex gap-2">
          <Select value={category} onChange={(event) => setCategory(event.target.value)} className="h-9 text-[13px]" aria-label="Ticket type">
            {[...SERVICE_CATEGORIES, ...SUPPORT_CATEGORIES].map((value) => (
              <option key={value} value={value}>
                {TICKET_CATEGORY_LABEL[value]}
              </option>
            ))}
          </Select>
          <Button variant="outline" size="sm" onClick={() => convert("TICKET")} disabled={busy !== null}>
            {busy === "TICKET" ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Ticket
          </Button>
        </div>
      )}
    </div>
  );
}
