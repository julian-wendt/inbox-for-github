import { describe, expect, it } from "vitest";
import type { Classified } from "../classify";
import type { Item } from "../model";
import { assignedAt, groupByType, groupPlate, isNewAssignment, lastOthersActivity, MOVES_UP_DEFAULT, withAssignees, withSelfAssigned, localDay, moveBar, onPlate, orderBars, plateCount, shownStatus } from "./assignments";


function entry(id: string, overrides: Partial<Classified> = {}, item: Partial<Item> = {}): Classified {
  return {
    item: { id, title: id, repo: "o/a", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-22T00:00:00Z", closed: null, linkedPrs: [], boards: [], kind: "issue", draft: false, reasons: ["assigned"], comments: [], activities: [], body: "", author: "alice", ...item } as Item,
    bucket: "assigned",
    status: "open",
    mention: null,
    answered: null,
    asks: [],
    statusAt: "2026-10-20T00:00:00Z",
    statusReset: false,
    ...overrides,
  };
}

describe("groupPlate", () => {
  const board = (status: string) => ({ boards: [{ id: "b", title: "b", status, sprint: null, fields: [] }] });

  it("puts review, progress, todo and later in their bars, and what is finished but open last", () => {
    const groups = groupPlate([
      entry("new", { status: "open", bucket: "inbox" }),
      entry("review", {}, board("In Review")),
      entry("progress", {}, board("In Progress")),
      entry("todo"),
      entry("done", {}, board("Done")),
      entry("blocked", {}, board("Blocked")),
      entry("snoozed", { status: "snoozed", bucket: "snoozed" }),
      entry("mine-done", { status: "done", updates: [] }),
      entry("not-mine", { status: "open", bucket: "involved" }, { reasons: ["involved"] }),
      entry("closed", {}, { closed: { state: "closed", at: "2026-10-22T00:00:00Z" } }),
    ]);
    expect(groups.map((g) => [g.group, g.entries.map((e) => e.item.id).sort()])).toEqual([
      ["review", ["review"]],
      ["progress", ["progress"]],
      ["todo", ["new", "todo"]],
      ["later", ["blocked", "snoozed"]],
      ["finished", ["done", "mine-done"]],
    ]);
  });

  it("puts items marked today on top, but never snoozed ones", () => {
    const groups = groupPlate([entry("a"), entry("b"), entry("z", { status: "snoozed", bucket: "snoozed" })], ["b", "z"]);
    expect(groups.map((g) => [g.group, g.entries.map((e) => e.item.id)])).toEqual([
      ["focus", ["b"]],
      ["todo", ["a"]],
      ["later", ["z"]],
    ]);
  });

  it("sorts each bar by when the viewer was assigned, newest first", () => {
    const at = (day: string) => ({ activities: [{ kind: "assigned" as const, at: `2026-10-${day}T00:00:00Z`, actor: "bob", assignee: "me" }] });
    const groups = groupPlate([entry("old", {}, at("02")), entry("new", {}, at("09"))], [], {}, [], "me");
    expect(groups[0].entries.map((e) => e.item.id)).toEqual(["new", "old"]);
  });
});

describe("isNewAssignment", () => {
  const assignedBy = (actor: string, at = "2026-10-21T00:00:00Z") => ({ activities: [{ kind: "assigned" as const, at, actor, assignee: "me" }] });

  it("is new until the viewer opens it after the assignment", () => {
    const fresh = entry("a", { statusAt: null }, assignedBy("bob"));
    expect(isNewAssignment(fresh, new Map(), "me")).toBe(true);
    expect(isNewAssignment(fresh, new Map([["a", "2026-10-20T00:00:00Z"]]), "me")).toBe(true);
    expect(isNewAssignment(fresh, new Map([["a", "2026-10-22T00:00:00Z"]]), "me")).toBe(false);
  });

  it("is never new when the viewer assigned themselves, or set a status after the assignment", () => {
    expect(isNewAssignment(entry("a", { statusAt: null }, assignedBy("me")), new Map(), "me")).toBe(false);
    expect(isNewAssignment(entry("a", { statusAt: "2026-10-22T00:00:00Z" }, assignedBy("bob")), new Map(), "me")).toBe(false);
  });

  it("without an assignment event, is new only when never opened", () => {
    expect(isNewAssignment(entry("a", { statusAt: null }), new Map(), "me")).toBe(true);
    expect(isNewAssignment(entry("a", { statusAt: null }), new Map([["a", "2026-10-01T00:00:00Z"]]), "me")).toBe(false);
  });
});

describe("plateCount", () => {
  it("counts everything on the plate but the later bar", () => {
    expect(plateCount(groupPlate([entry("a", { bucket: "inbox" }), entry("b"), entry("c", { status: "snoozed", bucket: "snoozed" })]))).toBe(2);
  });
});

describe("assignedAt", () => {
  it("takes the viewer's latest assignment, else the opening time", () => {
    const item = {
      createdAt: "2026-10-01T00:00:00Z",
      activities: [
        { kind: "assigned", at: "2026-10-03T00:00:00Z", actor: "carol", assignee: "me" },
        { kind: "assigned", at: "2026-10-06T00:00:00Z", actor: "bob", assignee: "dave" },
        { kind: "assigned", at: "2026-10-05T00:00:00Z", actor: "bob", assignee: "me" },
      ],
    } as unknown as Item;
    expect(assignedAt(item, "me")).toEqual({ at: "2026-10-05T00:00:00Z", by: "bob" });
    expect(assignedAt({ ...item, activities: [] }, "me")).toEqual({ at: "2026-10-01T00:00:00Z", by: null });
  });
});

describe("bar order", () => {
  it("completes a partial order with each remaining bar before the one it precedes by default", () => {
    expect(orderBars(["todo", "review"])).toEqual(["progress", "todo", "focus", "review", "planned", "later", "finished"]);
  });

  it("puts a bar missing from a saved order where it belongs by default", () => {
    expect(orderBars(["review", "focus", "progress", "todo", "later", "finished"])).toEqual(["review", "focus", "progress", "todo", "planned", "later", "finished"]);
  });

  it("moves a bar to just before the one it was dropped on", () => {
    expect(moveBar([], "later", "review")).toEqual(["focus", "later", "review", "progress", "todo", "planned", "finished"]);
  });
});

describe("localDay", () => {
  it("formats the local date", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});


describe("groupByType", () => {
  const typed = (id: string, name: string | null, status?: string) =>
    entry(id, {}, { issueType: name ? { name, color: "RED" } : null, ...(status && { boards: [{ id: "b", title: "b", status, sprint: null, fields: [] }] }) });

  it("puts pull requests first, then bugs, other types, tasks, features, stories and untyped issues", () => {
    const entries = [typed("story", "Story"), typed("none", null), typed("feature", "Feature"), entry("pr", {}, { kind: "pr" }), typed("bug", "Bug"), typed("task", "Task"), typed("spike", "Spike")];
    expect(groupByType(entries).map((g) => g.group)).toEqual(["pr", "type:Bug", "type:Spike", "type:Task", "type:Feature", "type:Story", "notype"]);
  });

  it("orders each bar by how far the work is, then by the last update", () => {
    const entries = [typed("todo", "Bug"), typed("review", "Bug", "In Review"), typed("progress", "Bug", "In Progress")];
    expect(groupByType(entries)[0].entries.map((e) => e.item.id)).toEqual(["review", "progress", "todo"]);
  });
});

describe("onPlate", () => {
  it("leaves out the viewer's own pull requests, which belong to Created by me", () => {
    expect(onPlate(entry("pr", {}, { kind: "pr", author: "me" }), "me")).toBe(false);
    expect(onPlate(entry("pr", {}, { kind: "pr", author: "bob" }), "me")).toBe(true);
    expect(onPlate(entry("issue", {}, { author: "me" }), "me")).toBe(true);
  });
});

describe("withSelfAssigned", () => {
  it("adds the viewer as assignee with an assignment event by themselves, so it is not new", () => {
    const item = entry("a", {}, { assignees: ["bob"], reasons: ["involved"], activities: [] }).item;
    const assigned = withSelfAssigned(item, "me", "2026-10-25T10:00:00Z");
    expect(assigned.assignees).toEqual(["bob", "me"]);
    expect(assigned.reasons).toEqual(["involved", "assigned"]);
    expect(isNewAssignment({ item: assigned, statusAt: null }, new Map(), "me")).toBe(false);
    expect(withSelfAssigned(assigned, "me", "2026-10-25T11:00:00Z")).toBe(assigned);
  });
});

describe("withAssignees", () => {
  it("sets GitHub's assignees and the assigned reason to match", () => {
    const item = entry("a", {}, { assignees: ["me", "bob"], reasons: ["assigned", "involved"] }).item;
    expect(withAssignees(item, ["bob"], "me")).toMatchObject({ assignees: ["bob"], reasons: ["involved"] });
    expect(withAssignees({ ...item, reasons: ["involved"] }, ["Me"], "me").reasons).toEqual(["involved", "assigned"]);
  });
});

describe("shownStatus", () => {
  const board = (status: string) => ({ boards: [{ id: "b", title: "b", status, sprint: null, fields: [] }] });

  it("shows an open item its board calls done as done", () => {
    expect(shownStatus(entry("x", {}, board("Done")), {})).toBe("done");
  });

  it("keeps the viewer's own status otherwise", () => {
    expect(shownStatus(entry("x", {}, board("In Progress")), {})).toBe("open");
    expect(shownStatus(entry("x", { status: "snoozed" }, board("Done")), {})).toBe("snoozed");
  });
});

describe("lastOthersActivity", () => {
  const item = entry("x", {}, {
    comments: [
      { author: "bob", body: "looks good", createdAt: "2026-10-10T00:00:00Z" },
      { author: "me", body: "thanks", createdAt: "2026-10-15T00:00:00Z" },
      { author: "ci[bot]", body: "green", createdAt: "2026-10-14T00:00:00Z" },
    ],
    activities: [
      { kind: "reviewed", at: "2026-10-11T00:00:00Z", actor: "carol", state: "APPROVED" },
      { kind: "assigned", at: "2026-10-12T00:00:00Z", actor: "dave", assignee: "me" },
      { kind: "commit", at: "2026-10-13T00:00:00Z" },
      { kind: "state", at: "2026-10-16T00:00:00Z", actor: "me", change: "closed" },
    ],
  }).item;

  it("counts others' events by default, and never the viewer's own activity", () => {
    expect(lastOthersActivity(item, "me")).toBe("2026-10-12T00:00:00Z");
  });

  it("counts commits and bots only when switched on", () => {
    expect(lastOthersActivity(item, "me", { ...MOVES_UP_DEFAULT, commits: true })).toBe("2026-10-13T00:00:00Z");
    expect(lastOthersActivity(item, "me", { ...MOVES_UP_DEFAULT, bots: true })).toBe("2026-10-14T00:00:00Z");
  });

  it("keeps reviews when events are switched off", () => {
    expect(lastOthersActivity(item, "me", { ...MOVES_UP_DEFAULT, events: false })).toBe("2026-10-11T00:00:00Z");
  });
});

describe("groupPlate with planned items", () => {
  it("files planned items in their bar, soonest day first, and keeps Today above it", () => {
    const groups = groupPlate([entry("a"), entry("b"), entry("c")], ["c"], {}, [], "", [{ id: "a", day: "2026-10-29" }, { id: "b", day: "2026-10-28" }, { id: "c", day: "2026-10-28" }]);
    expect(groups.map((g) => [g.group, g.entries.map((e) => e.item.id)])).toEqual([["focus", ["c"]], ["planned", ["b", "a"]]]);
  });

  it("leaves planned items out of the sidebar count", () => {
    expect(plateCount(groupPlate([entry("a"), entry("b")], [], {}, [], "", [{ id: "a", day: "2026-10-28" }]))).toBe(1);
  });
});
