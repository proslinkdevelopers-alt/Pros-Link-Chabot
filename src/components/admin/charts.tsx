"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Console charts, drawn as plain SVG.
 *
 * Colour: one series is Pros-Link blue; a second series is orange. The pair
 * was checked with the data-viz palette validator on the white card surface
 * (normal-vision ΔE 38.6, worst colour-blind ΔE 29.2, both ≥ 3:1). Bars of one
 * measure all use the single blue — length already carries the value.
 * Every chart has a hover/focus readout and a data table, so no value is
 * available by colour or by hovering alone.
 */

const SERIES = { blue: "#1D5FE0", orange: "#eb6834" } as const;
const INK = { muted: "#6b7689", grid: "#e6e9f0", axis: "#c9cfdb" };

export interface TrendSeries {
  name: string;
  values: number[];
  color?: keyof typeof SERIES;
}

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * power) return step * power;
  }
  return 10 * power;
}

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Counts per day. One series draws as an area; two as lines with a legend and end labels. */
export function TrendChart({ labels, series, height = 220, label }: { labels: string[]; series: TrendSeries[]; height?: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const multi = series.length > 1;
  const pad = { top: 12, right: multi ? 84 : 16, bottom: 26, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...series.flatMap((entry) => entry.values)));
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const x = (index: number) => pad.left + (labels.length <= 1 ? plotW / 2 : (index / (labels.length - 1)) * plotW);
  const y = (value: number) => pad.top + plotH - (value / max) * plotH;

  const paths = useMemo(
    () =>
      series.map((entry) => {
        const line = entry.values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
        const area = `${line} L${x(entry.values.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
        return { line, area };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometry follows width and data
    [series, width, height, max]
  );

  function pick(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || labels.length === 0) return;
    const ratio = (clientX - rect.left - pad.left) / plotW;
    setActive(Math.min(labels.length - 1, Math.max(0, Math.round(ratio * (labels.length - 1)))));
  }

  const xTicks = labels.length > 2 ? [0, Math.floor((labels.length - 1) / 2), labels.length - 1] : labels.map((_, index) => index);

  return (
    <figure className="m-0">
      <div
        ref={box}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={0}
        role="img"
        aria-label={label}
        onPointerMove={(event) => pick(event.clientX)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((current) => current ?? labels.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setActive((current) => Math.max(0, (current ?? labels.length - 1) - 1));
          if (event.key === "ArrowRight") setActive((current) => Math.min(labels.length - 1, (current ?? 0) + 1));
        }}
      >
        <svg width={width} height={height} className="block max-w-full" aria-hidden>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? INK.axis : INK.grid} strokeWidth={1} />
              <text x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                {Number.isInteger(tick) ? tick.toLocaleString() : tick.toFixed(1)}
              </text>
            </g>
          ))}
          {xTicks.map((index) => (
            <text key={index} x={x(index)} y={height - 6} textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"} fontSize={11} fill={INK.muted}>
              {labels[index] ? dayLabel(labels[index]) : ""}
            </text>
          ))}
          {series.map((entry, index) => (
            <g key={entry.name}>
              {!multi && <path d={paths[index].area} fill={SERIES[entry.color ?? "blue"]} opacity={0.1} />}
              <path d={paths[index].line} fill="none" stroke={SERIES[entry.color ?? "blue"]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {multi && entry.values.length > 0 && (
                <>
                  <circle cx={x(entry.values.length - 1)} cy={y(entry.values.at(-1)!)} r={4} fill={SERIES[entry.color ?? "blue"]} stroke="#fff" strokeWidth={2} />
                  <text x={x(entry.values.length - 1) + 8} y={y(entry.values.at(-1)!)} dy="0.32em" fontSize={11} fill="#303a4d">
                    {entry.name}
                  </text>
                </>
              )}
            </g>
          ))}
          {active !== null && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + plotH} stroke={INK.axis} strokeWidth={1} />
              {series.map((entry) => (
                <circle key={entry.name} cx={x(active)} cy={y(entry.values[active] ?? 0)} r={4} fill={SERIES[entry.color ?? "blue"]} stroke="#fff" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
        {active !== null && labels[active] && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[8.5rem] rounded-lg border bg-card px-3 py-2 text-xs shadow-elevated"
            style={{ left: Math.min(Math.max(x(active) - 68, 0), width - 150) }}
          >
            <p className="mb-1 text-muted-foreground">{dayLabel(labels[active])}</p>
            {series.map((entry) => (
              <p key={entry.name} className="flex items-center gap-2">
                <span className="h-0.5 w-3 rounded" style={{ background: SERIES[entry.color ?? "blue"] }} aria-hidden />
                <strong className="tabular-nums">{entry.values[active] ?? 0}</strong>
                <span className="text-muted-foreground">{entry.name}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      {multi && (
        <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {series.map((entry) => (
            <span key={entry.name} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: SERIES[entry.color ?? "blue"] }} aria-hidden />
              {entry.name} · {entry.values.reduce((sum, value) => sum + value, 0).toLocaleString()}
            </span>
          ))}
        </figcaption>
      )}
      <DataTable
        head={["Date", ...series.map((entry) => entry.name)]}
        rows={labels.map((iso, index) => [dayLabel(iso), ...series.map((entry) => String(entry.values[index] ?? 0))])}
      />
    </figure>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  href?: string;
}

/**
 * One measure across categories, as horizontal bars in a single hue with the
 * value at the tip. Hovering or focusing a bar shows its share of the total.
 */
export function BarList({ rows, label, empty = "No data yet.", unit }: { rows: BarDatum[]; label: string; empty?: string; unit?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((row) => row.value));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!rows.length || total === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;

  return (
    <figure className="m-0">
      <ul className="space-y-2" aria-label={label}>
        {rows.map((row, index) => {
          const share = total ? Math.round((row.value / total) * 100) : 0;
          const body = (
            <>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate">{row.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{row.value.toLocaleString()}</span>
              </div>
              <div className="h-2">
                <div
                  className={cn("h-full rounded-r-[4px] transition-[filter]", active === index && "brightness-110")}
                  style={{ width: `${Math.max(row.value ? 2 : 0, (row.value / max) * 100)}%`, background: SERIES.blue }}
                />
              </div>
            </>
          );
          return (
            <li
              key={row.label}
              className="relative rounded-md outline-none focus-within:ring-2 focus-within:ring-ring"
              onPointerEnter={() => setActive(index)}
              onPointerLeave={() => setActive(null)}
            >
              {row.href ? (
                <a href={row.href} className="block rounded-md px-1 py-0.5 outline-none" onFocus={() => setActive(index)} onBlur={() => setActive(null)} aria-label={`${row.label}: ${row.value}${unit ? ` ${unit}` : ""}, ${share}%`}>
                  {body}
                </a>
              ) : (
                <div tabIndex={0} className="rounded-md px-1 py-0.5 outline-none" onFocus={() => setActive(index)} onBlur={() => setActive(null)} aria-label={`${row.label}: ${row.value}${unit ? ` ${unit}` : ""}, ${share}%`}>
                  {body}
                </div>
              )}
              {active === index && (
                <div className="pointer-events-none absolute -top-8 right-0 z-10 rounded-lg border bg-card px-2.5 py-1 text-xs shadow-elevated">
                  <strong className="tabular-nums">{row.value.toLocaleString()}</strong>
                  {unit ? ` ${unit}` : ""} <span className="text-muted-foreground">· {share}% of {total.toLocaleString()}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <DataTable head={["", unit ?? "Count", "Share"]} rows={rows.map((row) => [row.label, row.value.toLocaleString(), total ? `${Math.round((row.value / total) * 100)}%` : "0%"])} />
    </figure>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show the numbers</summary>
      <div className="scroll-slim mt-2 max-h-64 overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {head.map((cell, index) => (
                <th key={index} scope="col" className={cn("py-1 pr-3 font-semibold", index > 0 && "text-right")}>
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b last:border-0">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className={cn("py-1 pr-3", cellIndex > 0 && "text-right tabular-nums")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
