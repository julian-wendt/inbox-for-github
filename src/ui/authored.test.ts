import { describe, expect, it } from "vitest";
import type { Classified } from "../classify";
import type { Item } from "../model";
import { authoredCount, groupAuthored, nobodyOnIt } from "./authored";

function entry(id: string, overrides: Partial<Classified> = {}, item: Partial<Item> = {}): Classified {
  return {
    item: { id, kind: "issue", author: "me", createdAt: "2026-10-01T00:00:00Z", closed: null, draft: false, assignees: ["bob"], reviewRequests: [], reviews: [], linkedPrs: [], boards: [], ...item } as Item,
    bucket: "authored",
    status: "open",
    mention: null,
    answered: null,
    asks: [],
    statusAt: null,
    statusReset: false,
    ...overrides,
  };
}

describe("nobodyOnIt", () => {
  it("holds issues without assignees and ready pull requests without reviewers", () => {
    expect(nobodyOnIt(entry("a", {}, { assignees: [] }).item)).toBe(true);
    expect(nobodyOnIt(entry("a").item)).toBe(false);
    expect(nobodyOnIt(entry("p", {}, { kind: "pr", assignees: [] }).item)).toBe(true);
    expect(nobodyOnIt(entry("p", {}, { kind: "pr", draft: true }).item)).toBe(false);
    expect(nobodyOnIt(entry("p", {}, { kind: "pr", reviewRequests: [{ reviewer: "carol", at: "2026-10-02T00:00:00Z" }] }).item)).toBe(false);
  });
});

describe("groupAuthored", () => {
  it("holds only the viewer's open items not marked done, in their bars", () => {
    const groups = groupAuthored(
      [
        entry("nobody", {}, { assignees: [] }),
        entry("todo"),
        entry("snoozed", { status: "snoozed" }),
        entry("asked", { bucket: "inbox", asks: ["mention"] }),
        entry("others", {}, { author: "bob" }),
        entry("closed", {}, { closed: { state: "closed", at: "2026-10-05T00:00:00Z" } }),
        entry("marked", { status: "done", bucket: "done" }),
        entry("answered", { status: "done", bucket: "done", answered: "mention" }),
      ],
      "me",
    );
    expect(groups.map((g) => [g.group, g.entries.map((e) => e.item.id).sort()])).toEqual([
      ["unassigned", ["nobody"]],
      ["taken", ["answered", "asked", "todo"]],
      ["later", ["snoozed"]],
    ]);
    expect(authoredCount(groups)).toBe(4);
  });

  it("sorts each bar by when the item was opened", () => {
    const entries = [entry("old", {}, { createdAt: "2026-09-01T00:00:00Z" }), entry("new", {}, { createdAt: "2026-10-09T00:00:00Z" })];
    expect(groupAuthored(entries, "me")[0].entries.map((e) => e.item.id)).toEqual(["new", "old"]);
    expect(groupAuthored(entries, "me", "oldest")[0].entries.map((e) => e.item.id)).toEqual(["old", "new"]);
  });
});
