import { afterEach, describe, expect, it } from "vitest";
import { keyMatches } from "./keyMatch";
import { setPlatform } from "./platform";

afterEach(() => setPlatform("mac"));

const press = (key: string, held: Partial<Record<"metaKey" | "ctrlKey" | "altKey", boolean>> = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, ...held });

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

  it("takes Alt for ⌃ on Windows, where Control belongs to the ⌘ shortcuts", () => {
    setPlatform("windows");
    expect(keyMatches("⌃A", press("a", { altKey: true }))).toBe(true);
    expect(keyMatches("⌃A", press("a", { ctrlKey: true }))).toBe(false);
    expect(keyMatches("A", press("a", { altKey: true }))).toBe(false);
    expect(keyMatches("A", press("a"))).toBe(true);
  });

  it("does not fire a plain letter while Ctrl is down on Windows", () => {
    setPlatform("windows");
    expect(keyMatches("R", press("r", { ctrlKey: true }))).toBe(false);
  });

  it("matches nothing for a key pressed with AltGr on Windows", () => {
    setPlatform("windows");
    expect(keyMatches("D", press("d", { ctrlKey: true, altKey: true }))).toBe(false);
    expect(keyMatches("⌃A", press("a", { ctrlKey: true, altKey: true }))).toBe(false);
  });
});
