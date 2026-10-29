import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../calendar";
import { DEFAULT_SETTINGS, type Settings } from "../store";
import { followCalendar } from "./useCalendarSync";

const TODAY = "2026-10-29";
const settings = (overrides: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  planned: [{ id: "I_1", day: "2026-10-30" }],
  plannedAt: { I_1: "2026-10-28T09:00:00Z" },
  calendarEvents: { I_1: "E1" },
  ...overrides,
});
const event = (day: number): CalendarEvent => ({ id: "E1", calendarId: "C1", title: "Fix the login", start: new Date(2026, 9, day, 9).getTime(), end: new Date(2026, 9, day, 10).getTime(), allDay: false, busy: true });

describe("followCalendar", () => {
  it("removes the plan and the link of an item whose event was deleted", () => {
    const followed = followCalendar(settings(), new Set(["E1"]), new Map(), TODAY);
    expect([followed.settings.planned, followed.settings.plannedAt, followed.settings.calendarEvents, followed.gone]).toEqual([[], {}, {}, ["I_1"]]);
  });

  it("replans an item whose event moved to another day", () => {
    const followed = followCalendar(settings(), new Set(["E1"]), new Map([["E1", event(31)]]), TODAY);
    expect([followed.settings.planned, followed.moved]).toEqual([[{ id: "I_1", day: "2026-10-31" }], [{ id: "I_1", day: "2026-10-31" }]]);
  });

  it("leaves the settings as they are when the event is on the plan's day", () => {
    const before = settings();
    expect(followCalendar(before, new Set(["E1"]), new Map([["E1", event(30)]]), TODAY).settings).toBe(before);
  });

  it("leaves links alone that were not asked for, or whose item has no plan", () => {
    expect(followCalendar(settings(), new Set(), new Map(), TODAY).gone).toEqual([]);
    expect(followCalendar(settings({ planned: [] }), new Set(["E1"]), new Map(), TODAY).gone).toEqual([]);
  });
});
