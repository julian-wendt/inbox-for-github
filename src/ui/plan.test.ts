import { describe, expect, it } from "vitest";
import { carriedText, choiceKey, datedAt, datedOf, datedText, isPinnable, dayChoices, rollOver, setPlan, unplan } from "./plan";

const days = (now: Date) => dayChoices(now).map((c) => `${c.kind}:${c.day}`);
const always = () => true;

describe("dayChoices", () => {
  it("offers the next workday, the rest of the work week and next week", () => {
    expect(days(new Date(2026, 9, 27))).toEqual(["nextWorkday:2026-10-28", "weekday:2026-10-29", "weekday:2026-10-30", "nextWeek:2026-11-02"]);
  });

  it("offers only the next workday and next week on a Thursday", () => {
    expect(days(new Date(2026, 9, 29))).toEqual(["nextWorkday:2026-10-30", "nextWeek:2026-11-02"]);
  });

  it("offers Monday as the next workday from Friday and Saturday, without next week beside it", () => {
    expect(days(new Date(2026, 9, 30))).toEqual(["nextWorkday:2026-11-02"]);
    expect(days(new Date(2026, 9, 31))).toEqual(["nextWorkday:2026-11-02"]);
  });

  it("offers the coming work week on a Sunday, whose next workday is Monday", () => {
    expect(days(new Date(2026, 10, 1))).toEqual(["nextWorkday:2026-11-02", "weekday:2026-11-03", "weekday:2026-11-04", "weekday:2026-11-05", "weekday:2026-11-06"]);
  });
});

describe("choiceKey", () => {
  it("picks the next workday with N, next week with W and other weekdays by their number", () => {
    expect(dayChoices(new Date(2026, 9, 27)).map(choiceKey)).toEqual(["N", "4", "5", "W"]);
  });
});

describe("setPlan", () => {
  it("moves an item to a new day and removes it with null", () => {
    const planned = [{ id: "a", day: "2026-10-28" }, { id: "b", day: "2026-10-29" }];
    expect(setPlan(planned, "a", "2026-10-30")).toEqual([{ id: "b", day: "2026-10-29" }, { id: "a", day: "2026-10-30" }]);
    expect(setPlan(planned, "a", null)).toEqual([{ id: "b", day: "2026-10-29" }]);
  });
});

const state = (focus: string[], focusDay: string | null, planned: { id: string; day: string }[], pinnedOn: Record<string, string> = {}, plannedAt: Record<string, string> = {}) => ({ focus, focusDay, planned, pinnedOn, plannedAt });

describe("rollOver", () => {
  it("does nothing within the day Today was set on", () => {
    expect(rollOver(state(["a"], "2026-10-27", [{ id: "b", day: "2026-10-27" }]), "2026-10-27", always)).toBeNull();
  });

  it("does nothing when Today is empty and no plan is due", () => {
    expect(rollOver(state([], null, [{ id: "b", day: "2026-10-28" }]), "2026-10-27", always)).toBeNull();
  });

  it("carries the unfinished pins over and moves in what is planned for today behind them", () => {
    const before = state(["a"], "2026-10-26", [{ id: "b", day: "2026-10-27" }, { id: "c", day: "2026-10-29" }], { a: "2026-10-26" });
    expect(rollOver(before, "2026-10-27", always)).toEqual({ focus: ["a", "b"], focusDay: "2026-10-27", planned: [{ id: "c", day: "2026-10-29" }], pinnedOn: { a: "2026-10-26", b: "2026-10-27" }, plannedAt: {} });
  });

  it("dates a pin from before the days were recorded to the day Today was set", () => {
    expect(rollOver(state(["a"], "2026-10-26", []), "2026-10-27", always)).toEqual({ focus: ["a"], focusDay: "2026-10-27", planned: [], pinnedOn: { a: "2026-10-26" }, plannedAt: {} });
  });

  it("drops pins of loaded items that cannot be pinned any more and clears the day when Today empties", () => {
    expect(rollOver(state(["closed"], "2026-10-26", [], { closed: "2026-10-26" }), "2026-10-27", () => false, always)).toEqual({ focus: [], focusDay: null, planned: [], pinnedOn: {}, plannedAt: {} });
  });

  it("takes the oldest plans first and leaves what does not fit planned", () => {
    const planned = ["d", "c", "b", "a"].map((id, i) => ({ id, day: `2026-10-2${4 + i}` }));
    const next = rollOver(state([], null, planned), "2026-10-27", always)!;
    expect(next.focus).toEqual(["d", "c", "b"]);
    expect(next.planned).toEqual([{ id: "a", day: "2026-10-27" }]);
  });

  it("fills only the room the carried pins leave", () => {
    const next = rollOver(state(["x", "y"], "2026-10-26", [{ id: "b", day: "2026-10-27" }, { id: "c", day: "2026-10-27" }], { x: "2026-10-26", y: "2026-10-26" }), "2026-10-27", always)!;
    expect(next.focus).toEqual(["x", "y", "b"]);
    expect(next.planned).toEqual([{ id: "c", day: "2026-10-27" }]);
  });

  it("drops plans of loaded items that cannot be pinned any more, and keeps those not loaded yet", () => {
    const planned = [{ id: "closed", day: "2026-10-29" }, { id: "missing", day: "2026-10-29" }];
    const next = rollOver(state([], null, planned), "2026-10-27", () => false, (id) => id === "closed")!;
    expect(next.planned).toEqual([{ id: "missing", day: "2026-10-29" }]);
  });

  it("keeps planned what cannot be pinned", () => {
    const next = rollOver(state([], null, [{ id: "b", day: "2026-10-27" }, { id: "x", day: "2026-10-27" }]), "2026-10-27", (id) => id === "b")!;
    expect(next.focus).toEqual(["b"]);
    expect(next.planned).toEqual([{ id: "x", day: "2026-10-27" }]);
  });

  it("keeps the time an item was planned when it moves into Today, and drops it with a dropped pin or plan", () => {
    const at = { a: "2026-10-26T08:00:00Z", b: "2026-10-26T09:00:00Z", closed: "2026-10-25T09:00:00Z" };
    const before = state(["a", "closed"], "2026-10-26", [{ id: "b", day: "2026-10-27" }], { a: "2026-10-26", closed: "2026-10-26" }, at);
    const next = rollOver(before, "2026-10-27", (id) => id !== "closed", always)!;
    expect(next.focus).toEqual(["a", "b"]);
    expect(next.plannedAt).toEqual({ a: at.a, b: at.b });
  });
});

describe("carriedText", () => {
  it("says since yesterday, then the weekday within a week, then the date", () => {
    const now = new Date(2026, 9, 28);
    expect(carriedText("2026-10-27", now)).toBe("Since yesterday");
    expect(carriedText("2026-10-26", now)).toBe("Since Mon");
    expect(carriedText("2026-10-12", now)).toBe("Since Oct 12");
  });
});

const open = (id: string, status: "open" | "snoozed" | "done" = "open", closed = false) =>
  ({ status, item: { id, closed: closed ? { state: "closed", at: "2026-10-27T10:00:00Z" } : null } }) as Parameters<typeof datedOf>[0];

describe("datedOf", () => {
  const planned = [{ id: "b", day: "2026-10-30" }];

  it("takes pins over plans, only while the item can be pinned; a follow-up alone is no date", () => {
    expect(datedOf(open("a"), ["a"], planned, "2026-10-28")).toEqual({ kind: "today", day: "2026-10-28" });
    expect(datedOf(open("b"), ["a"], planned, "2026-10-28")).toEqual({ kind: "planned", day: "2026-10-30" });
    expect(datedOf(open("c", "snoozed"), [], [], "2026-10-28")).toBeNull();
    expect(datedOf(open("b", "snoozed"), [], planned, "2026-10-28")).toEqual({ kind: "planned", day: "2026-10-30" });
  });

  it("leaves out the rest: open without a date, closed or done items also when pinned", () => {
    expect(datedOf(open("x"), ["a"], planned, "2026-10-28")).toBeNull();
    expect(datedOf(open("a", "open", true), ["a"], planned, "2026-10-28")).toBeNull();
    expect(datedOf(open("b", "done"), ["a"], planned, "2026-10-28")).toBeNull();
    expect(isPinnable(open("a", "open", true))).toBe(false);
  });

  it("lets T and P take a follow-up, which they end", () => {
    expect(isPinnable(open("a", "snoozed"))).toBe(true);
    expect(isPinnable(open("a", "done"))).toBe(false);
  });
});

describe("unplan", () => {
  it("takes the pins, plans and times of the items, and leaves the rest and the day", () => {
    const before = state(["a", "b"], "2026-10-28", [{ id: "c", day: "2026-10-29" }], { a: "2026-10-28", b: "2026-10-27" }, { a: "t1", b: "t2", c: "t3" });
    expect(unplan(before, ["a", "c"])).toEqual({ focus: ["b"], focusDay: "2026-10-28", planned: [], pinnedOn: { b: "2026-10-27" }, plannedAt: { b: "t2" } });
  });
});

describe("datedAt and datedText", () => {
  const now = new Date(2026, 9, 28);

  it("turns a day into local midnight", () => {
    expect(datedAt({ kind: "planned", day: "2026-10-30" })).toBe(new Date(2026, 9, 30).toISOString());
  });

  it("names Today or the planned day", () => {
    expect(datedText({ kind: "today", day: "2026-10-28" }, now).text).toBe("Today");
    expect(datedText({ kind: "planned", day: "2026-10-29" }, now).text).toBe("Tomorrow");
  });
});
