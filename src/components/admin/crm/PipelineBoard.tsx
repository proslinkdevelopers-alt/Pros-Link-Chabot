"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { api } from "../client/api";
import { toast } from "../client/toast";
import { PIPELINE_STAGES, STAGE_LABEL, TEMPERATURE_LABEL, type PipelineStage } from "@/lib/admin/labels";
import { cn, formatPkr } from "@/lib/utils";

export interface PipelineCard {
  id: string;
  reference: string;
  name: string;
  company: string | null;
  interest: string | null;
  stage: PipelineStage;
  value: number | null;
  temperature: string;
  owner: string | null;
  ageDays: number;
}

const COLUMN_TONE: Record<PipelineStage, string> = {
  NEW: "bg-sky-500",
  CONTACTED: "bg-indigo-400",
  QUALIFIED: "bg-indigo-600",
  QUOTE_REQUESTED: "bg-amber-500",
  QUOTED: "bg-violet-500",
  NEGOTIATION: "bg-orange-500",
  WON: "bg-emerald-600",
  LOST: "bg-rose-500",
};

/**
 * The sales pipeline as columns. Cards move by drag and drop or, for keyboard
 * and touch users, with the "Move to" select on each card. Every move is
 * saved through the same audited endpoint as the lead page.
 */
export function PipelineBoard({ cards: initial, canMove }: { cards: PipelineCard[]; canMove: boolean }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<PipelineStage | null>(null);
  useEffect(() => setCards(initial), [initial]);

  async function move(id: string, stage: PipelineStage) {
    const card = cards.find((entry) => entry.id === id);
    if (!card || card.stage === stage) return;
    let lostReason: string | null = null;
    if (stage === "LOST") {
      lostReason = window.prompt(`Why was ${card.name} lost? (optional)`) ?? null;
    }
    const previous = cards;
    setCards(cards.map((entry) => (entry.id === id ? { ...entry, stage } : entry)));
    const result = await api("PATCH", `/api/admin/leads/${id}`, { stage, ...(lostReason ? { lostReason } : {}) });
    if (!result.ok) {
      setCards(previous);
      toast.error(result.data.error ?? "Could not move the lead.");
      return;
    }
    toast.success(`${card.name} moved to ${STAGE_LABEL[stage]}.`);
    router.refresh();
  }

  return (
    <div className="scroll-slim relative -mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
      <div className="flex min-w-max gap-3">
        {PIPELINE_STAGES.map((stage) => {
          const column = cards.filter((card) => card.stage === stage);
          const total = column.reduce((sum, card) => sum + (card.value ?? 0), 0);
          return (
            <section
              key={stage}
              aria-label={STAGE_LABEL[stage]}
              onDragOver={(event) => {
                if (!canMove || !dragging) return;
                event.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((current) => (current === stage ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                const id = event.dataTransfer.getData("text/plain");
                if (id) void move(id, stage);
              }}
              className={cn("flex w-[17rem] shrink-0 flex-col rounded-xl border bg-secondary/40 transition-colors", over === stage && "border-primary bg-primary/5")}
            >
              <header className="flex items-center gap-2 px-3 pb-2 pt-3">
                <span className={cn("size-2 rounded-full", COLUMN_TONE[stage])} aria-hidden />
                <h2 className="text-[13px] font-semibold">{STAGE_LABEL[stage]}</h2>
                <span className="text-xs tabular-nums text-muted-foreground">{column.length}</span>
                {total > 0 && <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{formatPkr(total)}</span>}
              </header>
              <ol className="flex min-h-[6rem] flex-1 flex-col gap-2 px-2 pb-2">
                {column.map((card) => (
                  <li
                    key={card.id}
                    draggable={canMove}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", card.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragging(card.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={cn("rounded-lg border bg-card p-3 shadow-soft", canMove && "cursor-grab active:cursor-grabbing", dragging === card.id && "opacity-50")}
                  >
                    <div className="flex items-start gap-1.5">
                      {canMove && <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />}
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/leads/${card.id}`} className="block truncate text-[13px] font-semibold hover:text-primary hover:underline">
                          {card.name}
                        </Link>
                        {card.company && <p className="truncate text-xs text-muted-foreground">{card.company}</p>}
                      </div>
                    </div>
                    {card.interest && <p className="mt-2 line-clamp-2 text-xs">{card.interest}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/80">{TEMPERATURE_LABEL[card.temperature] ?? card.temperature}</span>
                      {card.value ? <span className="tabular-nums">{formatPkr(card.value)}</span> : null}
                      <span>{card.ageDays === 0 ? "today" : `${card.ageDays}d`}</span>
                      <span className="truncate">{card.owner ?? "Unassigned"}</span>
                    </div>
                    {canMove && (
                      <label className="mt-2 block">
                        <span className="sr-only">Move {card.name} to</span>
                        <select
                          value={card.stage}
                          onChange={(event) => void move(card.id, event.target.value as PipelineStage)}
                          className="h-7 w-full rounded-md border bg-background px-1.5 text-[11px] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {PIPELINE_STAGES.map((option) => (
                            <option key={option} value={option}>
                              {option === card.stage ? `In ${STAGE_LABEL[option]}` : `Move to ${STAGE_LABEL[option]}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </li>
                ))}
                {!column.length && <li className="grid flex-1 place-items-center rounded-lg border border-dashed py-6 text-[11px] text-muted-foreground">No leads</li>}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
