import { describe, expect, it } from "vitest";
import type { Item } from "../model";
import { canDelta, covers, decodeScope, encodeScope, findTransfers, FULL_EVERY_MS, mergeDelta, mergeReloaded, transferCandidates } from "./delta";

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
