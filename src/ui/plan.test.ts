import { describe, expect, it } from "vitest";
import { carriedText, choiceKey, closedPlans, toggleWorkday, weekdayName, planOf, replan, datedAt, datedOf, datedText, dayText, withEvent, isPinnable, dayChoices, followEvent, orphanLinks, rollOver, setPlan, unplan, type Today } from "./plan";

const days = (now: Date, workdays?: number[]) => dayChoices(now, workdays).map((c) => `${c.kind}:${c.day}`);
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

describe("dayChoices with other workdays", () => {
  it("offers Saturday when it is a workday, and next week's first workday", () => {
    expect(days(new Date(2026, 9, 29), [2, 3, 4, 5, 6])).toEqual(["nextWorkday:2026-10-30", "weekday:2026-10-31", "nextWeek:2026-11-03"]);
  });

  it("takes the next workday from further on when the coming days are off", () => {
    expect(days(new Date(2026, 9, 26), [4])).toEqual(["nextWorkday:2026-10-29", "nextWeek:2026-11-05"]);
  });

  it("falls back to Monday to Friday without any workday", () => {
    expect(days(new Date(2026, 9, 27), [])).toEqual(days(new Date(2026, 9, 27)));
  });
});

describe("toggleWorkday and weekdayName", () => {
  it("switches a day on in week order and off, but keeps the last one", () => {
    expect(toggleWorkday([1, 2, 3, 4, 5], 0)).toEqual([1, 2, 3, 4, 5, 0]);
    expect(toggleWorkday([1, 2], 1)).toEqual([2]);
    expect(toggleWorkday([2], 2)).toEqual([2]);
  });

  it("names a day of the week by its number", () => {
    expect([1, 0].map(weekdayName)).toEqual(["Mon", "Sun"]);
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

  it("moves every due plan in, oldest first, however many", () => {
    const planned = ["d", "c", "b", "a"].map((id, i) => ({ id, day: `2026-10-2${4 + i}` }));
    const next = rollOver(state([], null, planned), "2026-10-27", always)!;
    expect(next.focus).toEqual(["d", "c", "b", "a"]);
    expect(next.planned).toEqual([]);
  });

  it("puts the due plans behind the carried pins", () => {
    const next = rollOver(state(["x", "y", "z"], "2026-10-26", [{ id: "b", day: "2026-10-27" }, { id: "c", day: "2026-10-27" }], { x: "2026-10-26", y: "2026-10-26", z: "2026-10-26" }), "2026-10-27", always)!;
    expect(next.focus).toEqual(["x", "y", "z", "b", "c"]);
    expect(next.planned).toEqual([]);
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

describe("closedPlans", () => {
  it("names the pinned and planned items that are closed, and nothing else", () => {
    const before = state(["a", "b"], "2026-10-28", [{ id: "c", day: "2026-10-29" }, { id: "d", day: "2026-10-30" }], {}, {});
    expect(closedPlans(before, (id) => id === "b" || id === "d" || id === "x")).toEqual(["b", "d"]);
    expect(closedPlans(before, () => false)).toEqual([]);
  });
});

describe("planOf and replan", () => {
  it("put an item's pin or plan back as it was, next to what Today holds since", () => {
    const before = state(["a", "b"], "2026-10-28", [{ id: "c", day: "2026-10-29" }], { a: "2026-10-27", b: "2026-10-28" }, { a: "t1", b: "t2", c: "t3" });
    const later = { ...unplan(before, ["a"]), planned: [{ id: "c", day: "2026-10-29" }, { id: "d", day: "2026-10-30" }] };
    expect(replan(later, planOf(before, "a"))).toEqual({ ...later, focus: ["b", "a"], pinnedOn: { b: "2026-10-28", a: "2026-10-27" }, plannedAt: { b: "t2", c: "t3", a: "t1" } });
    expect(replan(unplan(before, ["c"]), planOf(before, "c"))).toEqual(before);
  });

  it("give an emptied Today its day back with the pin", () => {
    const before = state(["a"], "2026-10-28", [], { a: "2026-10-28" }, {});
    expect(replan({ ...unplan(before, ["a"]), focusDay: null }, planOf(before, "a")).focusDay).toBe("2026-10-28");
  });
});

describe("followEvent", () => {
  const state = (overrides: Partial<Today> = {}): Today => ({ focus: [], focusDay: null, planned: [{ id: "I_1", day: "2026-10-30" }], pinnedOn: {}, plannedAt: { I_1: "x" }, ...overrides });

  it("replans an item whose event moved to a later day", () => {
    expect(followEvent(state(), "I_1", "2026-11-02", "2026-10-29")?.planned).toEqual([{ id: "I_1", day: "2026-11-02" }]);
  });

  it("brings an item into Today when its event moved to today, keeping when it was planned", () => {
    expect(followEvent(state(), "I_1", "2026-10-29", "2026-10-29")).toEqual({ focus: ["I_1"], focusDay: "2026-10-29", planned: [], pinnedOn: { I_1: "2026-10-29" }, plannedAt: { I_1: "x" } });
  });

  it("plans a pinned item for the later day its event moved to", () => {
    expect(followEvent(state({ focus: ["I_1"], focusDay: "2026-10-29", planned: [], pinnedOn: { I_1: "2026-10-29" } }), "I_1", "2026-11-02", "2026-10-29")).toEqual({
      focus: [],
      focusDay: "2026-10-29",
      planned: [{ id: "I_1", day: "2026-11-02" }],
      pinnedOn: {},
      plannedAt: { I_1: "x" },
    });
  });

  it("adds the item to Today however many are in it", () => {
    const busy = state({ focus: ["A", "B", "C"], focusDay: "2026-10-29" });
    expect(followEvent(busy, "I_1", "2026-10-29", "2026-10-29")?.focus).toEqual(["A", "B", "C", "I_1"]);
  });

  it("changes nothing when the item already is where its event is", () => {
    expect(followEvent(state(), "I_1", "2026-10-30", "2026-10-29")).toBeNull();
    expect(followEvent(state({ focus: ["I_1"], planned: [] }), "I_1", "2026-10-28", "2026-10-29")).toBeNull();
  });
});

describe("orphanLinks", () => {
  it("lists the links of items that are neither pinned nor planned", () => {
    expect(orphanLinks({ focus: ["I_1"], planned: [{ id: "I_2", day: "2026-10-30" }], calendarEvents: { I_1: "E1", I_2: "E2", I_3: "E3" } })).toEqual([["I_3", "E3"]]);
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

  it("adds In the calendar to the tooltip of a plan with an event", () => {
    expect(datedText({ kind: "planned", day: "2026-10-29", event: {} }, now).title).toMatch(/ · In the calendar$/);
    expect(datedText({ kind: "planned", day: "2026-10-29" }, now).title).not.toMatch(/calendar/);
  });
});

describe("withEvent", () => {
  const plan = { kind: "planned", day: "2026-10-29" } as const;

  it("adds the event with its start once the calendar gave one back", () => {
    expect(withEvent(plan, "E1", new Map([["E1", 1000]]))).toEqual({ ...plan, event: { start: 1000 } });
    expect(withEvent(plan, "E1", new Map())).toEqual({ ...plan, event: { start: undefined } });
  });

  it("leaves a plan without a link, and no plan, as they are", () => {
    expect(withEvent(plan, undefined, new Map([["E1", 1000]]))).toBe(plan);
    expect(withEvent(null, "E1", new Map())).toBeNull();
  });
});

describe("dayText", () => {
  it("says Today, Tomorrow, the weekday within this work week, else the date", () => {
    const tuesday = new Date(2026, 9, 27);
    expect(["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-11-02", "2026-10-26"].map((day) => dayText(day, tuesday))).toEqual(["Today", "Tomorrow", "Thursday", "Friday", "Nov 2", "Oct 26"]);
  });

  it("names the coming work week's days on a Sunday, as the menus offer them", () => {
    expect(dayText("2026-11-04", new Date(2026, 10, 1))).toBe("Wednesday");
  });
});
