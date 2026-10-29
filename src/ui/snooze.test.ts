import { describe, expect, it } from "vitest";
import { clockOf, clockText, followUpOn, reminderText, untilShort } from "./snooze";
import { setLang } from "./i18n";

describe("followUpOn", () => {
  it("comes back on the day at 09:00, or at the time the setting names", () => {
    expect(followUpOn("2026-10-24")).toBe(new Date(2026, 9, 24, 9).toISOString());
    expect(followUpOn("2026-10-24", "17:30")).toBe(new Date(2026, 9, 24, 17, 30).toISOString());
  });
});

describe("clockOf and clockText", () => {
  it("read and write a 24-hour time, and fall back to 09:00 for one that does not parse", () => {
    expect(clockOf("7:05")).toEqual({ hours: 7, minutes: 5 });
    expect(clockText(clockOf("7:05"))).toBe("07:05");
    expect(clockOf("25:00")).toEqual({ hours: 9, minutes: 0 });
    expect(clockOf("")).toEqual({ hours: 9, minutes: 0 });
  });
});

describe("reminderText", () => {
  it("names weekday, date and a 24-hour time in the device's time zone", () => {
    setLang("en");
    const at = new Date(2026, 9, 26, 21, 5);
    expect(reminderText(at.toISOString())).toContain("21:05");
  });
});

describe("untilShort", () => {
  const now = new Date(2026, 9, 24, 12);

  it("shows the time today, the weekday this coming week, else day and month", () => {
    setLang("en");
    expect(untilShort(new Date(2026, 9, 24, 18).toISOString(), now)).toBe("18:00");
    expect(untilShort(new Date(2026, 9, 26, 9).toISOString(), now)).toBe("Mon");
    expect(untilShort(new Date(2026, 10, 5, 9).toISOString(), now)).toBe("Nov 5");
  });
});
