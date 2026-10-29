import { describe, expect, it } from "vitest";
import type { Item } from "./model";
import { DEFAULT_SETTINGS } from "./store";
import { movedKeys, movedLists, movedSettings } from "./transfer";

const moves = new Map([["I_old", "I_new"]]);

describe("movedKeys", () => {
  it("moves the old id's entry to the new id and leaves the others", () => {
    expect(movedKeys(new Map([["I_old", "done"], ["I_x", "open"]]), moves)).toEqual(new Map([["I_x", "open"], ["I_new", "done"]]));
  });

  it("keeps what the new id already has", () => {
    expect(movedKeys(new Map([["I_old", "old note"], ["I_new", "new note"]]), moves)).toEqual(new Map([["I_new", "new note"]]));
  });
});

describe("movedLists", () => {
  it("puts the old id's entries before the new id's", () => {
    expect(movedLists(new Map([["I_old", ["a"]], ["I_new", ["b"]]]), moves)).toEqual(new Map([["I_new", ["a", "b"]]]));
  });
});

describe("movedSettings", () => {
  const item = { id: "I_new", repo: "octo-org/portal", number: 7, title: "Broken link", url: "https://github.com/octo-org/portal/issues/7" } as Item;

  it("carries Today, Plan and waiting notifications over to the new id", () => {
    const settings = { ...DEFAULT_SETTINGS, focus: ["I_old", "I_x"], pinnedOn: { I_old: "2026-10-29" }, planned: [{ id: "I_old", day: "2026-10-30" }], plannedAt: { I_old: "2026-10-28T09:00:00Z" }, notifyCollected: ["I_old"] };

    const moved = movedSettings(settings, moves, [item]);

    expect(moved).toMatchObject({ focus: ["I_new", "I_x"], pinnedOn: { I_new: "2026-10-29" }, planned: [{ id: "I_new", day: "2026-10-30" }], plannedAt: { I_new: "2026-10-28T09:00:00Z" }, notifyCollected: ["I_new"] });
  });

  it("keeps the link to the calendar event, so the event is not taken for left over", () => {
    const settings = { ...DEFAULT_SETTINGS, planned: [{ id: "I_old", day: "2026-10-30" }], calendarEvents: { I_old: "E1" } };

    expect(movedSettings(settings, moves, [item]).calendarEvents).toEqual({ I_new: "E1" });
  });

  it("keeps an untracked issue untracked and lists it under its new repository", () => {
    const settings = { ...DEFAULT_SETTINGS, untracked: [{ id: "I_old", repo: "octo-org/docs", number: 42, title: "Broken link", url: "https://github.com/octo-org/docs/issues/42", at: "2026-10-20T10:00:00Z" }] };

    expect(movedSettings(settings, moves, [item]).untracked).toEqual([{ id: "I_new", repo: "octo-org/portal", number: 7, title: "Broken link", url: "https://github.com/octo-org/portal/issues/7", at: "2026-10-20T10:00:00Z" }]);
  });

  it("names each item once when the new id was already pinned", () => {
    const settings = { ...DEFAULT_SETTINGS, focus: ["I_old", "I_new"], planned: [{ id: "I_new", day: "2026-10-30" }, { id: "I_old", day: "2026-11-02" }] };

    const moved = movedSettings(settings, moves, [item]);

    expect(moved.focus).toEqual(["I_new"]);
    expect(moved.planned).toEqual([{ id: "I_new", day: "2026-10-30" }]);
  });

  it("returns the same settings when no move touches them", () => {
    const settings = { ...DEFAULT_SETTINGS, focus: ["I_x"] };
    expect(movedSettings(settings, moves, [item])).toBe(settings);
  });
});
