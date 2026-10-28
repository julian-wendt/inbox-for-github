import { describe, expect, it } from "vitest";
import type { Classified } from "../classify";
import type { Item } from "../model";
import { DEFAULT_DELIVERY, nextRange, nextTime, notifiesLive, releasedAt, summarize, summaryDue, type Delivery } from "./delivery";
import { setLang } from "./i18n";

setLang("en");

const times: Delivery = { ...DEFAULT_DELIVERY, mode: "times" };
// Ranges 09:00–12:00 and 13:00–18:00, Monday to Friday.
const hours: Delivery = { ...DEFAULT_DELIVERY, mode: "hours" };
// 2026-10-26 is a Monday, 2026-10-24 a Saturday.
const at = (iso: string) => new Date(iso);

describe("notifiesLive", () => {
  it("notifies in mode immediately and never in mode times", () => {
    expect(notifiesLive(DEFAULT_DELIVERY, at("2026-10-24T03:00"))).toBe(true);
    expect(notifiesLive(times, at("2026-10-26T13:00"))).toBe(false);
  });

  it("notifies in hours inside a range on a selected day, not in the break or outside", () => {
    expect(notifiesLive(hours, at("2026-10-26T09:00"))).toBe(true);
    expect(notifiesLive(hours, at("2026-10-26T11:59"))).toBe(true);
    expect(notifiesLive(hours, at("2026-10-26T12:00"))).toBe(false);
    expect(notifiesLive(hours, at("2026-10-26T12:59"))).toBe(false);
    expect(notifiesLive(hours, at("2026-10-26T13:00"))).toBe(true);
    expect(notifiesLive(hours, at("2026-10-26T18:00"))).toBe(false);
    expect(notifiesLive(hours, at("2026-10-24T10:00"))).toBe(false);
  });
});

describe("releasedAt in hours", () => {
  it("is the start of the range the break ends with", () => {
    expect(releasedAt(hours, at("2026-10-26T12:30"))).toEqual(at("2026-10-26T09:00"));
    expect(releasedAt(hours, at("2026-10-26T13:00"))).toEqual(at("2026-10-26T13:00"));
  });

  it("skips a range that starts where another ends or inside it", () => {
    const joined: Delivery = { ...hours, ranges: [{ from: "09:00", to: "12:00" }, { from: "12:00", to: "18:00" }, { from: "10:00", to: "11:00" }] };
    expect(releasedAt(joined, at("2026-10-26T15:00"))).toEqual(at("2026-10-26T09:00"));
  });
});

describe("nextRange", () => {
  it("is an hour long, an hour after the latest end", () => {
    expect(nextRange(hours.ranges)).toEqual({ from: "19:00", to: "20:00" });
  });

  it("stays within the day", () => {
    expect(nextRange([{ from: "18:00", to: "21:00" }])).toEqual({ from: "22:00", to: "23:00" });
  });

  it("never repeats a range that is there: late in the day it takes the first free hour from the morning", () => {
    const late = [{ from: "09:00", to: "12:00" }, { from: "20:00", to: "23:00" }];
    expect(nextRange(late)).toEqual({ from: "06:00", to: "07:00" });
    const full = [...late, { from: "06:00", to: "07:00" }];
    expect(nextRange(full)).toEqual({ from: "07:00", to: "08:00" });
  });
});

describe("releasedAt", () => {
  it("is the latest listed time in mode times", () => {
    expect(releasedAt(times, at("2026-10-26T14:00"))).toEqual(at("2026-10-26T13:00"));
  });

  it("does not need the times in order", () => {
    expect(releasedAt({ ...times, times: ["17:00", "09:00", "13:00"] }, at("2026-10-26T14:00"))).toEqual(at("2026-10-26T13:00"));
  });

  it("reaches back over the weekend to the last working day", () => {
    expect(releasedAt(times, at("2026-10-25T11:00"))).toEqual(at("2026-10-23T17:00"));
  });

  it("reaches back to the previous day before the first time", () => {
    expect(releasedAt(times, at("2026-10-27T08:00"))).toEqual(at("2026-10-26T17:00"));
  });

  it("is null in mode immediately and without working days", () => {
    expect(releasedAt(DEFAULT_DELIVERY, at("2026-10-26T14:00"))).toBeNull();
    expect(releasedAt({ ...times, days: [] }, at("2026-10-26T14:00"))).toBeNull();
  });
});

describe("summaryDue", () => {
  it("is due once a release moment has passed since the last summary", () => {
    expect(summaryDue(times, at("2026-10-26T13:05"), at("2026-10-26T09:00"))).toBe(true);
    expect(summaryDue(times, at("2026-10-26T12:59"), at("2026-10-26T09:00"))).toBe(false);
  });

  it("is not due without a last summary, which only sets the baseline", () => {
    expect(summaryDue(times, at("2026-10-26T13:05"), null)).toBe(false);
  });

  it("is due at the first time of the next day after a night of collecting", () => {
    expect(summaryDue(times, at("2026-10-27T09:00"), at("2026-10-26T17:30"))).toBe(true);
  });
});

describe("nextTime", () => {
  it("is the hour after the latest time", () => {
    expect(nextTime(["09:00", "13:00", "17:00"])).toBe("18:00");
  });

  it("wraps past midnight and skips hours already taken", () => {
    expect(nextTime(["23:00"])).toBe("00:00");
    expect(nextTime(["22:00", "23:00", "00:00"])).toBe("01:00");
  });

  it("starts at midnight for an empty list", () => {
    expect(nextTime([])).toBe("00:00");
  });
});

describe("summarize", () => {
  const entry = (id: string, overrides: Partial<Classified> = {}): Classified => ({
    item: { id, repo: "acme/web", number: 1, title: `Title ${id}` } as Item,
    bucket: "inbox",
    status: "open",
    mention: null,
    answered: null,
    asks: ["review"],
    statusAt: null,
    statusReset: false,
    ...overrides,
  });

  it("counts per reason in the settings order and names the first two items", () => {
    const mention = { by: "bob", self: false } as Classified["mention"];
    const { body, titles } = summarize([entry("a"), entry("b", { mention }), entry("c", { mention }), entry("d", { asks: ["update"] })]);
    expect(body).toBe("4 new: Mentions 2, Review requests 1, Updates 1");
    expect(titles).toEqual(["web#1 Title a", "web#1 Title b"]);
  });
});
