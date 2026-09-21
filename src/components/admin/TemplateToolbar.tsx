"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/ui/field";

/**
 * Sync templates from Meta, and submit new ones for approval.
 *
 * The two actions belong together because they are two halves of the same
 * fact: Meta owns the template list. Sync reads it; submit adds to it and
 * waits. Nothing here can make a template usable — only Meta's review does
 * that, which is why the submit button says "Submit for approval" rather than
 * "Create".
 */

/** Meta's language codes for the four languages this product speaks. */
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "ur", label: "Urdu" },
  { code: "pa", label: "Punjabi" },
] as const;

const CATEGORIES = [
  {
    value: "UTILITY",
    label: "Utility",
    hint: "Order updates, reminders, account notices — anything the customer asked for.",
  },
  {
    value: "MARKETING",
    label: "Marketing",
    hint: "Offers, announcements, invitations. Priced higher and reviewed more strictly.",
  },
  {
    value: "AUTHENTICATION",
    label: "Authentication",
    hint: "One-time passcodes only.",
  },
] as const;

/** Count `{{n}}` placeholders the same way the server and Meta do. */
function countPlaceholders(text: string): number {
  const found = text.match(/\{\{\s*(\d+)\s*\}\}/g);
  if (!found) return 0;
  return Math.max(...found.map((token) => Number(token.replace(/\D/g, "")) || 0));
}

export function TemplateToolbar({
  canSync,
}: {
  /** False when WHATSAPP_WABA_ID is unset — Meta cannot be reached either way. */
  canSync: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    metaName: "",
    languageCode: "en",
    category: "UTILITY" as (typeof CATEGORIES)[number]["value"],
    headerText: "",
    body: "",
    footerText: "",
  });
  const [examples, setExamples] = useState<string[]>([]);

  const placeholders = countPlaceholders(form.body);

  async function sync() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/templates/sync", { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        created?: number;
        updated?: number;
        warning?: string;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "Sync failed.");
      setNotice(
        `Synced from Meta — ${data?.created ?? 0} new, ${data?.updated ?? 0} updated.` +
          (data?.warning ? ` ${data.warning}` : "")
      );
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          headerText: form.headerText.trim() || undefined,
          footerText: form.footerText.trim() || undefined,
          examples: examples.slice(0, placeholders),
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Meta rejected the template.");

      setNotice(
        `"${form.name}" was submitted to Meta. It stays pending until the review finishes — sync again to pick up the verdict.`
      );
      setForm((current) => ({ ...current, name: "", metaName: "", body: "", headerText: "", footerText: "" }));
      setExamples([]);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit that template.");
    } finally {
      setSaving(false);
    }
  }

  /** `Consultation reminder` → `consultation_reminder`, the only shape Meta accepts. */
  function suggestMetaName(display: string): string {
    return display
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={sync}
          disabled={!canSync || syncing}
          title={
            canSync
              ? "Read the template list from the WhatsApp Business Account"
              : "Set WHATSAPP_WABA_ID to reach Meta's template list"
          }
        >
          {syncing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Sync from Meta
        </Button>

        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setOpen((value) => !value)}
          disabled={!canSync}
        >
          <Plus className="size-4" /> New template
        </Button>
      </div>

      {notice && (
        <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      {open && (
        <form onSubmit={submit} className="space-y-3 rounded-xl border bg-secondary/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name in the console" required>
              <Input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((current) => ({
                    ...current,
                    name,
                    // Only auto-fill while the person has not typed their own.
                    metaName:
                      current.metaName === suggestMetaName(current.name)
                        ? suggestMetaName(name)
                        : current.metaName,
                  }));
                }}
                placeholder="Consultation reminder"
                required
              />
            </Field>

            <Field
              label="Template name in Meta"
              required
              hint="Lowercase letters, numbers and underscores only."
            >
              <Input
                value={form.metaName}
                onChange={(e) =>
                  setForm((current) => ({ ...current, metaName: e.target.value }))
                }
                pattern="[a-z0-9_]+"
                placeholder="consultation_reminder"
                required
              />
            </Field>

            <Field label="Language" required>
              <Select
                value={form.languageCode}
                onChange={(e) =>
                  setForm((current) => ({ ...current, languageCode: e.target.value }))
                }
              >
                {LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label} ({language.code})
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Category"
              required
              hint={CATEGORIES.find((c) => c.value === form.category)?.hint}
            >
              <Select
                value={form.category}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    category: e.target.value as typeof current.category,
                  }))
                }
              >
                {CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Header" hint="Optional, one line, max 60 characters.">
            <Input
              value={form.headerText}
              onChange={(e) =>
                setForm((current) => ({ ...current, headerText: e.target.value }))
              }
              maxLength={60}
              placeholder="Pros-Link"
            />
          </Field>

          <Field
            label="Message body"
            required
            hint="Use {{1}}, {{2}} for values filled in per recipient."
          >
            <Textarea
              value={form.body}
              onChange={(e) => setForm((current) => ({ ...current, body: e.target.value }))}
              maxLength={1024}
              placeholder="Hi {{1}}, your consultation with our team is confirmed for {{2}} at {{3}}."
              required
            />
          </Field>

          {placeholders > 0 && (
            <div className="rounded-xl border bg-background p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Meta needs one example value per placeholder to review the template. These are
                never sent to anyone.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: placeholders }, (_, index) => (
                  <Field key={index} label={`Example for {{${index + 1}}}`}>
                    <Input
                      value={examples[index] ?? ""}
                      onChange={(e) =>
                        setExamples((current) => {
                          const next = [...current];
                          next[index] = e.target.value;
                          return next;
                        })
                      }
                      placeholder={index === 0 ? "Ali" : ""}
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}

          <Field label="Footer" hint="Optional, max 60 characters.">
            <Input
              value={form.footerText}
              onChange={(e) =>
                setForm((current) => ({ ...current, footerText: e.target.value }))
              }
              maxLength={60}
              placeholder="Reply STOP to unsubscribe"
            />
          </Field>

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !form.body.trim() || !form.metaName.trim()}
              className="gap-1.5"
            >
              {saving && <Loader2 className="size-4 animate-spin" />} Submit for approval
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
