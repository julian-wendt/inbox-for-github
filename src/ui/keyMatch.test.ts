import { describe, expect, it } from "vitest";
import { keyMatches } from "./keyMatch";

describe("keyMatches", () => {
  it("matches a letter without Control, in either case", () => {
    expect(keyMatches("D", { key: "d", ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    expect(keyMatches("D", { key: "D", ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    expect(keyMatches("D", { key: "x", ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
  });

  it("matches ⌃A only with Control down, and keeps plain letters from firing on Control", () => {
    expect(keyMatches("⌃A", { key: "a", ctrlKey: true, metaKey: false, altKey: false })).toBe(true);
    expect(keyMatches("⌃A", { key: "a", ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
    expect(keyMatches("A", { key: "a", ctrlKey: true, metaKey: false, altKey: false })).toBe(false);
  });

  it("does not fire a plain letter while ⌘ or ⌥ is down", () => {
    expect(keyMatches("R", { key: "r", ctrlKey: false, metaKey: true, altKey: false })).toBe(false);
    expect(keyMatches("C", { key: "c", ctrlKey: false, metaKey: false, altKey: true })).toBe(false);
    expect(keyMatches("⌃A", { key: "a", ctrlKey: true, metaKey: true, altKey: false })).toBe(false);
  });
});
