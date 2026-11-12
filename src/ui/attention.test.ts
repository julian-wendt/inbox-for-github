import { describe, expect, it } from "vitest";
import type { Classified } from "../classify";
import type { Item } from "../model";
import { arrivals, askKey, dueReminders, laterChoices, notificationTitle, notifies, notifyReason } from "./attention";
import { setLang } from "./i18n";

setLang("en");

function entry(id: string, overrides: Partial<Classified> = {}): Classified {
  return { item: { id } as Item, bucket: "inbox", status: "open", mention: null, answered: null, asks: ["review"], statusAt: null, asked: {}, ...overrides };
}

describe("arrivals", () => {
  it("takes the first result as the baseline and notifies about nothing in it, a follow-up that came back included", () => {
    expect(arrivals([entry("I_1"), entry("I_2", { asks: ["reopened"] })], null)).toEqual([]);
  });

  it("notifies afterwards for every item new in the inbox, and nothing outside it", () => {
    const watched = entry("I_3", { bucket: "involved", asks: [] });
    expect(arrivals([entry("I_1"), entry("I_2"), watched], new Map([["I_1", askKey(entry("I_1"))]])).map((c) => c.item.id)).toEqual(["I_2"]);
  });

  it("lets an item that only asks again come back without a notification", () => {
    const back = entry("I_2", { asks: ["reopened"] });
    const asked = entry("I_3", { asks: ["reopened", "mention"] });
    const due = entry("I_4", { asks: ["due"] });
    expect(arrivals([back, asked, due], new Map()).map((c) => c.item.id)).toEqual(["I_3"]);
  });
  it("notifies again when an item already in the inbox gets a new ask", () => {
    const before = entry("I_1", { asks: ["mention"], mention: { by: "bob", at: "2026-10-05T00:00:00Z", excerpt: "", self: false } });
    const after = entry("I_1", { asks: ["mention"], mention: { by: "bob", at: "2026-10-06T00:00:00Z", excerpt: "", self: false } });
    expect(arrivals([after], new Map([["I_1", askKey(before)]])).map((c) => c.item.id)).toEqual(["I_1"]);
    expect(arrivals([before], new Map([["I_1", askKey(before)]]))).toEqual([]);
  });
});

describe("notificationTitle", () => {
  const at = "2026-10-05T00:00:00Z";

  it("names who mentioned the viewer, their own self-mention, or a review request", () => {
    expect(notificationTitle({ asks: ["mention"], mention: { by: "bob", at, excerpt: "", self: false } })).toBe("bob mentioned you");
    expect(notificationTitle({ asks: ["mention"], mention: { by: "me", at, excerpt: "", self: true } })).toBe("Self-mention");
    expect(notificationTitle({ asks: ["review"], mention: null })).toBe("Review requested");
  });

  it("names who gave feedback, answered in a thread or closed an own item, under its own reason", () => {
    expect(notificationTitle({ asks: ["feedback"], mention: null, feedback: { by: "bob", at, kind: "approved" } })).toBe("bob approved");
    expect(notificationTitle({ asks: ["reply"], mention: null, repliedBy: "alice" })).toBe("alice answered in your review thread");
    expect(notificationTitle({ asks: ["closed"], mention: null, closedBy: "bob" })).toBe("bob closed your item");
    expect(notifyReason({ asks: ["feedback"], mention: null })).toBe("feedback");
    expect(notifyReason({ asks: ["review", "feedback"], mention: null })).toBe("review");
  });
});

describe("notifyReason", () => {
  const at = "2026-10-05T00:00:00Z";

  it("files the viewer's own notes before mentions and reviews", () => {
    expect(notifyReason({ asks: ["mention"], mention: { by: "me", at, excerpt: "", self: true } })).toBe("reminder");
    expect(notifyReason({ asks: ["update"], mention: null })).toBe("update");
    expect(notifyReason({ asks: ["review"], mention: null })).toBe("review");
    expect(notifyReason({ asks: ["mention"], mention: { by: "bob", at, excerpt: "", self: false } })).toBe("mention");
  });

  it("lets every reason notify unless switched off", () => {
    expect(notifies("review", {})).toBe(true);
    expect(notifies("review", { review: false })).toBe(false);
  });
});

describe("dueReminders", () => {
  const due = (id: string, at: string, notify = true) => entry(id, { asks: ["due"], asked: { due: at }, ...(notify && { notify: true as const }) });
  const items = [due("I_1", "2026-11-12T08:00:00Z"), due("I_2", "2026-11-13T08:00:00Z"), due("I_3", "2026-11-13T08:00:00Z", false), entry("I_4", { notify: true })];

  it("rings at start only what came due since the last fetch, and nothing without a cache", () => {
    expect(dueReminders(items, null, "2026-11-12T17:00:00Z").map((c) => c.item.id)).toEqual(["I_2"]);
    expect(dueReminders(items, null, null)).toEqual([]);
  });

  it("rings afterwards what newly rings, once, and never a plain due follow-up or one still waiting", () => {
    expect(dueReminders(items, new Set(["I_1"]), null).map((c) => c.item.id)).toEqual(["I_2"]);
    expect(dueReminders(items, new Set(["I_1", "I_2"]), null)).toEqual([]);
  });
});

describe("laterChoices", () => {
  const ids = (now: Date) => laterChoices(now, [1, 2, 3, 4, 5], "09:00").map((l) => [l.id, l.title, new Date(l.until).toString().slice(0, 21)]);

  it("offers an hour, this afternoon before 14:00, and the next workday at the follow-up time", () => {
    expect(ids(new Date(2026, 10, 13, 9, 30))).toEqual([
      ["later-hour", "In 1 hour", "Fri Nov 13 2026 10:30"],
      ["later-afternoon", "This afternoon", "Fri Nov 13 2026 14:00"],
      ["later-workday", "Next workday", "Mon Nov 16 2026 09:00"],
    ]);
  });

  it("drops this afternoon from 14:00 on", () => {
    expect(ids(new Date(2026, 10, 12, 14, 0)).map(([id]) => id)).toEqual(["later-hour", "later-workday"]);
  });
});
