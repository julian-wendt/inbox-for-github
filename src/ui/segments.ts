/** One part of a date or time field: its range, its digit count, and whether stepping wraps past the ends. */
export interface Segment {
  min: number;
  max: number;
  length: number;
  wrap: boolean;
}

export const HOURS: Segment = { min: 0, max: 23, length: 2, wrap: true };
export const MINUTES: Segment = { min: 0, max: 59, length: 2, wrap: true };
export const MONTHS: Segment = { min: 1, max: 12, length: 2, wrap: true };

/** The days of `month` (1–12) in `year`, as a segment that wraps from the last day to the first. */
export function daysOf(year: number, month: number): Segment {
  return { min: 1, max: daysInMonth(year, month), length: 2, wrap: true };
}

/** The years a snooze can pick from `from` on: ten in all, without wrapping. */
export function yearsFrom(from: number): Segment {
  return { min: from, max: from + 9, length: 4, wrap: false };
}

/**
 * How many days `month` (1–12) has in `year`.
 *
 * @example
 *   daysInMonth(2028, 2); // 29
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Steps a part up or down. A wrapping part goes round like a clock (23 + 1 is 0 for hours, the
 * 1st − 1 the last day); the others stop at their ends.
 *
 * @param value    The current value.
 * @param segment  The part's range.
 * @param delta    How far to step; negative steps down.
 * @returns The new value, always within the segment.
 *
 * @example
 *   stepSegment(23, HOURS, 1); // 0
 *   stepSegment(5, MINUTES, -10); // 55
 */
export function stepSegment(value: number, segment: Segment, delta: number): number {
  const { min, max } = segment;
  if (!segment.wrap) return Math.min(max, Math.max(min, value + delta));
  const span = max - min + 1;
  return ((((value - min + delta) % span) + span) % span) + min;
}

/** The outcome of one typed digit: the part's new value, the digits typed so far, and whether the part is complete. */
export interface Typed {
  value: number;
  typed: string;
  done: boolean;
}

/**
 * Types one digit into a part, the way clock and date fields do: digits add up until the part
 * has its length, then the next one starts over. The part is complete once it has its length or
 * no further digit could fit (7 for minutes, 3 for hours); a digit that would overflow starts over.
 * Values below `min` (a lone 0 for a day) are allowed while typing; the caller checks validity.
 *
 * @param typed    The digits typed into this part since it took focus ("" for none).
 * @param digit    The digit just typed, "0" to "9".
 * @param segment  The part's range and length.
 * @returns The new value, the digits to remember, and `done` when focus should move on.
 *
 * @example
 *   typeSegment("1", "4", HOURS); // { value: 14, typed: "14", done: true }
 *   typeSegment("", "7", HOURS); // { value: 7, typed: "7", done: true }
 */
export function typeSegment(typed: string, digit: string, segment: Segment): Typed {
  let next = typed.length < segment.length ? typed + digit : digit;
  if (Number(next) > segment.max) next = digit;
  const value = Number(next);
  return { value, typed: next, done: next.length === segment.length || value * 10 > segment.max };
}

/** A part as the field shows it, padded with zeros to its length. */
export function padSegment(value: number, segment: Segment): string {
  return String(value).padStart(segment.length, "0");
}
