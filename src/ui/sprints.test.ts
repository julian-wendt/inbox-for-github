import { describe, expect, it } from "vitest";
import type { Board } from "../model";
import { matchesSprint, sprintChoices, sprintsOf } from "./sprints";

const on = (...sprints: (string | null)[]) => ({ boards: sprints.map((sprint, i): Board => ({ id: `b${i}`, title: "b", status: null, sprint, fields: [] })) });

describe("sprints", () => {
  it("collects an item's sprints from the boards that are switched on", () => {
    expect(sprintsOf(on("Sprint 3", null, "Sprint 3"))).toEqual(["Sprint 3"]);
    expect(sprintsOf(on("Sprint 3"), ["b0"])).toEqual([]);
  });

  it("offers the earliest sprints first, by the numbers in their names", () => {
    expect(sprintChoices([on("Sprint 9"), on("Sprint 12"), on(null), on("Sprint 10")])).toEqual(["Sprint 9", "Sprint 10", "Sprint 12"]);
    expect(sprintChoices([on("2026-12"), on("2026-11"), on("2027-01")])).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("filters by one sprint or by no sprint, and lets everything through for a sprint that is gone", () => {
    const choices = ["Sprint 12"];
    expect(matchesSprint(on("Sprint 12"), "sprint:Sprint 12", choices)).toBe(true);
    expect(matchesSprint(on("Sprint 11"), "sprint:Sprint 12", choices)).toBe(false);
    expect(matchesSprint(on(null), "none", choices)).toBe(true);
    expect(matchesSprint(on("Sprint 12"), "none", choices)).toBe(false);
    expect(matchesSprint(on("Sprint 11"), "sprint:Sprint 8", choices)).toBe(true);
  });
});
