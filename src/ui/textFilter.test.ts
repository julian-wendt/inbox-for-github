import { describe, expect, it } from "vitest";
import type { Classified } from "../classify";
import { filterGroups, matchesText, numberSpans, titleSpans } from "./textFilter";

const item = { title: "Fix login redirect", number: 42 };

describe("matchesText", () => {
  it("matches everything for a blank query", () => {
    expect(matchesText(item, "")).toBe(true);
    expect(matchesText(item, "   ")).toBe(true);
  });

  it("finds words in the title, case-insensitively, in any order", () => {
    expect(matchesText(item, "LOGIN")).toBe(true);
    expect(matchesText(item, "redirect fix")).toBe(true);
    expect(matchesText(item, "logout")).toBe(false);
  });

  it("finds a number by its start, bare or with a hash", () => {
    expect(matchesText(item, "42")).toBe(true);
    expect(matchesText(item, "4")).toBe(true);
    expect(matchesText(item, "#4")).toBe(true);
    expect(matchesText(item, "2")).toBe(false);
    expect(matchesText({ ...item, number: 120 }, "#12")).toBe(true);
  });

  it("keeps a hash word to the number, not the title", () => {
    expect(matchesText({ title: "Issue #7 follow-up", number: 99 }, "#7")).toBe(false);
    expect(matchesText(item, "#login")).toBe(false);
  });

  it("needs every word to match", () => {
    expect(matchesText(item, "login 42")).toBe(true);
    expect(matchesText(item, "login 7")).toBe(false);
  });
});

describe("filterGroups", () => {
  const entry = (title: string, number: number) => ({ item: { title, number } }) as unknown as Classified;
  const groups = [
    { group: "review", entries: [entry("Other", 1)] },
    { group: "todo", entries: [entry("Fix login", 2), entry("Docs", 3)] },
    { group: "later", entries: [entry("Docs again", 4)] },
  ];

  it("returns the groups untouched for a blank query", () => {
    expect(filterGroups(groups, " ")).toBe(groups);
  });

  it("narrows entries and drops empty groups", () => {
    const result = filterGroups(groups, "login");
    expect(result.map((g) => [g.group, g.entries.length])).toEqual([["todo", 1]]);
  });
});

describe("titleSpans", () => {
  it("marks every occurrence of every word, case-insensitively", () => {
    expect(titleSpans("Fix login, then login again", "LOGIN fix")).toEqual([
      { text: "Fix", hit: true },
      { text: " ", hit: false },
      { text: "login", hit: true },
      { text: ", then ", hit: false },
      { text: "login", hit: true },
      { text: " again", hit: false },
    ]);
  });

  it("returns the plain title without a match, for a blank query and for number words", () => {
    expect(titleSpans("Fix login", "zzz")).toEqual([{ text: "Fix login", hit: false }]);
    expect(titleSpans("Fix login", "  ")).toEqual([{ text: "Fix login", hit: false }]);
    expect(titleSpans("Issue #7", "#7")).toEqual([{ text: "Issue #7", hit: false }]);
  });

  it("merges overlapping words into one mark", () => {
    expect(titleSpans("redirect", "redi direct")).toEqual([{ text: "redirect", hit: true }]);
  });
});

describe("numberSpans", () => {
  it("marks the matched start of the number", () => {
    expect(numberSpans(120, "#12")).toEqual([{ text: "12", hit: true }, { text: "0", hit: false }]);
    expect(numberSpans(42, "42")).toEqual([{ text: "42", hit: true }]);
  });

  it("marks nothing for words that are not the start of the number", () => {
    expect(numberSpans(42, "2 login")).toEqual([{ text: "42", hit: false }]);
  });
});
