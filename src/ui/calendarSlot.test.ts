import { describe, expect, it } from "vitest";
import { firstFree, momentOf, onDay, placeSpans, snap, spansOf, stepWorkday, type DayEvent } from "./calendarSlot";

const DAY = "2026-10-29";
const at = (h: number, m = 0) => new Date(2026, 9, 29, h, m).getTime();
const event = (from: number, to: number, overrides: Partial<DayEvent> = {}): DayEvent => ({ start: from, end: to, allDay: false, busy: true, ...overrides });
const before = new Date(2026, 9, 28, 12);

describe("spansOf", () => {
  it("gives timed events as minutes of the day and clips them to it", () => {
    expect(spansOf(DAY, [event(at(9), at(10)), event(new Date(2026, 9, 28, 23).getTime(), at(1))])).toEqual([
      { start: 540, end: 600 },
      { start: 0, end: 60 },
    ]);
  });

  it("leaves out all-day events and events on other days", () => {
    expect(spansOf(DAY, [event(at(0), at(0) + 86_400_000, { allDay: true }), event(at(9) + 86_400_000, at(10) + 86_400_000)])).toEqual([]);
  });
});

describe("firstFree", () => {
  it("starts at 08:00 on a free day", () => {
    expect(firstFree(DAY, [], 60, before)).toEqual({ start: 480, end: 540 });
  });

  it("skips busy events and fits into the first gap long enough", () => {
    const events = [event(at(8), at(9)), event(at(9, 30), at(11))];
    expect(firstFree(DAY, events, 60, before)).toEqual({ start: 660, end: 720 });
    expect(firstFree(DAY, events, 30, before)).toEqual({ start: 540, end: 570 });
  });

  it("does not let events marked free block", () => {
    expect(firstFree(DAY, [event(at(8), at(12), { busy: false })], 60, before)).toEqual({ start: 480, end: 540 });
  });

  it("starts today at the next step after now", () => {
    expect(firstFree(DAY, [], 60, new Date(2026, 9, 29, 13, 7))).toEqual({ start: 795, end: 855 });
  });

  it("falls back to the search start when the day is full", () => {
    expect(firstFree(DAY, [event(at(7), at(19))], 60, before)).toEqual({ start: 480, end: 540 });
  });

  it("stays inside the day late in the evening", () => {
    expect(firstFree(DAY, [], 60, new Date(2026, 9, 29, 23, 30))).toEqual({ start: 1380, end: 1440 });
  });
});

describe("placeSpans", () => {
  it("puts overlapping spans side by side and lone ones across the width", () => {
    const placed = placeSpans([
      { item: "a", span: { start: 540, end: 600 } },
      { item: "b", span: { start: 570, end: 630 } },
      { item: "c", span: { start: 700, end: 760 } },
    ]);
    expect(placed.map((p) => [p.item, p.column, p.columns])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ]);
  });

  it("reuses a column that became free within a cluster", () => {
    const placed = placeSpans([
      { item: "long", span: { start: 540, end: 720 } },
      { item: "early", span: { start: 540, end: 600 } },
      { item: "late", span: { start: 600, end: 660 } },
    ]);
    expect(placed.map((p) => [p.item, p.column, p.columns])).toEqual([
      ["long", 0, 2],
      ["early", 1, 2],
      ["late", 1, 2],
    ]);
  });
});

describe("snap and momentOf", () => {
  it("snaps to quarter hours", () => {
    expect([snap(7), snap(8), snap(52)]).toEqual([0, 15, 45]);
  });

  it("counts wall-clock minutes", () => {
    expect(momentOf(DAY, 9 * 60 + 30)).toBe(at(9, 30));
  });
});

describe("onDay", () => {
  it("keeps the time of day and the length", () => {
    expect(onDay({ start: at(9, 30), end: at(10, 45) }, "2026-11-02")).toEqual({ start: new Date(2026, 10, 2, 9, 30).getTime(), end: new Date(2026, 10, 2, 10, 45).getTime() });
  });

  it("keeps the wall-clock time across a change of daylight saving time", () => {
    expect(new Date(onDay({ start: new Date(2026, 9, 23, 9).getTime(), end: new Date(2026, 9, 23, 10).getTime() }, "2026-10-26").start).getHours()).toBe(9);
  });
});

describe("stepWorkday", () => {
  it("skips the days that are not workdays, both ways", () => {
    expect(stepWorkday("2026-10-30", 1, [1, 2, 3, 4, 5])).toBe("2026-11-02");
    expect(stepWorkday("2026-11-02", -1, [1, 2, 3, 4, 5])).toBe("2026-10-30");
  });
});
