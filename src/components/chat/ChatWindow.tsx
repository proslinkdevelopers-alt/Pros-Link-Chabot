"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarCheck,
  FileText,
  LayoutGrid,
  LifeBuoy,
  Mail,
  Phone,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { SuggestedQuestions } from "./SuggestedQuestions";
import { MenuPanel } from "./MenuPanel";
import { ChatInput } from "./ChatInput";
import { LogoMark } from "@/components/branding/Logo";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { MARKETING_QUICK_REPLIES } from "@/data/marketing/menu";
import { MARKETING_SERVICES } from "@/data/marketing/services";
import { detectLanguage, speechTagFor, t, type Language } from "@/lib/i18n";
import { cn, generateConversationReference, shortId } from "@/lib/utils";
import type { ChatMessage, ChatStreamEvent } from "@/types";

/**
 * Bumped from v1 when BITSOL Institute was retired, so a returning visitor's
 * saved Institute transcript is not restored into a Marketing-only assistant.
 */
const STORAGE_KEY = "bitsol.chat.v2";

interface PersistedState {
  reference: string;
  messages: ChatMessage[];
}

/**
 * The three things people come to do, offered in the desktop rail. Each opens
 * the conversation with the representative rather than a form — it asks for
 * whatever it needs from there.
 */
const RAIL_ACTIONS: Array<{ label: string; icon: typeof FileText; prompt: string }> = [
  { label: "Request a quote", icon: FileText, prompt: "I'd like a quote for a project." },
  { label: "Book a consultation", icon: CalendarCheck, prompt: "I'd like to book a free consultation." },
  { label: "Get support", icon: LifeBuoy, prompt: "I'm an existing client and need help with my project." },
];

/**
 * =============================================================================
 *  BITSOL AI Assistant — chat surface
 * =============================================================================
 *
 *  Owns the transcript and the streaming request. The transcript is persisted
 *  with its conversation reference, which is what gives the conversation
 *  memory across reloads — and what the server keys the customer's details to.
 *
 *  On wide screens a rail sits beside the transcript with the common requests
 *  and the full service list, so a visitor can start without knowing what to
 *  type; on a phone the same content lives behind the Menu button.
 * =============================================================================
 */
export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [language, setLanguage] = useState<Language>("en");
  const [streaming, setStreaming] = useState(false);
  const [voiceOut, setVoiceOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** `null` shows the default chips; an empty list hides them. */
  const [quickReplies, setQuickReplies] = useState<string[] | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const conversationRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------- restore --
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        conversationRef.current = parsed.reference ?? generateConversationReference();
        setMessages(parsed.messages ?? []);
      } else {
        conversationRef.current = generateConversationReference();
      }
    } catch {
      conversationRef.current = generateConversationReference();
    }
    setHydrated(true);
  }, []);

  // ---------------------------------------------------------------- persist --
  useEffect(() => {
    if (!hydrated || !conversationRef.current) return;
    const state: PersistedState = { reference: conversationRef.current, messages };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota or private-mode failure — the conversation still works in memory.
    }
  }, [messages, hydrated]);

  // Keep the newest content in view. The welcome screen is left alone so its
  // headline stays visible on a short screen.
  useEffect(() => {
    if (!messages.length) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechTagFor(text);
    window.speechSynthesis.speak(utterance);
  }, []);

  // ------------------------------------------------------------------- send --
  const send = useCallback(
    async (text: string) => {
      if (streaming || !text.trim()) return;

      setLanguage(detectLanguage(text));

      const userMsg: ChatMessage = { id: shortId(12), role: "user", content: text };
      const assistantId = shortId(12);
      const history = [...messages, userMsg];

      setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // The reply is finished at `done`, but the stream stays open a moment
      // longer to report CRM records — the composer must not wait for that.
      // Guarded so a late close cannot end a newer message's streaming state.
      const finish = () => {
        if (abortRef.current !== controller) return;
        abortRef.current = null;
        setStreaming(false);
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationRef: conversationRef.current,
            messages: history.map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(
            (await res.json().catch(() => null))?.error ?? "Request failed"
          );
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload) continue;

            let event: ChatStreamEvent;
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }

            if (event.type === "meta") {
              setLanguage(event.language);
            } else if (event.type === "chunk") {
              full += event.text;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: full } : m))
              );
            } else if (event.type === "done") {
              setQuickReplies(event.suggestions ?? null);
              if (voiceOut && full) speak(full);
              finish();
            } else if (event.type === "capture") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, records: [...(m.records ?? []), ...event.records] }
                    : m
                )
              );
            } else if (event.type === "error") {
              full = event.message;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: full } : m))
              );
              finish();
            }
          }
        }
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      m.content ||
                      "Sorry, I couldn't reach the assistant. Please check your connection and try again.",
                  }
                : m
            )
          );
        }
      } finally {
        finish();
      }
    },
    [messages, streaming, voiceOut, speak]
  );

  // -------------------------------------------------------------- controls --
  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  function reset() {
    stop();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    conversationRef.current = generateConversationReference();
    setMessages([]);
    setQuickReplies(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  // --------------------------------------------------------------- rendering -
  const isEmpty = messages.length === 0;
  const chips = quickReplies ?? MARKETING_QUICK_REPLIES;
  const lastMessage = messages[messages.length - 1];
  const awaitingFirstToken =
    streaming && lastMessage?.role === "assistant" && !lastMessage.content;

  return (
    <div className="relative flex h-full overflow-hidden">
      <MenuPanel
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onPrompt={(prompt) => void send(prompt)}
      />

      {/* Desktop rail */}
      <aside className="scroll-slim hidden w-72 shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-white/[0.015] lg:flex">
        <div className="p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
            Start here
          </p>
          <div className="mt-3 space-y-1.5">
            {RAIL_ACTIONS.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={streaming}
                onClick={() => void send(item.prompt)}
                className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-left text-[13px] font-medium text-white/85 transition hover:border-brand-cyan/40 hover:bg-brand-cyan/[0.06] hover:text-white disabled:opacity-50"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white shadow-brand">
                  <item.icon className="size-4" />
                </span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-white/[0.06] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
            Our services
          </p>
          <ul className="mt-3 space-y-0.5">
            {MARKETING_SERVICES.map((service) => (
              <li key={service.slug}>
                <button
                  type="button"
                  disabled={streaming}
                  onClick={() =>
                    void send(`Tell me about ${service.name} — what's included, the process and pricing.`)
                  }
                  className="group flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-white/60 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
                >
                  <span className="truncate">{service.name}</span>
                  <span className="size-1 shrink-0 rounded-full bg-brand-cyan opacity-0 transition group-hover:opacity-100" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto border-t border-white/[0.06] p-5 text-[12px] text-white/55">
          <p className="font-semibold text-white/80">Prefer to speak to us?</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 px-2.5 text-white/75 hover:bg-white/5 hover:text-white lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <LayoutGrid className="size-4" />
              {t("chat.menu", language)}
            </Button>
            <span className="hidden items-center gap-2 text-[12px] text-white/50 lg:inline-flex">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-cyan/60" />
                <span className="relative inline-flex size-2 rounded-full bg-brand-cyan" />
              </span>
              {t("chat.online", language)}
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "gap-1.5 px-2.5 hover:bg-white/5",
                voiceOut ? "text-brand-cyan" : "text-white/60 hover:text-white"
              )}
              onClick={() => {
                if (voiceOut && typeof window !== "undefined") {
                  window.speechSynthesis?.cancel();
                }
                setVoiceOut((v) => !v);
              }}
              aria-pressed={voiceOut}
            >
              {voiceOut ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              <span className="hidden sm:inline">{t("chat.voice", language)}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 px-2.5 text-white/60 hover:bg-white/5 hover:text-white"
              onClick={reset}
            >
              <RotateCcw className="size-4" />
              <span className="hidden sm:inline">{t("chat.newChat", language)}</span>
            </Button>
          </div>
        </div>

        {/* Transcript */}
        <div ref={scrollRef} className="scroll-slim flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {isEmpty ? (
            <div className="flex min-h-full flex-col items-center justify-center gap-9 py-6">
              <div className="flex flex-col items-center text-center">
                <span className="relative mb-6 grid size-16 place-items-center">
                  <span className="absolute inset-0 rounded-full bg-brand-cyan/25 blur-xl" aria-hidden />
                  <LogoMark className="relative size-full" />
                </span>
                <p className="eyebrow">{BRAND.name} · AI Concierge</p>
                <h2 className="mt-4 max-w-xl text-balance text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
                  <span className="text-gradient">{t("welcome.title", language)}</span>
                </h2>
                <p className="mt-3 max-w-md text-balance text-sm leading-relaxed text-white/55">
                  {t("welcome.subtitle", language)}
                </p>
              </div>
              <SuggestedQuestions language={language} onPick={(prompt) => void send(prompt)} />
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.map((message) =>
                message.role === "assistant" && !message.content && awaitingFirstToken ? (
                  <div key={message.id} className="flex gap-3">
                    <span className="mt-1 size-8 shrink-0" />
                    <TypingIndicator />
                  </div>
                ) : (
                  <MessageBubble key={message.id} message={message} onSpeak={speak} />
                )
              )}
            </div>
          )}
        </div>

        {/* Quick replies + composer */}
        <div className="border-t border-white/[0.06] px-4 pb-3 pt-3 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-2.5">
            {!isEmpty && chips.length > 0 && (
              <div className="scroll-slim flex gap-2 overflow-x-auto pb-0.5">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={streaming}
                    onClick={() => void send(chip)}
                    className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-white/75 transition hover:border-brand-cyan/50 hover:bg-brand-cyan/[0.07] hover:text-white disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            <ChatInput
              onSend={(text) => void send(text)}
              disabled={streaming}
              streaming={streaming}
              onStop={stop}
              placeholder={t("chat.placeholder", language)}
            />

            <p className="text-center text-[11px] text-white/35">
              {t("chat.disclaimer", language)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
