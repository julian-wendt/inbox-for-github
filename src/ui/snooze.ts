import { lang } from "./i18n";

export type SnoozeChoice = "none" | "later" | "tomorrow" | "nextWeek" | "pick";

/**
 * When each quick snooze choice ends, in local time: later today is three hours on, tomorrow
 * morning and next Monday are at 09:00. "none" snoozes without a date, "pick" asks for one.
 *
 * @example
 *   snoozeUntil("tomorrow", new Date(2026, 9, 23, 15)); // 24 Oct 2026, 09:00 local, as ISO
 */
export function snoozeUntil(choice: Exclude<SnoozeChoice, "none" | "pick">, now = new Date()): string {
  if (choice === "later") return new Date(now.getTime() + 3 * 3_600_000).toISOString();
  const days = choice === "tomorrow" ? 1 : ((8 - now.getDay()) % 7) || 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 9).toISOString();
}

/**
 * A snooze date for people: weekday and time within the coming week, else the date and time.
 *
 * @example
 *   untilText("2026-10-26T08:00:00Z"); // "Mon 09:00" (in Berlin)
 */
export function untilText(until: string, now = new Date()): string {
  const at = new Date(until);
  const soon = at.getTime() - now.getTime() < 6 * 86_400_000;
  return at.toLocaleString(lang(), { ...(soon ? { weekday: "short" } : { day: "numeric", month: "short" }), hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/**
 * A snooze end for a narrow column: the time today, the weekday within the coming week, else the
 * day and month.
 *
 * @example
 *   untilShort("2026-10-26T08:00:00Z", new Date(2026, 9, 24, 12)); // "Mon" (in Berlin, English)
 */
export function untilShort(until: string, now = new Date()): string {
  const at = new Date(until);
  if (at.toDateString() === now.toDateString()) return at.toLocaleTimeString(lang(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (at.getTime() - now.getTime() < 6 * 86_400_000) return at.toLocaleDateString(lang(), { weekday: "short" });
  return at.toLocaleDateString(lang(), { day: "numeric", month: "short" });
}

/**
 * A reminder's full date and time in 24-hour form, for the detail's reminder chip.
 *
 * @example
 *   reminderText("2026-10-26T08:00:00Z"); // "Mon, 26 Oct, 09:00" (in Berlin, English)
 */
export function reminderText(at: string): string {
  return new Date(at).toLocaleString(lang(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
