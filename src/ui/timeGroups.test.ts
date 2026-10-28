import { describe, expect, it } from "vitest";
import { groupBySnoozeEnd, groupByTime, snoozeGroup, timeGroup } from "./timeGroups";

// Friday, 23 October 2026, noon local time; Monday of that week is the 19th.
const now = new Date(2026, 9, 23, 12);
const at = (month: number, day: number, hour = 9) => new Date(2026, month, day, hour).toISOString();

describe("timeGroup", () => {
  it("sorts times into calendar buckets", () => {
    expect([at(9, 23, 1), at(9, 22, 23), at(9, 19, 8), at(9, 18), at(9, 12), at(9, 11), at(9, 2), at(8, 30)].map((t) => timeGroup(t, now))).toEqual([
      "today",
      "yesterday",
      "week",
      "lastWeek",
      "lastWeek",
      "month",
      "month",
      "older",
    ]);
  });
});

describe("groupByTime", () => {
  it("keeps the list order, leaves out empty buckets and follows the direction", () => {
    const list = [at(9, 23), at(9, 23, 8), at(8, 1)];
    expect(groupByTime(list, (t) => t, false, now).map((g) => [g.group, g.entries.length])).toEqual([
      ["today", 2],
      ["older", 1],
    ]);
    expect(groupByTime([...list].reverse(), (t) => t, true, now).map((g) => g.group)).toEqual(["older", "today"]);
  });
});

describe("groupBySnoozeEnd", () => {
  // Saturday, 24 Oct 2026, noon local time.
  const now = new Date(2026, 9, 24, 12);
  const at = (day: number, hour = 9) => new Date(2026, 9, day, hour).toISOString();
  type Entry = { id: string; until?: string; at: string };
  const e = (id: string, until?: string): Entry => ({ id, until, at: at(20) });
  const run = (list: Entry[], latestFirst = false) =>
    groupBySnoozeEnd(list, (x) => x.until, (x) => x.at, latestFirst, now).map((g) => [g.group, g.entries.map((x) => x.id)]);

  it("groups by the day the snooze ends, soonest first, undated last", () => {
    const list = [e("later", at(36)), e("none"), e("tomorrow", at(25)), e("today", at(24, 18)), e("nextWeek", at(27)), e("week", at(25, 23))];
    expect(run(list)).toEqual([
      ["today", ["today"]],
      ["tomorrow", ["tomorrow", "week"]],
      ["nextWeek", ["nextWeek"]],
      ["later", ["later"]],
      ["undated", ["none"]],
    ]);
  });

  it("turns the dated ones around on request, keeping undated last", () => {
    expect(run([e("a", at(25)), e("b", at(36)), e("none")], true)).toEqual([
      ["later", ["b"]],
      ["tomorrow", ["a"]],
      ["undated", ["none"]],
    ]);
  });

  it("counts the rest of a weekday's week as this week", () => {
    expect(snoozeGroup(at(23), new Date(2026, 9, 21, 12))).toBe("week");
  });
});
