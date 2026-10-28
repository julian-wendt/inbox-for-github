import { describe, expect, it } from "vitest";
import { markedIn, markRange, toggleMark } from "./marks";

describe("marks", () => {
  it("toggles single items, never bars", () => {
    const one = toggleMark(new Set(), "a");
    expect([...one]).toEqual(["a"]);
    expect([...toggleMark(one, "a")]).toEqual([]);
    expect([...toggleMark(one, "bar:x")]).toEqual(["a"]);
  });

  it("marks a range in list order in either direction, leaving bars out", () => {
    const ids = ["a", "bar:x", "b", "c", "d"];
    expect([...markRange(new Set(), ids, "a", "c")].sort()).toEqual(["a", "b", "c"]);
    expect([...markRange(new Set(["d"]), ids, "c", "b")].sort()).toEqual(["b", "c", "d"]);
    expect([...markRange(new Set(), ids, null, "b")]).toEqual(["b"]);
  });

  it("keeps only marks still in the list, in its order", () => {
    expect(markedIn(new Set(["c", "gone", "a"]), ["a", "b", "c"])).toEqual(["a", "c"]);
  });
});
