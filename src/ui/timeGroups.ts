export type TimeGroup = "today" | "yesterday" | "week" | "lastWeek" | "month" | "older";

/** Newest first; reversed for "oldest first". */
export const TIME_GROUPS: TimeGroup[] = ["today", "yesterday", "week", "lastWeek", "month", "older"];

/**
 * The calendar bucket of a time, like mail apps group a mailbox: today, yesterday, earlier this
 * week (weeks start on Monday), last week, earlier this month, or older. Buckets follow local
 * calendar days, so an item does not change bucket in the middle of a day.
 *
 * @example
 *   timeGroup("2026-10-22T09:00:00", new Date(2026, 9, 23, 12)); // "yesterday"
 */
export function timeGroup(at: string, now = new Date()): TimeGroup {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = day(now);
  const time = new Date(at).getTime();
  const dayMs = 86_400_000;
  const monday = today - ((now.getDay() + 6) % 7) * dayMs;
  if (time >= today) return "today";
  if (time >= today - dayMs) return "yesterday";
  if (time >= monday) return "week";
  if (time >= monday - 7 * dayMs) return "lastWeek";
  if (time >= new Date(now.getFullYear(), now.getMonth(), 1).getTime()) return "month";
  return "older";
}

/**
 * Splits a sorted list into its time buckets, keeping the list's order inside each and leaving
 * out empty buckets. Buckets follow the list's direction: newest first unless `oldest` is set.
 *
 * @param list    The entries, already sorted.
 * @param timeOf  The time each entry is sorted and grouped by.
 *
 * @example
 *   groupByTime(entries, (e) => e.item.updatedAt); // [{ group: "today", entries: [...] }, …]
 */
export function groupByTime<T>(list: T[], timeOf: (entry: T) => string, oldest = false, now = new Date()): { group: TimeGroup; entries: T[] }[] {
  const buckets = new Map<TimeGroup, T[]>(TIME_GROUPS.map((g) => [g, []]));
  for (const entry of list) buckets.get(timeGroup(timeOf(entry), now))!.push(entry);
  const order = oldest ? [...TIME_GROUPS].reverse() : TIME_GROUPS;
  return order.map((group) => ({ group, entries: buckets.get(group)! })).filter((g) => g.entries.length > 0);
}

/** When a snooze ends, by local calendar days; "undated" snoozes have no date and wait for activity. */
export type SnoozeGroup = "today" | "tomorrow" | "week" | "nextWeek" | "later" | "undated";

export const SNOOZE_GROUPS: SnoozeGroup[] = ["today", "tomorrow", "week", "nextWeek", "later", "undated"];

/**
 * The calendar bucket of a snooze end: today, tomorrow, later this week (weeks start on Monday),
 * next week, or later. A date already passed counts as today.
 *
 * @example
 *   snoozeGroup("2026-10-26T09:00:00", new Date(2026, 9, 24, 12)); // "nextWeek" (Saturday → Monday)
 */
export function snoozeGroup(until: string, now = new Date()): Exclude<SnoozeGroup, "undated"> {
  // Calendar days, not 24-hour steps, so a daylight saving change does not shift the boundaries.
  const midnight = (days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).getTime();
  const nextMonday = 7 - ((now.getDay() + 6) % 7);
  const time = new Date(until).getTime();
  if (time < midnight(1)) return "today";
  if (time < midnight(2)) return "tomorrow";
  if (time < midnight(nextMonday)) return "week";
  if (time < midnight(nextMonday + 7)) return "nextWeek";
  return "later";
}

/**
 * Splits snoozed entries by when they come back, soonest first, and those without a date last,
 * the latest snoozed first among them. `latestFirst` turns the dated ones around.
 *
 * @param untilOf      The snooze end of an entry, or undefined without a date.
 * @param snoozedAt    When the entry was snoozed, for those without a date.
 *
 * @example
 *   groupBySnoozeEnd(entries, (c) => c.until, (c) => c.statusAt ?? ""); // [{ group: "tomorrow", entries }, { group: "undated", entries }]
 */
export function groupBySnoozeEnd<T>(list: T[], untilOf: (entry: T) => string | undefined, snoozedAt: (entry: T) => string, latestFirst = false, now = new Date()): { group: SnoozeGroup; entries: T[] }[] {
  const dated = list.filter((e) => untilOf(e)).sort((a, b) => untilOf(a)!.localeCompare(untilOf(b)!) * (latestFirst ? -1 : 1));
  const undated = list.filter((e) => !untilOf(e)).sort((a, b) => snoozedAt(b).localeCompare(snoozedAt(a)));
  const buckets = new Map<SnoozeGroup, T[]>(SNOOZE_GROUPS.map((g) => [g, []]));
  for (const entry of dated) buckets.get(snoozeGroup(untilOf(entry)!, now))!.push(entry);
  buckets.set("undated", undated);
  const order: SnoozeGroup[] = latestFirst ? [...SNOOZE_GROUPS.slice(0, -1).reverse(), "undated"] : SNOOZE_GROUPS;
  return order.map((group) => ({ group, entries: buckets.get(group)! })).filter((g) => g.entries.length > 0);
}
