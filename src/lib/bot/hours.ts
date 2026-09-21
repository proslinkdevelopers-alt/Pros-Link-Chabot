import type { BotConfig } from "./schema";

/**
 * Business hours in the configured time zone.
 *
 * Used to set expectations honestly on a handover ("our team is back Monday
 * at 09:00") and to keep follow-ups from arriving at 3 a.m. Until someone
 * enters real hours in Chatbot Studio the configuration is null, and the
 * assistant never claims the team is closed.
 */

type Hours = NonNullable<BotConfig["businessHours"]>;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Day of week (0 = Sunday) and minutes past midnight in `timezone`. */
function localClock(now: Date, timezone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isOpen(hours: Hours | null, now = new Date()): boolean {
  if (!hours) return true;
  const { day, minutes } = localClock(now, hours.timezone);
  return hours.days.includes(day) && minutes >= toMinutes(hours.open) && minutes < toMinutes(hours.close);
}

/** "today at 10:00", "tomorrow at 10:00" or "Monday at 10:00" (business time zone). */
export function nextOpening(hours: Hours | null, now = new Date()): string {
  if (!hours) return "soon";
  const { day, minutes } = localClock(now, hours.timezone);
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = (day + offset) % 7;
    if (!hours.days.includes(candidate)) continue;
    if (offset === 0 && minutes >= toMinutes(hours.open)) continue;
    const when = offset === 0 ? "today" : offset === 1 ? "tomorrow" : WEEKDAYS[candidate];
    return `${when} at ${hours.open}`;
  }
  return `at ${hours.open}`;
}
