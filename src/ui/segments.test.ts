import { describe, expect, it } from "vitest";
import { daysInMonth, daysOf, HOURS, MINUTES, MONTHS, padSegment, stepSegment, typeSegment, yearsFrom } from "./segments";

describe("stepSegment", () => {
  it("steps within the range", () => {
    expect(stepSegment(9, HOURS, 1)).toBe(10);
    expect(stepSegment(30, MINUTES, -1)).toBe(29);
  });

  it("wraps clock and calendar parts past the ends", () => {
    expect(stepSegment(23, HOURS, 1)).toBe(0);
    expect(stepSegment(0, HOURS, -1)).toBe(23);
    expect(stepSegment(5, MINUTES, -10)).toBe(55);
    expect(stepSegment(12, MONTHS, 1)).toBe(1);
    expect(stepSegment(1, daysOf(2026, 2), -1)).toBe(28);
  });

  it("stops years at their ends", () => {
    expect(stepSegment(2026, yearsFrom(2026), -1)).toBe(2026);
    expect(stepSegment(2035, yearsFrom(2026), 1)).toBe(2035);
  });
});

describe("typeSegment", () => {
  it("takes as many digits as the part has", () => {
    expect(typeSegment("", "1", HOURS)).toEqual({ value: 1, typed: "1", done: false });
    expect(typeSegment("1", "4", HOURS)).toEqual({ value: 14, typed: "14", done: true });
    expect(typeSegment("202", "7", yearsFrom(2026))).toEqual({ value: 2027, typed: "2027", done: true });
  });

  it("completes at once when no further digit fits", () => {
    expect(typeSegment("", "3", HOURS)).toEqual({ value: 3, typed: "3", done: true });
    expect(typeSegment("", "7", MINUTES)).toEqual({ value: 7, typed: "7", done: true });
    expect(typeSegment("", "4", daysOf(2026, 10))).toEqual({ value: 4, typed: "4", done: true });
  });

  it("starts over when a digit would overflow", () => {
    expect(typeSegment("2", "5", HOURS)).toEqual({ value: 5, typed: "5", done: true });
    expect(typeSegment("1", "3", MONTHS)).toEqual({ value: 3, typed: "3", done: true });
  });

  it("allows a leading zero while typing", () => {
    expect(typeSegment("", "0", MONTHS)).toEqual({ value: 0, typed: "0", done: false });
    expect(typeSegment("0", "5", MONTHS)).toEqual({ value: 5, typed: "05", done: true });
  });

  it("starts over after a complete part", () => {
    expect(typeSegment("14", "0", HOURS)).toEqual({ value: 0, typed: "0", done: false });
  });
});

describe("daysInMonth", () => {
  it("knows month lengths and leap years", () => {
    expect(daysInMonth(2026, 10)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
  });
});

describe("padSegment", () => {
  it("pads to the part's length", () => {
    expect(padSegment(7, HOURS)).toBe("07");
    expect(padSegment(2027, yearsFrom(2026))).toBe("2027");
  });
});
