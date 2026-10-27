import { describe, expect, it } from "vitest";
import { choiceKey, planChoices, rollOver, setPlan } from "./plan";

const days = (now: Date) => planChoices(now).map((c) => `${c.kind}:${c.day}`);
const always = () => true;

describe("planChoices", () => {
  it("offers tomorrow, the rest of the work week and next Monday", () => {
    expect(days(new Date(2026, 9, 27))).toEqual(["tomorrow:2026-10-28", "weekday:2026-10-29", "weekday:2026-10-30", "nextWeek:2026-11-02"]);
  });

  it("offers only tomorrow and next Monday on a Thursday", () => {
    expect(days(new Date(2026, 9, 29))).toEqual(["tomorrow:2026-10-30", "nextWeek:2026-11-02"]);
  });

  it("offers tomorrow and next Monday on a Friday, whose tomorrow is a Saturday", () => {
    expect(days(new Date(2026, 9, 30))).toEqual(["tomorrow:2026-10-31", "nextWeek:2026-11-02"]);
  });

  it("offers the coming work week on a Sunday, whose next Monday is tomorrow", () => {
    expect(days(new Date(2026, 10, 1))).toEqual(["tomorrow:2026-11-02", "weekday:2026-11-03", "weekday:2026-11-04", "weekday:2026-11-05", "weekday:2026-11-06"]);
  });
});

describe("choiceKey", () => {
  it("picks tomorrow with M, next Monday with W and other weekdays by their number", () => {
    expect(planChoices(new Date(2026, 9, 27)).map(choiceKey)).toEqual(["M", "4", "5", "W"]);
  });
});

describe("setPlan", () => {
  it("moves an item to a new day and removes it with null", () => {
    const planned = [{ id: "a", day: "2026-10-28" }, { id: "b", day: "2026-10-29" }];
    expect(setPlan(planned, "a", "2026-10-30")).toEqual([{ id: "b", day: "2026-10-29" }, { id: "a", day: "2026-10-30" }]);
    expect(setPlan(planned, "a", null)).toEqual([{ id: "b", day: "2026-10-29" }]);
  });
});

describe("rollOver", () => {
  it("does nothing within the day Today was set on", () => {
    expect(rollOver({ focus: ["a"], focusDay: "2026-10-27", planned: [{ id: "b", day: "2026-10-27" }] }, "2026-10-27", always)).toBeNull();
  });

  it("does nothing when Today is empty and no plan is due", () => {
    expect(rollOver({ focus: [], focusDay: null, planned: [{ id: "b", day: "2026-10-28" }] }, "2026-10-27", always)).toBeNull();
  });

  it("empties Today and moves in what is planned for today", () => {
    const state = { focus: ["a"], focusDay: "2026-10-26", planned: [{ id: "b", day: "2026-10-27" }, { id: "c", day: "2026-10-29" }] };
    expect(rollOver(state, "2026-10-27", always)).toEqual({ focus: ["b"], focusDay: "2026-10-27", planned: [{ id: "c", day: "2026-10-29" }] });
  });

  it("clears the day when nothing moves in", () => {
    expect(rollOver({ focus: ["a"], focusDay: "2026-10-26", planned: [] }, "2026-10-27", always)).toEqual({ focus: [], focusDay: null, planned: [] });
  });

  it("takes the oldest plans first and leaves what does not fit planned", () => {
    const planned = ["d", "c", "b", "a"].map((id, i) => ({ id, day: `2026-10-2${4 + i}` }));
    const next = rollOver({ focus: [], focusDay: null, planned }, "2026-10-27", always)!;
    expect(next.focus).toEqual(["d", "c", "b"]);
    expect(next.planned).toEqual([{ id: "a", day: "2026-10-27" }]);
  });

  it("drops plans of loaded items that cannot be pinned any more, and keeps those not loaded yet", () => {
    const planned = [{ id: "closed", day: "2026-10-29" }, { id: "missing", day: "2026-10-29" }];
    const next = rollOver({ focus: [], focusDay: null, planned }, "2026-10-27", () => false, (id) => id === "closed")!;
    expect(next.planned).toEqual([{ id: "missing", day: "2026-10-29" }]);
  });

  it("keeps planned what cannot be pinned", () => {
    const next = rollOver({ focus: [], focusDay: null, planned: [{ id: "b", day: "2026-10-27" }, { id: "x", day: "2026-10-27" }] }, "2026-10-27", (id) => id === "b")!;
    expect(next.focus).toEqual(["b"]);
    expect(next.planned).toEqual([{ id: "x", day: "2026-10-27" }]);
  });
});
