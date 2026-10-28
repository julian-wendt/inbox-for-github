import { describe, expect, it } from "vitest";
import { keyMatches } from "./keyMatch";

describe("keyMatches", () => {
  it("matches a letter without Control, in either case", () => {
    expect(keyMatches("D", { key: "d", ctrlKey: false })).toBe(true);
    expect(keyMatches("D", { key: "D", ctrlKey: false })).toBe(true);
    expect(keyMatches("D", { key: "x", ctrlKey: false })).toBe(false);
  });

  it("matches ⌃A only with Control down, and keeps plain letters from firing on Control", () => {
    expect(keyMatches("⌃A", { key: "a", ctrlKey: true })).toBe(true);
    expect(keyMatches("⌃A", { key: "a", ctrlKey: false })).toBe(false);
    expect(keyMatches("A", { key: "a", ctrlKey: true })).toBe(false);
  });
});
