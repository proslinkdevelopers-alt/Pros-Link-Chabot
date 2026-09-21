"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/ui/field";

/**
 * =============================================================================
 *  Broadcast composer
 * =============================================================================
 *
 *  Four decisions, in the order they actually matter: which approved template,
 *  what fills its placeholders, who receives it, and — separately, from the
 *  campaign's own row — whether to send.
 *
 *  Creating never sends. The audience count is fetched live as the filter
 *  changes, so the number on screen is the number of people who will be
 *  messaged, and it is fetched from the server rather than estimated here
 *  because opt-outs and blocks are applied in the same query that builds the
 *  recipient list.
 * =============================================================================
 */

export interface ComposerTemplate {
  id: string;
  name: string;
  metaName: string;
  languageCode: string;
  body: string;
  headerText: string | null;
  /** TEXT, IMAGE, VIDEO, DOCUMENT — or null when the template has no header. */
  headerFormat: string | null;
  footerText: string | null;
  variables: string[];
}

type ParameterKind = "contactName" | "static" | "contactPhone";

interface ParameterDraft {
  kind: ParameterKind;
  value: string;
  fallback: string;
}

const PARAMETER_LABELS: Record<ParameterKind, string> = {
  contactName: "Contact's WhatsApp name",
  static: "The same text for everyone",
  contactPhone: "Contact's phone number",
};

/** Header formats that carry a file Meta needs handed to it on every send. */
const MEDIA_HEADERS = new Set(["IMAGE", "VIDEO", "DOCUMENT"]);

/** What the server made of an uploaded list. */
interface ImportReport {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  optedOut: number;
  blocked: number;
  sendable: number;
  known: number;
  samples: Array<{ raw: string; reason: string }>;
  preview: Array<{ phone: string; name: string | null }>;
}

function countPlaceholders(text: string): number {
  const found = text.match(/\{\{\s*(\d+)\s*\}\}/g);
  if (!found) return 0;
  return Math.max(...found.map((token) => Number(token.replace(/\D/g, "")) || 0));
}

/** Mirrors the server's preview so the composer and the saved row agree. */
function render(body: string, values: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index: string) => {
    const value = values[Number(index) - 1];
    return value?.trim() ? value : match;
  });
}

export function BroadcastComposer({
  templates,
}: {
  /** Approved templates only — nothing else can be broadcast. */
  templates: ComposerTemplate[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [parameters, setParameters] = useState<ParameterDraft[]>([]);
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [audienceKind, setAudienceKind] = useState<"segment" | "list">("segment");
  const [numbers, setNumbers] = useState("");
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [includeUnrouted, setIncludeUnrouted] = useState(false);
  const [activeWithinDays, setActiveWithinDays] = useState<string>("");
  const [limit, setLimit] = useState<string>("");

  const [reach, setReach] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  const template = templates.find((t) => t.id === templateId) ?? null;
  const placeholders = template ? countPlaceholders(template.body) : 0;
  const needsMedia = Boolean(
    template?.headerFormat && MEDIA_HEADERS.has(template.headerFormat.toUpperCase())
  );

  // Resize the parameter list whenever the chosen template changes, keeping
  // whatever the person already typed for the slots that still exist.
  useEffect(() => {
    setParameters((current) =>
      Array.from(
        { length: placeholders },
        (_, index) =>
          current[index] ?? { kind: "contactName" as ParameterKind, value: "", fallback: "there" }
      )
    );
  }, [placeholders, templateId]);

  // Live audience count for a segment. Debounced because the day and limit
  // fields fire on every keystroke, and each change is a database count.
  useEffect(() => {
    if (!open || audienceKind !== "segment") return;
    let cancelled = false;
    setCounting(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/broadcasts/audience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            includeUnrouted,
            activeWithinDays: activeWithinDays ? Number(activeWithinDays) : null,
            limit: limit ? Number(limit) : null,
          }),
        });
        const data = (await res.json().catch(() => null)) as { count?: number } | null;
        if (!cancelled) setReach(res.ok ? (data?.count ?? 0) : null);
      } catch {
        if (!cancelled) setReach(null);
      } finally {
        if (!cancelled) setCounting(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, audienceKind, includeUnrouted, activeWithinDays, limit]);

  // The same parse the create endpoint will run, so what the report says is
  // what will happen. Debounced harder than the segment count: this one is
  // fired by typing or pasting thousands of lines.
  useEffect(() => {
    if (!open || audienceKind !== "list") return;

    if (!numbers.trim()) {
      setImportReport(null);
      setReach(null);
      return;
    }

    let cancelled = false;
    setImporting(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/broadcasts/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: numbers }),
        });
        const data = (await res.json().catch(() => null)) as ImportReport | null;
        if (cancelled) return;
        if (res.ok && data) {
          setImportReport(data);
          setReach(data.sendable);
        } else {
          setImportReport(null);
          setReach(null);
        }
      } catch {
        if (!cancelled) {
          setImportReport(null);
          setReach(null);
        }
      } finally {
        if (!cancelled) setImporting(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, audienceKind, numbers]);

  const previewValues = parameters.map((parameter) =>
    parameter.kind === "static"
      ? parameter.value.trim() || "…"
      : parameter.kind === "contactPhone"
        ? "+923001234567"
        : "Ali"
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!template) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          templateId: template.id,
          headerMediaUrl: needsMedia ? headerMediaUrl.trim() : undefined,
          parameters: parameters.map((parameter) =>
            parameter.kind === "static"
              ? { kind: "static", value: parameter.value.trim() }
              : parameter.kind === "contactPhone"
                ? { kind: "contactPhone" }
                : { kind: "contactName", fallback: parameter.fallback.trim() || undefined }
          ),
          numbers: audienceKind === "list" ? numbers : undefined,
          audience: {
            kind: audienceKind,
            includeUnrouted,
            activeWithinDays: activeWithinDays ? Number(activeWithinDays) : null,
            limit: limit ? Number(limit) : null,
          },
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        error?: string;
        reference?: string;
        recipients?: number;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not create that broadcast.");

      setNotice(
        `Draft ${data?.reference ?? ""} created for ${data?.recipients ?? 0} contacts. ` +
          "Nothing has been sent — use Send on its row when you are ready."
      );
      setTitle("");
      setTemplateId("");
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create that broadcast.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Megaphone className="size-4" /> New broadcast
        </Button>
        {notice && (
          <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            {notice}
          </p>
        )}
      </div>
    );
  }

  if (!templates.length) {
    return (
      <div className="rounded-xl border bg-secondary/40 p-4">
        <p className="text-xs text-muted-foreground">
          No approved templates yet. A broadcast reaches people outside the 24-hour reply
          window, so Meta only allows it through a template it has approved — sync or submit
          one from WhatsApp Templates first.
        </p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border bg-secondary/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Campaign name" required hint="Internal only — recipients never see it.">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Q3 — WhatsApp automation launch offer"
            required
          />
        </Field>

        <Field label="Approved template" required>
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
            <option value="">Choose a template…</option>
            {templates.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} ({option.languageCode})
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {template && (
        <>
          {needsMedia && (
            <Field
              label={`${template.headerFormat?.toLowerCase() ?? "media"} header`}
              required
              hint="Meta approves the format of a media header but never keeps the file, so it must be sent with every message. Paste a public URL, or a media ID already uploaded to the account."
            >
              <Input
                type="url"
                value={headerMediaUrl}
                onChange={(e) => setHeaderMediaUrl(e.target.value)}
                placeholder="https://pros-link.com/campaign/banner.png"
                required
              />
            </Field>
          )}

          {placeholders > 0 && (
            <div className="space-y-2 rounded-xl border bg-background p-3">
              <p className="text-xs font-medium">Fill the template's values</p>
              {parameters.map((parameter, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr]">
                  <div className="flex items-center">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">
                      {`{{${index + 1}}}`}
                    </span>
                    <span className="ml-1.5 truncate text-[11px] text-muted-foreground">
                      {template.variables[index] ?? ""}
                    </span>
                  </div>

                  <Select
                    value={parameter.kind}
                    onChange={(e) =>
                      setParameters((current) => {
                        const next = [...current];
                        next[index] = { ...next[index], kind: e.target.value as ParameterKind };
                        return next;
                      })
                    }
                    className="h-9 text-xs"
                    aria-label={`Source for placeholder ${index + 1}`}
                  >
                    {Object.entries(PARAMETER_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>

                  {parameter.kind === "static" ? (
                    <Input
                      value={parameter.value}
                      onChange={(e) =>
                        setParameters((current) => {
                          const next = [...current];
                          next[index] = { ...next[index], value: e.target.value };
                          return next;
                        })
                      }
                      placeholder="Text sent to everyone"
                      className="h-9 text-xs"
                      required
                    />
                  ) : parameter.kind === "contactName" ? (
                    <Input
                      value={parameter.fallback}
                      onChange={(e) =>
                        setParameters((current) => {
                          const next = [...current];
                          next[index] = { ...next[index], fallback: e.target.value };
                          return next;
                        })
                      }
                      placeholder="Fallback when they have no profile name"
                      className="h-9 text-xs"
                    />
                  ) : (
                    <p className="self-center text-[11px] text-muted-foreground">
                      Filled from each contact.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <Field label="What each person receives">
            <Textarea
              value={
                (template.headerText ? `${template.headerText}\n\n` : "") +
                render(template.body, previewValues) +
                (template.footerText ? `\n\n${template.footerText}` : "")
              }
              readOnly
              className="min-h-[96px] bg-background text-xs"
            />
          </Field>
        </>
      )}

      <div className="space-y-2.5 rounded-xl border bg-background p-3">
        <p className="text-xs font-medium">Audience</p>

        <div className="flex gap-1 rounded-xl bg-secondary/60 p-1">
          {(
            [
              ["segment", "Existing contacts"],
              ["list", "Upload numbers"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setAudienceKind(value);
                setReach(null);
              }}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                audienceKind === value
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {audienceKind === "segment" ? (
          <>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={includeUnrouted}
                onChange={(e) => setIncludeUnrouted(e.target.checked)}
                className="size-3.5 accent-[hsl(var(--primary))]"
              />
              Also include older contacts who never chose a business in the previous welcome menu
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <Field
                label="Only contacts active in the last…"
                hint="Days. Leave blank for everyone. A number that has been silent for a year is the one most likely to report the message."
              >
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={activeWithinDays}
                  onChange={(e) => setActiveWithinDays(e.target.value)}
                  placeholder="90"
                  className="h-9 text-xs"
                />
              </Field>

              <Field label="Cap the number of recipients" hint="Blank means no cap.">
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="500"
                  className="h-9 text-xs"
                />
              </Field>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary">
                <Upload className="size-3.5" />
                Choose a CSV or text file
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setNumbers(await file.text());
                    // Let the same file be picked again after an edit.
                    e.target.value = "";
                  }}
                />
              </label>
              {numbers && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    setNumbers("");
                    setImportReport(null);
                    setReach(null);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>

            <Field
              label="Numbers"
              hint="One per line, or a CSV with the number first and a name second. 0300…, +92 300…, 92300… and 300… are all understood; duplicates and opt-outs are removed."
            >
              <Textarea
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
                placeholder={"03001234567, Ali Raza\n+92 321 9876543, Sadia Khan\n03339998877"}
                className="min-h-[120px] font-mono text-xs"
              />
            </Field>

            {importReport && (
              <div className="space-y-1.5 rounded-xl border bg-secondary/40 p-2.5 text-[11px]">
                <p>
                  <span className="font-semibold">{importReport.valid}</span> number
                  {importReport.valid === 1 ? "" : "s"} read
                  {importReport.known > 0 && ` · ${importReport.known} already in the CRM`}
                  {importReport.valid - importReport.known > 0 &&
                    ` · ${importReport.valid - importReport.known} new`}
                </p>
                {(importReport.duplicates > 0 ||
                  importReport.invalid > 0 ||
                  importReport.optedOut > 0 ||
                  importReport.blocked > 0) && (
                  <p className="text-muted-foreground">
                    Skipped:
                    {importReport.duplicates > 0 && ` ${importReport.duplicates} duplicate`}
                    {importReport.invalid > 0 && ` · ${importReport.invalid} not a number`}
                    {importReport.optedOut > 0 && ` · ${importReport.optedOut} opted out`}
                    {importReport.blocked > 0 && ` · ${importReport.blocked} blocked`}
                  </p>
                )}
                {importReport.preview.length > 0 && (
                  <p className="font-mono text-muted-foreground">
                    {importReport.preview
                      .map((row) => `${row.phone}${row.name ? ` (${row.name})` : ""}`)
                      .join(" · ")}
                    {importReport.valid > importReport.preview.length && " …"}
                  </p>
                )}
                {importReport.samples.length > 0 && (
                  <p className="text-amber-700 dark:text-amber-400">
                    Ignored: {importReport.samples.map((s) => `"${s.raw}" (${s.reason})`).join(", ")}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <p className="flex items-center gap-1.5 rounded-lg bg-secondary/60 px-2.5 py-1.5 text-xs">
          {counting || importing ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Users className="size-3.5 text-muted-foreground" />
          )}
          {reach === null ? (
            <span className="text-muted-foreground">
              {audienceKind === "list"
                ? "Paste or upload numbers to see how many can be messaged."
                : "Counting the audience…"}
            </span>
          ) : (
            <span>
              <span className="font-semibold">{reach}</span> contact{reach === 1 ? "" : "s"} will
              be messaged. Opted-out and blocked numbers are already excluded.
            </span>
          )}
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={
            saving ||
            !template ||
            !title.trim() ||
            reach === 0 ||
            (audienceKind === "list" && !importReport?.sendable) ||
            (needsMedia && !headerMediaUrl.trim())
          }
          className="gap-1.5"
        >
          {saving && <Loader2 className="size-4 animate-spin" />} Save as draft
        </Button>
      </div>
    </form>
  );
}
