import { describe, expect, it } from "vitest";
import type { Item } from "../model";
import { canDelta, covers, decodeScope, encodeScope, FULL_EVERY_MS, mergeDelta } from "./delta";

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
