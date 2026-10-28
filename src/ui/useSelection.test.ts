import { describe, expect, it } from "vitest";
import { successor } from "./useSelection";

const isBar = (id: string) => id.startsWith("bar:");

describe("successor", () => {
  it("takes the item that moved into the vanished item's place", () => {
    expect(successor(["a", "c", "d"], { id: "b", index: 1 }, isBar)).toBe("c");
  });

  it("skips a bar heading for an item, so an open detail shows the next item", () => {
    expect(successor(["bar:x", "a", "bar:y", "c"], { id: "b", index: 2 }, isBar)).toBe("c");
    expect(successor(["bar:x", "a", "bar:y"], { id: "b", index: 2 }, isBar)).toBe("a");
  });

  it("keeps bars for a vanished bar, and the last id past the end", () => {
    expect(successor(["bar:x", "a"], { id: "bar:gone", index: 0 }, isBar)).toBe("bar:x");
    expect(successor(["a", "b"], { id: "c", index: 5 }, isBar)).toBe("b");
    expect(successor([], { id: "c", index: 0 }, isBar)).toBeNull();
  });
});
