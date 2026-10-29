import { lang } from "./i18n";

/**
 * When a follow-up for a day comes back: that local day at `time`, as ISO 8601.
 *
 * @param day   A local date ("2026-10-30"), as `dayChoices` gives it.
 * @param time  The "followUpTime" setting ("09:00").
 *
 * @example
 *   followUpOn("2026-10-30", "09:00"); // 30 Oct 2026, 09:00 local, as ISO
 */
export function followUpOn(day: string, time = "09:00"): string {
  const [y, m, d] = day.split("-").map(Number);
  const { hours, minutes } = clockOf(time);
  return new Date(y, m - 1, d, hours, minutes).toISOString();
}

/**
 * A 24-hour clock time ("09:00") as hours and minutes; one that does not parse reads as 09:00.
 *
 * @example
 *   clockOf("17:30"); // { hours: 17, minutes: 30 }
 */
export function clockOf(text: string): { hours: number; minutes: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  const hours = Number(match?.[1]);
  const minutes = Number(match?.[2]);
  return match && hours < 24 && minutes < 60 ? { hours, minutes } : { hours: 9, minutes: 0 };
}

/**
 * Hours and minutes as the "followUpTime" setting stores them.
 *
 * @example
 *   clockText({ hours: 9, minutes: 5 }); // "09:05"
 */
export function clockText({ hours, minutes }: { hours: number; minutes: number }): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
