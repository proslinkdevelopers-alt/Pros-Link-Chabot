import type { Language } from "@/lib/i18n";
import type { Localized } from "./types";

/**
 * Copy selection and templating for the WhatsApp assistant.
 *
 * Fallbacks follow what a reader can actually read: someone writing in Urdu
 * script reads Roman Urdu comfortably and Punjabi (Shahmukhi) readers read
 * Urdu, so each falls back through the nearest script before English.
 */
const FALLBACK: Record<Language, Language[]> = {
  en: ["en"],
  ur_roman: ["ur_roman", "en"],
  ur: ["ur", "ur_roman", "en"],
  pa: ["pa", "ur", "ur_roman", "en"],
};

export function pick(copy: Localized | undefined, language: Language): string {
  if (!copy) return "";
  for (const candidate of FALLBACK[language]) {
    const value = copy[candidate as keyof Localized];
    if (value && value.trim()) return value;
  }
  return copy.en;
}

export type TemplateValues = Record<string, string | number | null | undefined>;

/**
 * Fill `{placeholder}`s. A `[[ … ]]` segment is kept only when every
 * placeholder inside it has a value, so optional details read naturally:
 * `Thanks[[, {name}]]!` → "Thanks, Sara!" or "Thanks!".
 */
export function fill(template: string, values: TemplateValues): string {
  const has = (key: string) => {
    const value = values[key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  };

  const withSegments = template.replace(/\[\[([\s\S]*?)\]\]/g, (_match, inner: string) => {
    const keys = Array.from(inner.matchAll(/\{(\w+)\}/g)).map((m) => m[1]);
    return keys.every(has) ? inner : "";
  });

  return withSegments
    .replace(/\{(\w+)\}/g, (match, key: string) => (has(key) ? String(values[key]).trim() : ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Lowercased, punctuation-free, single-spaced — padded so `includes(" word ")` matches whole words. */
export function normalise(text: string): string {
  const clean = (text ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}\s.+-]/gu, " ")
    .replace(/(?<![\p{L}\p{N}])[.+-]|[.+-](?![\p{L}\p{N}])/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${clean} `;
}

/** Whole-word (or whole-phrase) match against a string from `normalise`. */
export function hasPhrase(normalised: string, phrase: string): boolean {
  const needle = normalise(phrase);
  return needle.trim().length > 0 && normalised.includes(needle);
}

export function wordCount(text: string): number {
  return normalise(text).trim().split(" ").filter(Boolean).length;
}
