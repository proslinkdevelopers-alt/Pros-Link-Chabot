"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardList,
  LayoutGrid,
  Mail,
  Phone,
  RotateCcw,
  Search,
  ShoppingBag,
  UserRound,
  Wrench,
} from "lucide-react";
import { LogoMark } from "@/components/branding/Logo";
import { WhatsAppIcon } from "@/components/branding/WhatsAppIcon";
import { BRAND } from "@/config/brand";
import { CHAT_STARTS } from "@/lib/chat-start";
import { t, type Language } from "@/lib/i18n";
import { cn, generateConversationReference, shortId } from "@/lib/utils";
import type { ChatTurnResponse, Choice, StaffReply } from "@/types";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { MessageBubble, type ChatEntry } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

const STORAGE_KEY = "proslink.chat.v1";
const MAX_STORED = 80;
const POLL_MS = 6_000;

interface PersistedState {
  reference: string;
  entries: ChatEntry[];
  staffHandling?: boolean;
  lastStaffAt?: string;
}

export interface ChatContact {
  phone: string;
  email: string;
  whatsappUrl: string | null;
}

/** The brief's five welcome actions. */
const WELCOME_ACTIONS: Array<{ label: string; replyId: string; icon: typeof Search }> = [
  { label: "Explore Products", replyId: CHAT_STARTS.products.replyId, icon: Search },
  { label: "Request a Quote", replyId: CHAT_STARTS.quote.replyId, icon: ClipboardList },
  { label: "Service & Repair", replyId: CHAT_STARTS.service.replyId, icon: Wrench },
  { label: "Talk to Sales", replyId: CHAT_STARTS.sales.replyId, icon: ShoppingBag },
  { label: "Customer Support", replyId: CHAT_STARTS.support.replyId, icon: UserRound },
];

const WELCOME_TEXT = `Welcome to ${BRAND.name} 👋\n\nI'm the ${BRAND.assistant.name}. I can help you find office equipment, request a quote, arrange technical support, submit a service request, or connect you with our team.\n\nHow can I help you today?`;

/**
 * =============================================================================
 *  Pros-Link Assistant — web chat
 * =============================================================================
 *
 *  Each turn goes to `/api/chat`, which runs the same engine as WhatsApp and
 *  answers with messages: text, a row of buttons, or a list of options. The
 *  server keeps the conversation; the browser keeps only a random reference
 *  and a copy of the transcript so a reload shows where the customer was.
 *
 *  When a person from the team takes over, the page polls for their replies.
 * =============================================================================
 */
export function ChatWindow({ contact, start }: { contact: ChatContact; start: { replyId: string; label: string } | null }) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const [staffHandling, setStaffHandling] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const referenceRef = useRef("");
  const lastStaffAtRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ChatInputHandle>(null);
  const startedRef = useRef(false);

  // ------------------------------------------------------------- restore --
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as PersistedState) : null;
      if (saved?.reference && /^[A-Z]{2}-CONV-[A-Z2-9]{10}$/.test(saved.reference)) {
        referenceRef.current = saved.reference;
        setEntries(saved.entries ?? []);
        setStaffHandling(Boolean(saved.staffHandling));
        lastStaffAtRef.current = saved.lastStaffAt;
      }
    } catch {
      /* storage unavailable — start fresh */
    }
    if (!referenceRef.current) referenceRef.current = generateConversationReference();
    setHydrated(true);
  }, []);

  // ------------------------------------------------------------- persist --
  useEffect(() => {
    if (!hydrated) return;
    try {
      const state: PersistedState = {
        reference: referenceRef.current,
        entries: entries.slice(-MAX_STORED),
        staffHandling,
        lastStaffAt: lastStaffAtRef.current,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota or private mode — the chat still works in memory */
    }
  }, [entries, staffHandling, hydrated]);

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, busy]);

  // ---------------------------------------------------------------- send --
  const send = useCallback(
    async (input: { kind: "text"; text: string } | { kind: "reply"; replyId: string; label: string }) => {
      if (busy) return;
      const shown = input.kind === "text" ? input.text : input.label;
      setEntries((prev) => [...prev, { id: shortId(10), from: "user", text: shown }]);
      setBusy(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationRef: referenceRef.current,
            input: input.kind === "text" ? { kind: "text", text: input.text } : { kind: "reply", text: input.label, replyId: input.replyId },
          }),
        });
        const data = (await res.json().catch(() => null)) as (ChatTurnResponse & { error?: string }) | null;

        if (res.status === 409) {
          // The stored conversation cannot continue — start a new one quietly.
          referenceRef.current = generateConversationReference();
        }
        if (!res.ok || !data) throw new Error(data?.error ?? "Sorry, I couldn't reach the assistant. Please try again.");

        setLanguage(data.language);
        setStaffHandling(data.staffHandling);
        const replies: ChatEntry[] = data.messages.map((message) => ({ id: shortId(10), from: "bot", message }));
        if (data.records.length && replies.length) {
          const last = replies[replies.length - 1];
          if (last.from === "bot") last.records = data.records;
        }
        setEntries((prev) => [...prev, ...replies]);
      } catch (error) {
        const text = error instanceof Error ? error.message : "Sorry, something went wrong. Please try again.";
        setEntries((prev) => [...prev, { id: shortId(10), from: "bot", message: { type: "text", body: text } }]);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy]
  );

  const choose = useCallback((choice: Choice) => void send({ kind: "reply", replyId: choice.id, label: choice.title }), [send]);

  // A deep link from the site (?start=quote, ?category=printers) opens its flow once.
  useEffect(() => {
    if (!hydrated || !start || startedRef.current) return;
    startedRef.current = true;
    void send({ kind: "reply", replyId: start.replyId, label: start.label });
    window.history.replaceState(null, "", "/chat");
  }, [hydrated, start, send]);

  // ------------------------------------------------ replies from the team --
  useEffect(() => {
    if (!hydrated || !staffHandling) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const params = new URLSearchParams({ ref: referenceRef.current, after: lastStaffAtRef.current ?? new Date(0).toISOString() });
        const res = await fetch(`/api/chat/messages?${params}`);
        if (!res.ok) return;
        const { replies } = (await res.json()) as { replies: StaffReply[] };
        if (cancelled || !replies.length) return;
        lastStaffAtRef.current = replies[replies.length - 1].at;
        setEntries((prev) => {
          const seen = new Set(prev.map((entry) => entry.id));
          return [...prev, ...replies.filter((reply) => !seen.has(reply.id)).map((reply) => ({ id: reply.id, from: "staff" as const, text: reply.body }))];
        });
      } catch {
        /* try again on the next tick */
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hydrated, staffHandling]);

  function reset() {
    referenceRef.current = generateConversationReference();
    lastStaffAtRef.current = undefined;
    setEntries([]);
    setStaffHandling(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  const empty = entries.length === 0 && !busy;

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col bg-background" aria-label={BRAND.assistant.name}>
        {/* Header */}
        <header className="dark flex items-center gap-3 bg-brand-ink px-3 py-2.5 text-foreground sm:px-4">
          <Link href="/" aria-label={`${BRAND.name} home`} className="grid size-9 place-items-center rounded-lg text-white/70 hover:bg-white/5 hover:text-white md:hidden">
            <ArrowLeft className="size-4" />
          </Link>
          <LogoMark className="size-9 shrink-0" />
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-[15px] font-semibold text-white">{BRAND.assistant.name}</h1>
            <p className="flex items-center gap-1.5 truncate text-xs text-white/60">
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
              {BRAND.assistant.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            {contact.whatsappUrl && (
              <a
                href={contact.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Continue on WhatsApp"
                title="Continue on WhatsApp"
                className="grid size-9 place-items-center rounded-lg text-white/75 hover:bg-white/5 hover:text-white"
              >
                <WhatsAppIcon className="size-[18px]" />
              </a>
            )}
            {contact.phone && (
              <a
                href={`tel:+${contact.phone.replace(/\D/g, "")}`}
                aria-label={`Call ${BRAND.name}`}
                title={`Call ${contact.phone}`}
                className="grid size-9 place-items-center rounded-lg text-white/75 hover:bg-white/5 hover:text-white"
              >
                <Phone className="size-[18px]" />
              </a>
            )}
            <HeaderButton label={t("chat.person", language)} onClick={() => void send({ kind: "reply", replyId: "a:talk_to_person", label: t("chat.person", language) })} disabled={busy}>
              <UserRound className="size-[18px]" />
            </HeaderButton>
            <HeaderButton label={t("chat.menu", language)} onClick={() => void send({ kind: "reply", replyId: "a:main_menu", label: t("chat.menu", language) })} disabled={busy}>
              <LayoutGrid className="size-[18px]" />
            </HeaderButton>
            <HeaderButton label={t("chat.newChat", language)} onClick={reset} disabled={busy}>
              <RotateCcw className="size-[18px]" />
            </HeaderButton>
          </div>
        </header>

        {/* Transcript */}
        <div ref={scrollRef} className="scroll-slim flex-1 overflow-y-auto px-3 py-5 sm:px-6" aria-live="polite" aria-busy={busy}>
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {empty ? (
              <Welcome onPick={(action) => void send({ kind: "reply", replyId: action.replyId, label: action.label })} />
            ) : (
              entries.map((entry) => <MessageBubble key={entry.id} entry={entry} onChoose={choose} disabled={busy} />)
            )}
            {busy && (
              <div className="flex gap-2.5">
                <LogoMark className="mt-0.5 size-8 shrink-0" />
                <TypingIndicator />
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t bg-card/60 px-3 pb-3 pt-2.5 sm:px-6">
          <div className="mx-auto max-w-3xl">
            {staffHandling && (
              <p className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900" role="status">
                <UserRound className="size-3.5 shrink-0" aria-hidden />
                {t("chat.staff", language)}
              </p>
            )}
            <ChatInput ref={inputRef} onSend={(text) => void send({ kind: "text", text })} disabled={busy || !hydrated} placeholder={t("chat.placeholder", language)} />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">{t("chat.disclaimer", language)}</p>
          </div>
        </div>
      </section>

      {/* Side panel — wide screens */}
      <aside className="scroll-slim hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l bg-card p-5 lg:flex" aria-label="Quick actions">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Quick actions</p>
          <ul className="mt-3 space-y-1.5">
            {[...WELCOME_ACTIONS, { label: "Track My Request", replyId: CHAT_STARTS.track.replyId, icon: ClipboardList }].map((action) => (
              <li key={action.replyId}>
                <button
                  type="button"
                  disabled={busy || !hydrated}
                  onClick={() => void send({ kind: "reply", replyId: action.replyId, label: action.label })}
                  className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition hover:border-primary/30 hover:bg-primary/[0.03] disabled:opacity-50"
                >
                  <action.icon className="size-4 shrink-0 text-primary" aria-hidden />
                  {action.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {(contact.phone || contact.email || contact.whatsappUrl) && (
          <div className="rounded-xl border bg-background p-4 text-sm">
            <p className="font-semibold">Prefer to speak to us?</p>
            <ul className="mt-2.5 space-y-2 text-muted-foreground">
              {contact.phone && (
                <li>
                  <a href={`tel:+${contact.phone.replace(/\D/g, "")}`} className="inline-flex items-center gap-2 hover:text-primary">
                    <Phone className="size-3.5" /> {contact.phone}
                  </a>
                </li>
              )}
              {contact.whatsappUrl && (
                <li>
                  <a href={contact.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-primary">
                    <WhatsAppIcon className="size-3.5" /> WhatsApp
                  </a>
                </li>
              )}
              {contact.email && (
                <li className="break-all">
                  <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-2 hover:text-primary">
                    <Mail className="size-3.5 shrink-0" /> {contact.email}
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}

        <Link href="/" className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-3.5" /> Back to {BRAND.name}
        </Link>
      </aside>
    </div>
  );
}

function HeaderButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-lg text-white/75 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Welcome({ onPick }: { onPick: (action: (typeof WELCOME_ACTIONS)[number]) => void }) {
  return (
    <div className="flex gap-2.5 animate-fade-in-up">
      <LogoMark className="mt-0.5 size-8 shrink-0" />
      <div className="min-w-0 max-w-[88%] md:max-w-[75%]">
        <div className="whitespace-pre-line rounded-xl rounded-tl-sm border bg-card px-4 py-3 text-[15px] leading-relaxed shadow-soft">
          {WELCOME_TEXT}
        </div>
        <div className={cn("mt-2.5 grid gap-2 sm:grid-cols-2")}>
          {WELCOME_ACTIONS.map((action) => (
            <button
              key={action.replyId}
              type="button"
              onClick={() => onPick(action)}
              className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-card px-3.5 py-2.5 text-left text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/45 hover:bg-primary/[0.03]"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/[0.08] text-primary">
                <action.icon className="size-4" aria-hidden />
              </span>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
