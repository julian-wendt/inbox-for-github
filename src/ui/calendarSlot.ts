import { localDay } from "./assignments";

/** A span of a day in minutes since its local midnight, end exclusive. */
export interface Span {
  start: number;
  end: number;
}

/** An event as the day view needs it, times in milliseconds since 1970. */
export interface DayEvent {
  start: number;
  end: number;
  allDay: boolean;
  busy: boolean;
}

/** The grid the day view snaps to, in minutes. */
export const STEP = 15;
/** The hours a first free slot is looked for in, in minutes of the day. */
export const SEARCH_FROM = 8 * 60;
export const SEARCH_TO = 18 * 60;
const DAY = 24 * 60;

/** Local midnight of `day` ("2026-10-29"). */
export function midnight(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The moment `minutes` after local midnight of `day`, in milliseconds; counts wall-clock minutes across a DST change. */
export function momentOf(day: string, minutes: number): number {
  const at = midnight(day);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, minutes).getTime();
}

/**
 * An event's times moved to `day` at the same wall-clock time and length, in milliseconds.
 *
 * @example
 *   onDay({ start: +new Date(2026, 9, 29, 9, 30), end: +new Date(2026, 9, 29, 10, 30) }, "2026-11-02"); // 09:30–10:30 on 2 November
 */
export function onDay(event: { start: number; end: number }, day: string): { start: number; end: number } {
  const minutes = Math.round((event.start - midnight(localDay(new Date(event.start))).getTime()) / 60_000);
  const start = momentOf(day, minutes);
  return { start, end: start + event.end - event.start };
}

/** `minutes` on the nearest multiple of `STEP`. */
export const snap = (minutes: number) => Math.round(minutes / STEP) * STEP;

/**
 * The timed events of `day` as spans of that day, clipped to it: all-day events and events
 * outside the day are left out.
 *
 * @example
 *   spansOf("2026-10-29", [{ start: +new Date(2026, 9, 29, 9), end: +new Date(2026, 9, 29, 10), allDay: false, busy: true }]); // [{ start: 540, end: 600 }]
 */
export function spansOf(day: string, events: readonly DayEvent[]): Span[] {
  const from = midnight(day).getTime();
  const minutes = (ms: number) => Math.round((ms - from) / 60_000);
  return events
    .filter((e) => !e.allDay)
    .map((e) => ({ start: Math.max(0, minutes(e.start)), end: Math.min(DAY, minutes(e.end)) }))
    .filter((s) => s.end > s.start);
}

/**
 * Where a new event of `length` minutes first fits on `day` between 08:00 and 18:00 without
 * overlapping a busy event, in `STEP`s; today only from the next step after `now`. Without a free
 * gap it starts where the search started, so the viewer moves it.
 *
 * @param events  The day's events; events marked free do not block.
 *
 * @example
 *   firstFree("2026-10-29", [nineToTen], 60, new Date(2026, 9, 28)); // { start: 480, end: 540 }, 08:00–09:00
 */
export function firstFree(day: string, events: readonly DayEvent[], length: number, now = new Date()): Span {
  const busy = spansOf(day, events.filter((e) => e.busy));
  const sinceMidnight = (now.getTime() - midnight(day).getTime()) / 60_000;
  const from = Math.min(Math.max(SEARCH_FROM, Math.ceil(sinceMidnight / STEP) * STEP), DAY - length);
  const last = Math.max(from, SEARCH_TO - length);
  for (let start = from; start <= last; start += STEP) {
    if (!busy.some((b) => b.start < start + length && start < b.end)) return { start, end: start + length };
  }
  return { start: from, end: from + length };
}

/** A span placed in the day view: `column` of `columns` side by side, for overlapping events. */
export interface Placed<T> {
  item: T;
  span: Span;
  column: number;
  columns: number;
}

/**
 * Lays out overlapping spans side by side: each goes into the first column free at its start,
 * and every span of a cluster of overlaps gets the cluster's column count, so they share the width.
 *
 * @example
 *   placeSpans([{ item: "a", span: { start: 540, end: 600 } }, { item: "b", span: { start: 570, end: 630 } }]); // a in column 0, b in column 1, both of 2
 */
export function placeSpans<T>(spans: readonly { item: T; span: Span }[]): Placed<T>[] {
  const sorted = [...spans].sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
  const placed: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let clusterEnd = -1;
  const close = () => cluster.forEach((p) => (p.columns = Math.max(...cluster.map((c) => c.column)) + 1));
  for (const { item, span } of sorted) {
    if (span.start >= clusterEnd) {
      close();
      cluster = [];
    }
    const taken = cluster.filter((p) => p.span.end > span.start).map((p) => p.column);
    let column = 0;
    while (taken.includes(column)) column++;
    const next = { item, span, column, columns: 1 };
    cluster.push(next);
    placed.push(next);
    clusterEnd = Math.max(clusterEnd, span.end);
  }
  close();
  return placed;
}

/**
 * The workday before (`direction` -1) or after (+1) `day`, by the "workdays" setting.
 *
 * @example
 *   stepWorkday("2026-10-30", 1, [1, 2, 3, 4, 5]); // "2026-11-02", Friday to Monday
 */
export function stepWorkday(day: string, direction: 1 | -1, workdays: readonly number[]): string {
  const at = midnight(day);
  for (let n = 1; n <= 7; n++) {
    const next = new Date(at.getFullYear(), at.getMonth(), at.getDate() + n * direction);
    if (workdays.length === 0 || workdays.includes(next.getDay())) return localDay(next);
  }
  return day;
}
