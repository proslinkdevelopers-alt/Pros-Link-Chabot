"use client";

import { useEffect, useRef, useState } from "react";
import { List, Loader2, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, humanise, isUrduScript } from "@/lib/utils";
import type { Outgoing } from "@/lib/bot/render";
import { BRAND } from "@/config/brand";

/**
 * A WhatsApp conversation with the real assistant, inside the console.
 *
 * Buttons and lists behave as they do on a phone, the live configuration and
 * model answer, and nothing reaches WhatsApp or the CRM — the panel on the
 * right shows what the team *would* have received instead.
 */

type Bubble = { from: "customer" } & { text: string } | ({ from: "bot" } & { message: Outgoing });

interface SimState {
  details: Record<string, unknown>;
  state: unknown;
  records: { lead?: string; meeting?: string; ticket?: string };
  history: Array<{ role: "user" | "assistant"; content: string }>;
  language: string;
  optedOut: boolean;
  turns: number;
}

const START: SimState = { details: {}, state: undefined, records: {}, history: [], language: "en", optedOut: false, turns: 0 };

export function BotSimulator() {
  const [channel, setChannel] = useState<"WHATSAPP" | "WEB">("WHATSAPP");
  const [phone, setPhone] = useState("+923001234567");
  const [profileName, setProfileName] = useState("Test Customer");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [sim, setSim] = useState<SimState>(START);
  const [effects, setEffects] = useState<Array<{ type: string; summary: string; detail?: unknown }>>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openList, setOpenList] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, busy]);

  async function turn(input: { kind: "text" | "reply"; text: string; replyId?: string }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setOpenList(null);
    setBubbles((current) => [...current, { from: "customer", text: input.text }]);

    try {
      const res = await fetch("/api/admin/bot/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, channel, phone, profileName: channel === "WHATSAPP" ? profileName || undefined : undefined, ...sim }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "The turn failed.");

      setBubbles((current) => [...current, ...(data.sent as Outgoing[]).map((message) => ({ from: "bot" as const, message }))]);
      setEffects((current) => [...(data.effects ?? []).map((effect: (typeof effects)[number]) => effect).reverse(), ...current].slice(0, 60));
      setSim({
        details: data.details,
        state: data.state,
        records: data.records,
        history: data.history,
        language: data.language,
        optedOut: data.optedOut,
        turns: sim.turns + 1,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The turn failed.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setBubbles([]);
    setSim(START);
    setEffects([]);
    setError(null);
  }

  const state = (sim.state ?? {}) as {
    flow?: { id: string; pending?: string };
    intent?: string;
    team?: string;
    score?: { value: number; temperature: string; reasons: string[] };
    trail?: string[];
  };
  const details = Object.entries(sim.details).filter(([, value]) => typeof value === "string" && value);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="flex h-[78dvh] flex-col overflow-hidden p-0">
        <div className={cn("flex flex-wrap items-center gap-2 border-b px-4 py-3 text-white", channel === "WHATSAPP" ? "bg-[#075E54]" : "bg-brand-ink")}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{BRAND.assistant.name}</p>
            <p className="text-[11px] text-white/70">{channel === "WHATSAPP" ? "WhatsApp" : "Website"} simulator · nothing is sent or saved</p>
          </div>
          <select
            value={channel}
            onChange={(event) => setChannel(event.target.value as "WHATSAPP" | "WEB")}
            disabled={sim.turns > 0}
            aria-label="Channel"
            className="h-8 rounded-md border border-white/20 bg-white/10 px-2 text-xs text-white [&>option]:text-foreground"
          >
            <option value="WHATSAPP">WhatsApp</option>
            <option value="WEB">Website</option>
          </select>
          {channel === "WHATSAPP" && (
          <>
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="h-8 w-40 border-white/20 bg-white/10 text-xs text-white placeholder:text-white/50"
            aria-label="Customer phone number"
            disabled={sim.turns > 0}
          />
          <Input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            className="h-8 w-36 border-white/20 bg-white/10 text-xs text-white placeholder:text-white/50"
            placeholder="WhatsApp name"
            aria-label="WhatsApp profile name"
            disabled={sim.turns > 0}
          />
          </>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-white hover:bg-white/10 hover:text-white" onClick={reset}>
            <RotateCcw /> Restart
          </Button>
        </div>

        <div ref={scroller} className="scroll-slim flex-1 space-y-2 overflow-y-auto bg-[#ECE5DD] p-4 dark:bg-[#0B141A]">
          {!bubbles.length && (
            <p className="mx-auto mt-10 max-w-sm rounded-xl bg-white/80 p-3 text-center text-xs text-muted-foreground dark:bg-white/5">
              Say “Hi”, tap through the menus, or write the way a customer would — “mujhe apne business ke liye whatsapp chatbot chahiye”.
            </p>
          )}

          {bubbles.map((bubble, index) =>
            bubble.from === "customer" ? (
              <div key={index} className="flex justify-end">
                <p className={cn("max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#DCF8C6] px-3 py-2 text-sm text-black shadow-sm dark:bg-[#005C4B] dark:text-white", isUrduScript(bubble.text) && "urdu")}>
                  {bubble.text}
                </p>
              </div>
            ) : (
              <BotBubble
                key={index}
                message={bubble.message}
                listOpen={openList === index}
                onToggleList={() => setOpenList(openList === index ? null : index)}
                onChoose={(id, title) => void turn({ kind: "reply", text: title, replyId: id })}
                disabled={busy}
              />
            )
          )}

          {busy && (
            <div className="flex">
              <span className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs text-muted-foreground shadow-sm dark:bg-[#202C33]">
                <Loader2 className="size-3 animate-spin" /> typing…
              </span>
            </div>
          )}
        </div>

        {error && <p className="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive">{error}</p>}

        <form
          className="flex gap-2 border-t bg-card p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft.trim();
            if (!text) return;
            setDraft("");
            void turn({ kind: "text", text });
          }}
        >
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type a message" aria-label="Message" />
          <Button type="submit" variant="brand" size="icon" disabled={busy || !draft.trim()} aria-label="Send">
            <Send />
          </Button>
        </form>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">What the assistant knows</h2>
          <dl className="mt-3 space-y-1.5 text-xs">
            <Row label="Language" value={humanise(sim.language)} />
            <Row label="Intent" value={state.intent ?? "—"} />
            <Row label="Team" value={state.team ?? "—"} />
            <Row label="Open flow" value={state.flow ? `${state.flow.id}${state.flow.pending ? ` → ${state.flow.pending}` : ""}` : "—"} />
            <Row label="Lead score" value={state.score ? `${state.score.value}/100 · ${humanise(state.score.temperature)}` : "—"} />
            {sim.optedOut && <Row label="Subscription" value="Opted out" />}
          </dl>
          {state.score?.reasons.length ? (
            <p className="mt-2 text-[11px] text-muted-foreground">{state.score.reasons.join(" · ")}</p>
          ) : null}
          {details.length > 0 && (
            <dl className="mt-3 space-y-1.5 border-t pt-3 text-xs">
              {details.map(([key, value]) => (
                <Row key={key} label={humanise(key.replace(/([A-Z])/g, "_$1"))} value={String(value)} />
              ))}
            </dl>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">What the team would receive</h2>
          {effects.length ? (
            <ul className="scroll-slim mt-3 max-h-[42dvh] space-y-2 overflow-y-auto text-xs">
              {effects.map((effect, index) => (
                <li key={index} className={cn("rounded-lg border px-2.5 py-2", effect.type === "event" && "border-dashed text-muted-foreground")}>
                  <p className="font-medium">{effect.summary}</p>
                  {typeof effect.detail === "string" && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-muted-foreground">Summary sent to the team</summary>
                      <pre className="mt-1 whitespace-pre-wrap font-sans text-[11px] leading-relaxed">{effect.detail}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Leads, quotes, tickets, handovers and events appear here.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
    </div>
  );
}

function BotBubble({
  message,
  listOpen,
  onToggleList,
  onChoose,
  disabled,
}: {
  message: Outgoing;
  listOpen: boolean;
  onToggleList: () => void;
  onChoose: (id: string, title: string) => void;
  disabled: boolean;
}) {
  const body = message.body === "👇" ? "" : message.body;
  return (
    <div className="flex max-w-[85%] flex-col gap-1">
      <div className="rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-black shadow-sm dark:bg-[#202C33] dark:text-white">
        {body && <WhatsAppText text={body} />}
        {message.type !== "text" && message.footer && (
          <p className="mt-1 text-[11px] text-black/45 dark:text-white/45">{message.footer}</p>
        )}
        {message.type === "list" && (
          <button
            type="button"
            onClick={onToggleList}
            className="mt-2 flex w-full items-center justify-center gap-1.5 border-t border-black/10 pt-2 text-[13px] font-medium text-[#00A5F4] dark:border-white/10"
          >
            <List className="size-3.5" /> {message.button}
          </button>
        )}
      </div>

      {message.type === "buttons" &&
        message.buttons.map((button) => (
          <button
            key={button.id}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(button.id, button.title)}
            className="rounded-xl bg-white py-2 text-[13px] font-medium text-[#00A5F4] shadow-sm transition hover:bg-white/80 disabled:opacity-60 dark:bg-[#202C33]"
          >
            {button.title}
          </button>
        ))}

      {message.type === "list" && listOpen && (
        <div className="overflow-hidden rounded-xl bg-white shadow-md dark:bg-[#202C33]">
          {message.rows.map((row) => (
            <button
              key={row.id}
              type="button"
              disabled={disabled}
              onClick={() => onChoose(row.id, row.title)}
              className="block w-full border-b border-black/5 px-3 py-2 text-left last:border-0 hover:bg-black/5 disabled:opacity-60 dark:border-white/5 dark:hover:bg-white/5"
            >
              <span className="block text-[13px] text-black dark:text-white">{row.title}</span>
              {row.description && <span className="block text-[11px] text-black/50 dark:text-white/50">{row.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** *bold* and _italic_, as WhatsApp renders them. */
function WhatsAppText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <p className={cn("whitespace-pre-wrap leading-relaxed", isUrduScript(text) && "urdu")}>
      {parts.map((part, index) =>
        /^\*[^*]+\*$/.test(part) ? (
          <strong key={index}>{part.slice(1, -1)}</strong>
        ) : /^_[^_]+_$/.test(part) ? (
          <em key={index}>{part.slice(1, -1)}</em>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </p>
  );
}
