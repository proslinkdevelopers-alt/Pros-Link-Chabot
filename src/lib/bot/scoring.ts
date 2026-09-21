import type { CustomerDetails } from "@/lib/ai/customer";
import type { BotConfig } from "./schema";
import { hasPhrase, normalise } from "./text";
import type { BotState, Temperature } from "./types";

/**
 * =============================================================================
 *  Lead scoring
 * =============================================================================
 *
 *  A transparent points system rather than a model's opinion, so the sales
 *  team can see exactly why a lead is Hot: every rule that fired is returned
 *  as a readable reason and stored on the lead.
 *
 *  Weights and band thresholds come from the chatbot configuration. The score
 *  is capped at 100.
 * =============================================================================
 */

export interface LeadScore {
  value: number;
  temperature: Temperature;
  reasons: string[];
}

const IMMEDIATE_PHRASES = [
  "immediately", "asap", "urgent", "urgently", "right away", "this week", "today", "tomorrow",
  "within 2 weeks", "within two weeks", "within a week", "next week", "foran", "jaldi", "abhi",
  "isi hafte", "فوراً", "جلدی", "ابھی",
];

/** A timeline that means "now" — a tapped immediate option or the words for it. */
export function isImmediate(timeline: string | undefined, options: BotConfig["options"]): boolean {
  if (!timeline) return false;
  if (options.timelines.some((option) => option.immediate && option.value === timeline)) return true;
  const text = normalise(timeline);
  return IMMEDIATE_PHRASES.some((phrase) => hasPhrase(text, phrase));
}

/**
 * The largest amount in a budget, in rupees, or null when there is none.
 * Understands "Rs 3 lakh", "PKR 2.8M", "500k", "10 crore", "$2,000".
 */
export function budgetInPkr(budget: string | undefined, pkrPerUsd = 280): number | null {
  if (!budget) return null;
  const text = budget.toLowerCase().replace(/,/g, "");
  const rate = /\$|usd|dollar/.test(text) ? pkrPerUsd : 1;

  let largest: number | null = null;
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(k|m|mn|million|lakh|lac|crore)?/g)) {
    const unit = match[2];
    const multiplier =
      unit === "k" ? 1_000
      : unit === "m" || unit === "mn" || unit === "million" ? 1_000_000
      : unit === "lakh" || unit === "lac" ? 100_000
      : unit === "crore" ? 10_000_000
      : 1;
    const amount = Number(match[1]) * multiplier * rate;
    if (largest === null || amount > largest) largest = amount;
  }
  return largest;
}

/** The largest number of units in a quantity answer — "5 machines", "20+", "2-3". */
export function quantityCount(quantity: string | undefined): number | null {
  if (!quantity) return null;
  const numbers = [...quantity.replace(/,/g, "").matchAll(/\d+/g)].map((match) => Number(match[0]));
  return numbers.length ? Math.max(...numbers) : null;
}

function isHighBudget(budget: string | undefined, config: BotConfig): boolean {
  if (!budget) return false;
  const option = config.options.budgets.find((entry) => entry.value === budget);
  if (option) return Boolean(option.highValue);
  const pkr = budgetInPkr(budget);
  return pkr !== null && pkr >= config.scoring.highBudgetPkr;
}

function isLargeOrder(quantity: string | undefined, config: BotConfig): boolean {
  if (!quantity) return false;
  const option = config.options.quantities.find((entry) => entry.value === quantity);
  if (option) return Boolean(option.highValue);
  const count = quantityCount(quantity);
  return count !== null && count >= config.scoring.largeOrderQuantity;
}

function isUnsure(value: string | undefined): boolean {
  return !value || /^(not sure|unsure|don'?t know|no idea|pata nahi|معلوم نہیں)$/i.test(value.trim());
}

export function temperatureFor(value: number, bands: BotConfig["scoring"]["bands"]): Temperature {
  if (value >= bands.highPriority) return "HIGH_PRIORITY";
  if (value >= bands.hot) return "HOT";
  if (value >= bands.warm) return "WARM";
  return "COLD";
}

export function scoreLead(details: CustomerDetails, state: BotState, config: BotConfig): LeadScore {
  const { weights } = config.scoring;
  const reasons: string[] = [];
  let value = 0;

  const add = (points: number, reason: string, when: boolean) => {
    if (when && points > 0) {
      value += points;
      reasons.push(reason);
    }
  };

  add(weights.businessIdentified, "Organisation identified", Boolean(details.company || details.businessType));
  add(
    weights.clearRequirement,
    "Clear requirement",
    Boolean(details.productCategory || details.productId || details.interest || (details.requirements && details.requirements.length > 15))
  );
  add(weights.quantityProvided, "Quantity given", !isUnsure(details.quantity));
  add(weights.largeOrder, "Large order", isLargeOrder(details.quantity, config));
  add(weights.budgetProvided, "Budget given", !isUnsure(details.budget));
  add(weights.highBudget, "High budget", isHighBudget(details.budget, config));
  add(weights.immediateTimeline, "Needs it soon", isImmediate(details.timeline, config.options));
  add(weights.corporate, "Corporate or bulk requirement", Boolean(state.signals.enterprise));
  add(weights.wantsCallback, "Asked for a call", Boolean(state.signals.wantsCall));
  add(weights.wantsDemo, "Asked for a demonstration", Boolean(state.signals.wantsDemo));

  value = Math.min(100, value);
  return { value, temperature: temperatureFor(value, config.scoring.bands), reasons };
}

const ORDER: Temperature[] = ["COLD", "WARM", "HOT", "HIGH_PRIORITY"];

/** True when `next` is a hotter band than `previous`. */
export function warmedUp(previous: Temperature | undefined, next: Temperature): boolean {
  return ORDER.indexOf(next) > ORDER.indexOf(previous ?? "COLD");
}
