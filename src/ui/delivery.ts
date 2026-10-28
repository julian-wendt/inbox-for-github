import type { Classified } from "../classify";
import { NOTIFY_REASONS, notifyReason, type NotifyReason } from "./attention";
import { t } from "./i18n";

/** When notifications may arrive: at once, only within working hours, or only as summaries at fixed times. */
export type DeliveryMode = "immediately" | "hours" | "times";

/** A stretch of the day, local "HH:MM" to "HH:MM" (the end excluded). */
export interface Span {
  from: string;
  to: string;
}

/**
 * The delivery schedule. `days` are weekdays as `Date.getDay` counts them (0 = Sunday) on which
 * the hours or summaries apply. `ranges` are the working hours in mode "hours", several so a
 * break fits between them; `times` are the summary times in mode "times". Both lists stay in the
 * order typed.
 */
export interface Delivery {
  mode: DeliveryMode;
  days: number[];
  ranges: Span[];
  times: string[];
}

export const DEFAULT_DELIVERY: Delivery = {
  mode: "immediately",
  days: [1, 2, 3, 4, 5],
  ranges: [
    { from: "09:00", to: "12:00" },
    { from: "13:00", to: "18:00" },
  ],
  times: ["09:00", "13:00", "17:00"],
};

/** Minutes after midnight of a local "HH:MM"; anything unreadable counts as midnight. */
function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
}

/**
 * A local "HH:MM" as hours and minutes, for a time field.
 *
 * @example
 *   timeParts("13:05"); // [13, 5]
 */
export function timeParts(time: string): [number, number] {
  const minutes = minutesOf(time);
  return [Math.floor(minutes / 60), minutes % 60];
}

/**
 * Hours and minutes as a local "HH:MM".
 *
 * @example
 *   formatTime(9, 0); // "09:00"
 */
export function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * A time to add to the list: the first full hour after the latest one, wrapping past midnight,
 * that is not in it yet. Every hour taken, it repeats the latest.
 *
 * @example
 *   nextTime(["09:00", "13:00", "17:00"]); // "18:00"
 */
export function nextTime(times: string[]): string {
  const latest = Math.max(...times.map(minutesOf), -60);
  for (let step = 1; step <= 24; step++) {
    const time = formatTime(Math.floor(latest / 60 + step) % 24, 0);
    if (!times.includes(time)) return time;
  }
  return formatTime(Math.floor(latest / 60), latest % 60);
}

/**
 * A range to add to the list: one hour, starting an hour after the latest end (at the latest
 * 22:00, so it stays within the day).
 *
 * @example
 *   nextRange([{ from: "09:00", to: "12:00" }, { from: "13:00", to: "18:00" }]); // { from: "19:00", to: "20:00" }
 */
export function nextRange(ranges: Span[]): Span {
  const wanted = Math.min(Math.floor(Math.max(...ranges.map((range) => minutesOf(range.to)), 0) / 60) + 1, 22);
  const taken = (hour: number) => ranges.some((range) => minutesOf(range.from) < (hour + 1) * 60 && hour * 60 < minutesOf(range.to));
  const order = [...Array.from({ length: 23 - wanted }, (_, i) => wanted + i), ...Array.from({ length: 22 }, (_, i) => (i + 6) % 23)];
  const hour = order.find((h) => !taken(h)) ?? wanted;
  return { from: formatTime(hour, 0), to: formatTime(hour + 1, 0) };
}

/** The starts of the ranges that follow a break: one beginning inside another or right at its end continues it. */
function breakEnds(ranges: Span[]): string[] {
  return ranges.filter(({ from }) => !ranges.some((other) => minutesOf(other.from) < minutesOf(from) && minutesOf(from) <= minutesOf(other.to))).map((range) => range.from);
}

function at(day: Date, time: string): Date {
  const date = new Date(day);
  date.setHours(0, minutesOf(time), 0, 0);
  return date;
}

/**
 * Whether new items may notify one by one right now: always in mode "immediately", within a
 * range on a selected day in mode "hours", never in mode "times" (those wait for their summary).
 *
 * @example
 *   notifiesLive({ ...DEFAULT_DELIVERY, mode: "hours" }, new Date("2026-10-26T12:30")); // false, in the break
 */
export function notifiesLive(delivery: Delivery, now: Date): boolean {
  if (delivery.mode === "immediately") return true;
  if (delivery.mode === "times" || !delivery.days.includes(now.getDay())) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return delivery.ranges.some(({ from, to }) => minutes >= minutesOf(from) && minutes < minutesOf(to));
}

/**
 * The latest moment up to `now` at which collected items are released as one summary: the start
 * of each range in mode "hours", each listed time in mode "times", on the selected days. Null in
 * mode "immediately" and when no day is selected.
 *
 * @example
 *   releasedAt({ ...DEFAULT_DELIVERY, mode: "times" }, new Date("2026-10-26T14:00")); // 2026-10-26 13:00
 */
export function releasedAt(delivery: Delivery, now: Date): Date | null {
  if (delivery.mode === "immediately") return null;
  const starts = delivery.mode === "hours" ? breakEnds(delivery.ranges) : delivery.times;
  let latest: Date | null = null;
  for (let back = 0; back < 7; back++) {
    const day = new Date(now);
    day.setDate(day.getDate() - back);
    if (!delivery.days.includes(day.getDay())) continue;
    for (const start of starts) {
      const moment = at(day, start);
      if (moment <= now && (!latest || moment > latest)) latest = moment;
    }
    if (latest) return latest;
  }
  return null;
}

/**
 * Whether the collected items are due as a summary: a release moment has passed since the last
 * summary. Without a last summary nothing is due, the caller records `now` as the baseline.
 *
 * @example
 *   summaryDue(delivery, new Date("2026-10-26T13:05"), new Date("2026-10-26T09:00")); // true in mode "times"
 */
export function summaryDue(delivery: Delivery, now: Date, lastSummary: Date | null): boolean {
  const released = releasedAt(delivery, now);
  return !!released && !!lastSummary && released > lastSummary;
}

/**
 * The text of a summary notification: how many items came in, per reason, and the titles of
 * the first two. Reasons count in the order the settings list them.
 *
 * @example
 *   summarize(entries); // { body: "6 new: Mentions 3, Review requests 2, Updates 1", titles: ["repo#1 Fix login", "repo#2 Bump"] }
 */
export function summarize(entries: Classified[]): { body: string; titles: string[] } {
  const counts = new Map<NotifyReason, number>();
  for (const entry of entries) counts.set(notifyReason(entry), (counts.get(notifyReason(entry)) ?? 0) + 1);
  const parts = NOTIFY_REASONS.filter((reason) => counts.has(reason)).map((reason) => `${t(`notify.summaryReason.${reason}`)} ${counts.get(reason)}`);
  const titles = entries.slice(0, 2).map(({ item }) => `${item.repo.split("/")[1]}#${item.number} ${item.title}`);
  return { body: t("notify.summary", { count: entries.length, parts: parts.join(", ") }), titles };
}
