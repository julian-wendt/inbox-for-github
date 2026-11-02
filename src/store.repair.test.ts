import { describe, expect, it } from "vitest";
import { staleLogRows } from "./store";

describe("staleLogRows", () => {
  const row = (id: number, status: "open" | "done" | "snoozed", node_id = "I_1") => ({ id, node_id, status });

  it("drops a trailing done no stored status stands behind", () => {
    expect(staleLogRows([row(1, "done")], new Map())).toEqual([1]);
    expect(staleLogRows([row(1, "snoozed"), row(2, "open"), row(3, "done")], new Map())).toEqual([3]);
  });

  it("keeps a history that ends in the stored status", () => {
    expect(staleLogRows([row(1, "done"), row(2, "open")], new Map())).toEqual([]);
    expect(staleLogRows([row(1, "open"), row(2, "done")], new Map([["I_1", "done"]]))).toEqual([]);
  });

  it("leaves a history alone that never names the stored status", () => {
    expect(staleLogRows([row(1, "open")], new Map([["I_1", "snoozed"]]))).toEqual([]);
  });

  it("looks at each item on its own", () => {
    expect(staleLogRows([row(1, "done", "I_1"), row(2, "done", "I_2")], new Map([["I_2", "done"]]))).toEqual([1]);
  });
});
