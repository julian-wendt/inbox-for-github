import { describe, expect, it } from "vitest";
import type { Item } from "../model";
import { addRequested, canDelta, covers, decodeScope, encodeScope, findTransfers, FULL_EVERY_MS, mergeDelta, mergeReloaded, NEW_REVIEWS_MAX, transferCandidates, unseenReviews, widensClosed, withdrawReviews, withPending } from "./delta";
import { withSelfAssigned, withSelfUnassigned } from "../ui/assignments";

const item = (id: string, overrides: Partial<Item> = {}) => ({ id, title: id, closed: null, ...overrides }) as Item;
const now = Date.parse("2026-10-23T12:00:00Z");

describe("mergeDelta", () => {
  it("swaps in changed items, adds new ones and keeps the rest", () => {
    const merged = mergeDelta([item("a"), item("b")], [item("b", { title: "b2" }), item("c")], 7, now);
    expect(merged.map((i) => [i.id, i.title])).toEqual([
      ["a", "a"],
      ["b", "b2"],
      ["c", "c"],
    ]);
  });

  it("drops closed items outside the closed window", () => {
    const old = item("old", { closed: { state: "closed", at: "2026-10-01T00:00:00Z" } });
    const fresh = item("fresh", { closed: { state: "merged", at: "2026-10-22T00:00:00Z" } });
    expect(mergeDelta([old, fresh], [], 7, now).map((i) => i.id)).toEqual(["fresh"]);
    expect(mergeDelta([fresh], [], 0, now)).toEqual([]);
  });
});

describe("withPending", () => {
  const at = "2026-10-23T11:59:00Z";
  const before = item("a", { assignees: ["bob"], reasons: ["involved"], activities: [] });

  it("puts a pending assignment back onto a delta fetched before GitHub had it", () => {
    const merged = mergeDelta([withSelfAssigned(before, "me", at), item("b")], [before], 7, now);
    const kept = withPending(merged, [{ id: "a", change: (i) => withSelfAssigned(i, "me", at) }]);
    expect(kept.map((i) => [i.id, i.assignees])).toEqual([
      ["a", ["bob", "me"]],
      ["b", undefined],
    ]);
    expect(kept[1]).toBe(merged[1]);
  });

  it("applies the changes in order and leaves an item that already shows them alone", () => {
    const assign = { id: "a", change: (i: Item) => withSelfAssigned(i, "me", at) };
    const leave = { id: "a", change: (i: Item) => withSelfUnassigned(i, "me", "2026-10-23T11:59:30Z") };
    expect(withPending([before], [assign, leave])[0].assignees).toEqual(["bob"]);
    const landed = { ...before, assignees: ["bob", "me"] };
    expect(withPending([landed], [assign])[0]).toBe(landed);
    const items = [before];
    expect(withPending(items, [])).toBe(items);
  });
});

describe("withdrawReviews", () => {
  it("drops the review reason the search no longer has, and items left without a reason", () => {
    const both = item("both", { reasons: ["review", "involved"] });
    const only = item("only", { reasons: ["review"] });
    const still = item("still", { reasons: ["review"] });
    const closed = item("closed", { reasons: ["review"], closed: { state: "merged", at: "2026-10-22T00:00:00Z" } });
    const other = item("other", { reasons: ["involved"] });
    const after = withdrawReviews([both, only, still, closed, other], new Set(["still"]));
    expect(after.map((i) => [i.id, i.reasons])).toEqual([
      ["both", ["involved"]],
      ["still", ["review"]],
      ["closed", ["review"]],
      ["other", ["involved"]],
    ]);
    expect(after[3]).toBe(other);
  });
});

describe("unseenReviews", () => {
  it("names the requests not held as review requests, cached or not", () => {
    const items = [item("held", { reasons: ["review"] }), item("involved", { reasons: ["involved"] })];
    expect(unseenReviews(items, new Set(["held", "involved", "new"]))).toEqual(["involved", "new"]);
  });

  it("loads at most NEW_REVIEWS_MAX at once", () => {
    const ids = new Set(Array.from({ length: NEW_REVIEWS_MAX + 5 }, (_, i) => `PR_${i}`));
    expect(unseenReviews([], ids)).toHaveLength(NEW_REVIEWS_MAX);
  });
});

describe("addRequested", () => {
  it("adds the reason review, keeps involved from the cached copy, and adds what was not cached", () => {
    const cached = item("pr", { reasons: ["involved"], title: "old" });
    const other = item("other", { reasons: ["involved"] });
    const after = addRequested([cached, other], [item("pr", { reasons: ["mentioned"], title: "new" }), item("fresh", { reasons: [] })]);
    expect(after.map((i) => [i.id, i.title, i.reasons])).toEqual([
      ["pr", "new", ["involved", "review", "mentioned"]],
      ["other", other.title, ["involved"]],
      ["fresh", item("fresh").title, ["review"]],
    ]);
  });
});

describe("findTransfers", () => {
  const issue = (id: string, repo: string, overrides: Partial<Item> = {}) => item(id, { kind: "issue", repo, title: "Broken link", createdAt: "2026-10-01T09:00:00Z", ...overrides });
  const moved = (overrides: Partial<Item> = {}) => issue("I_new", "octo-org/portal", { transferredFrom: "octo-org/docs", ...overrides });

  it("pairs the cached copy in the old repository with the moved issue", () => {
    expect(findTransfers([issue("I_old", "octo-org/docs"), issue("I_other", "octo-org/app")], [moved()])).toEqual(new Map([["I_old", "I_new"]]));
  });

  it("needs the same repository, creation time, title and kind", () => {
    const misses = [issue("a", "octo-org/app"), issue("b", "octo-org/docs", { createdAt: "2026-10-01T09:00:01Z" }), issue("c", "octo-org/docs", { title: "Other" }), issue("d", "octo-org/docs", { kind: "pr" })];
    expect(findTransfers(misses, [moved()])).toEqual(new Map());
  });

  it("leaves a cached item alone that the fetch still returns under its own id", () => {
    const old = issue("I_old", "octo-org/docs");
    expect(findTransfers([old], [old, moved()])).toEqual(new Map());
  });

  it("pairs nothing when two cached issues would match", () => {
    expect(findTransfers([issue("a", "octo-org/docs"), issue("b", "octo-org/docs")], [moved()])).toEqual(new Map());
  });

  it("finds nothing among issues never moved", () => {
    expect(findTransfers([issue("I_old", "octo-org/docs")], [issue("I_new", "octo-org/portal")])).toEqual(new Map());
  });
});

describe("canDelta", () => {
  it("needs a recent full fetch for the same settings", () => {
    expect(canDelta({ scope: "s", fullAt: new Date(now - 60_000) }, "s", now)).toBe(true);
    expect(canDelta({ scope: "s", fullAt: new Date(now - FULL_EVERY_MS) }, "s", now)).toBe(false);
    expect(canDelta({ scope: "other", fullAt: new Date(now) }, "s", now)).toBe(false);
    expect(canDelta(null, "s", now)).toBe(false);
  });
});

describe("coverage", () => {
  const coverage = { closedDays: 7, boards: true, maxItems: 200 };

  it("round-trips the scope and rejects older formats", () => {
    expect(decodeScope(encodeScope("k", coverage))).toEqual({ key: "k", coverage });
    expect(decodeScope('[["octo-org"],200,7,true,"me"]')).toBeNull();
    expect(decodeScope(undefined)).toBeNull();
  });

  it("covers narrower settings, not wider ones", () => {
    expect(covers(coverage, { closedDays: 0, boards: false, maxItems: 100 })).toBe(true);
    expect(covers(coverage, { closedDays: 30, boards: true, maxItems: 200 })).toBe(false);
    expect(covers(coverage, { closedDays: 7, boards: true, maxItems: 500 })).toBe(false);
  });

  it("widens only the closed window while the item limit is covered", () => {
    expect(widensClosed(coverage, { closedDays: 30, boards: true, maxItems: 200 })).toBe(true);
    expect(widensClosed({ ...coverage, closedDays: 0 }, { closedDays: 7, boards: false, maxItems: 100 })).toBe(true);
    expect(widensClosed(coverage, { closedDays: 30, boards: true, maxItems: 500 })).toBe(false);
    expect(widensClosed(coverage, { closedDays: 7, boards: true, maxItems: 200 })).toBe(false);
  });
});

describe("transferCandidates", () => {
  const issue = (id: string, repo: string, overrides: Partial<Item> = {}) => item(id, { kind: "issue", repo, title: "Broken link", createdAt: "2026-10-01T09:00:00Z", ...overrides });

  it("names cached issues with the same creation time and title in another repository", () => {
    const cached = [issue("I_old", "octo-org/docs"), issue("I_new", "octo-org/portal"), issue("I_same_repo", "octo-org/docs"), issue("I_later", "octo-org/portal", { createdAt: "2026-10-02T09:00:00Z" }), issue("PR_1", "octo-org/portal", { kind: "pr" })];
    expect(transferCandidates(cached, ["I_old"])).toEqual(["I_new"]);
  });

  it("names none for an item that is not cached", () => {
    expect(transferCandidates([issue("I_new", "octo-org/portal")], ["I_old"])).toEqual([]);
  });
});

describe("mergeReloaded", () => {
  it("swaps in the fresh versions, keeps search-only reasons, and drops transferred copies", () => {
    const cached = [item("a", { reasons: ["review", "assigned"] }), item("I_old"), item("I_new")];
    const merged = mergeReloaded(cached, [item("a", { title: "a2", reasons: ["mentioned"] })], new Map([["I_old", "I_new"]]));
    expect(merged.map((i) => [i.id, i.title, i.reasons])).toEqual([
      ["a", "a2", ["review", "mentioned"]],
      ["I_new", "I_new", undefined],
    ]);
  });
});
