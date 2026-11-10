import { describe, expect, it } from "vitest";
import type { Classified } from "../classify";
import type { Item } from "../model";
import { assignedAt, groupByRepo, groupByType, groupPlate, isNewAssignment, lastOthersActivity, MOVES_UP_DEFAULT, withAssignees, withSelfAssigned, localDay, moveBar, moveTypeBar, onPlate, orderBars, withSaved, plateCount, shownStatus, type PlateGroup } from "./assignments";


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

  it("puts review, progress, todo, blocked and later in their bars, and what is finished but open last", () => {
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
      ["blocked", ["blocked"]],
      ["later", ["snoozed"]],
      ["finished", ["done", "mine-done"]],
    ]);
  });

  it("files snoozed items under Follow-up, whatever their work status", () => {
    const groups = groupPlate([entry("a"), entry("z", { status: "snoozed", bucket: "snoozed" })]);
    expect(groups.map((g) => [g.group, g.entries.map((e) => e.item.id)])).toEqual([
      ["todo", ["a"]],
      ["later", ["z"]],
    ]);
  });

  it("sorts each bar by when the viewer was assigned, newest first", () => {
    const at = (day: string) => ({ activities: [{ kind: "assigned" as const, at: `2026-10-${day}T00:00:00Z`, actor: "bob", assignee: "me" }] });
    const groups = groupPlate([entry("old", {}, at("02")), entry("new", {}, at("09"))], {}, [], "me");
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
  it("counts everything on the plate but the blocked and follow-up bars", () => {
    const blocked = { boards: [{ id: "b", title: "b", status: "Blocked", sprint: null, fields: [] }] };
    expect(plateCount(groupPlate([entry("a", { bucket: "inbox" }), entry("b"), entry("c", { status: "snoozed", bucket: "snoozed" }), entry("d", {}, blocked)]))).toBe(2);
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
    expect(orderBars(["todo", "review"])).toEqual(["progress", "todo", "review", "blocked", "later", "finished"]);
  });

  it("puts a bar missing from a saved order where it belongs by default", () => {
    expect(orderBars(["review", "progress", "todo", "later", "finished"])).toEqual(["review", "progress", "todo", "blocked", "later", "finished"]);
  });

  it("ignores bars a saved order names that no longer exist, like Today and Planned", () => {
    expect(orderBars(["focus", "review", "planned"] as unknown as PlateGroup[])).toEqual(["review", "progress", "todo", "blocked", "later", "finished"]);
  });

  it("moves a bar to just before the one it was dropped on", () => {
    expect(moveBar([], "later", "review")).toEqual(["later", "review", "progress", "todo", "blocked", "finished"]);
  });
});

describe("localDay", () => {
  it("formats the local date", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});


describe("groupByRepo", () => {
  it("makes one bar per repository by name, each in the given order of its time", () => {
    const at = (id: string, repo: string, createdAt: string) => entry(id, {}, { repo, createdAt });
    const entries = [at("docs", "octo-org/docs", "2026-10-01T00:00:00Z"), at("old", "octo-org/app", "2026-10-01T00:00:00Z"), at("new", "octo-org/app", "2026-10-02T00:00:00Z")];
    const ids = (order?: "oldest") => groupByRepo(entries, (c) => c.item.createdAt, order).map((g) => [g.group, g.entries.map((e) => e.item.id)]);
    expect(ids()).toEqual([["repo:octo-org/app", ["new", "old"]], ["repo:octo-org/docs", ["docs"]]]);
    expect(ids("oldest")[0][1]).toEqual(["old", "new"]);
  });

  it("orders the bars across organizations by the full name", () => {
    const entries = [entry("h", {}, { repo: "octo-org/app" }), entry("l", {}, { repo: "lumen-labs/site" }), entry("a", {}, { repo: "harbor-works/api" })];
    expect(groupByRepo(entries, (c) => c.item.createdAt).map((g) => g.group)).toEqual(["repo:harbor-works/api", "repo:lumen-labs/site", "repo:octo-org/app"]);
  });
});

describe("groupByType", () => {
  const typed = (id: string, name: string | null, status?: string) =>
    entry(id, {}, { issueType: name ? { name, color: "RED" } : null, ...(status && { boards: [{ id: "b", title: "b", status, sprint: null, fields: [] }] }) });

  it("puts pull requests first, then bugs, other types, tasks, features, stories and untyped issues", () => {
    const entries = [typed("story", "Story"), typed("none", null), typed("feature", "Feature"), entry("pr", {}, { kind: "pr" }), typed("bug", "Bug"), typed("task", "Task"), typed("spike", "Spike")];
    expect(groupByType(entries).map((g) => g.group)).toEqual(["pr", "type:Bug", "type:Spike", "type:Task", "type:Feature", "type:Story", "notype"]);
  });

  it("follows the saved order and puts a type it leaves out before the bar that follows it by default", () => {
    const entries = [typed("story", "Story"), typed("none", null), typed("bug", "Bug"), typed("task", "Task")];
    expect(groupByType(entries, {}, "newest", "", ["type:Story", "type:Bug"]).map((g) => g.group)).toEqual(["type:Task", "type:Story", "type:Bug", "notype"]);
    expect(groupByType(entries, {}, "newest", "", ["notype", "type:Gone"]).map((g) => g.group)).toEqual(["type:Bug", "type:Task", "type:Story", "notype"]);
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

describe("moveTypeBar", () => {
  it("moves a type bar before another and keeps saved bars that are not shown", () => {
    expect(moveTypeBar(["pr", "type:Bug", "notype"], ["type:Epic", "pr"], "notype", "pr")).toEqual(["notype", "pr", "type:Bug", "type:Epic"]);
  });
});

describe("withSaved", () => {
  it("completes a saved order with the bars it leaves out", () => {
    expect(withSaved(["a", "b", "c", "d"], ["c", "a"])).toEqual(["b", "c", "a", "d"]);
    expect(withSaved(["a", "b"], ["x"])).toEqual(["a", "b"]);
  });
});
