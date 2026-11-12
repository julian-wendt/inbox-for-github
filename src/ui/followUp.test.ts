import { describe, expect, it } from "vitest";
import { classify } from "../classify";
import type { Item, StoredStatus } from "../model";
import { ruleSwitches } from "../rules";
import { followUpExtra, followUpOf, followUpUnchanged, followUpWhen, isWaiting, rowWhen } from "./followUp";

const item: Item = {
  id: "I_1", kind: "issue", repo: "o/r", number: 1, title: "t", url: "u", author: "me", body: "", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
  labels: [], reviewRequests: [], draft: false, reviews: [], threads: [], avatars: {}, pull: null, closed: null, linkedPrs: [], issueType: null, activities: [], boards: [], assignees: [], comments: [], reasons: ["involved"],
};
const now = Date.parse("2026-10-20T00:00:00Z");
const ahead = "2026-10-27T09:00:00Z";
const waiting = (until?: string): StoredStatus => ({ status: "snoozed", changedAt: "2026-10-05T00:00:00Z", ...(until && { until }) });

describe("isWaiting", () => {
  const of = (it: Partial<Item>, stored?: StoredStatus) => isWaiting(classify({ ...item, ...it }, "me", stored, ruleSwitches(), "mention", now));

  it("takes every follow-up that waits, whichever list it comes from", () => {
    expect(of({ author: "alice", reasons: ["mentioned"] }, waiting(ahead))).toBe(true);
    expect(of({ author: "alice", reasons: ["assigned"] }, waiting())).toBe(true);
    expect(of({}, waiting(ahead))).toBe(true);
  });

  it("leaves out one whose date passed, a closed item and an item without a follow-up", () => {
    expect(of({}, waiting("2026-10-10T09:00:00Z"))).toBe(false);
    expect(of({ closed: { state: "closed", at: "2026-10-12T00:00:00Z" } }, waiting(ahead))).toBe(false);
    expect(of({})).toBe(false);
  });
});

describe("followUpOf", () => {
  it("is the date of an item that waits for one", () => {
    expect(followUpOf(classify(item, "me", waiting(ahead), ruleSwitches(), "mention", now))).toEqual({ at: ahead });
  });

  it("is nothing for a follow-up without a date, for an open item and for one that came back", () => {
    expect(followUpOf(classify(item, "me", waiting(), ruleSwitches(), "mention", now))).toBeNull();
    expect(followUpOf(classify(item, "me", undefined, ruleSwitches(), "mention", now))).toBeNull();
    expect(followUpOf(classify(item, "me", { status: "open", changedAt: "2026-10-10T08:00:00Z" }, ruleSwitches(), "mention", now))).toBeNull();
  });

  it("holds an own item in its table while it waits, like an assignment", () => {
    const entry = classify(item, "me", waiting(ahead), ruleSwitches(), "mention", now);

    expect(entry).toMatchObject({ bucket: "authored", status: "snoozed", until: ahead, asks: [] });
  });
});

describe("followUpWhen", () => {
  it("names when a follow-up comes back, and nothing without a date", () => {
    const at = new Date(2026, 9, 20, 9);
    const until = new Date(2026, 9, 20, 15).toISOString();
    expect(followUpWhen({ status: "snoozed", until }, at)?.text).toMatch(/15:00/);
    expect(followUpWhen({ status: "snoozed" }, at)).toBeUndefined();
    expect(followUpWhen({ status: "open", until }, at)).toBeUndefined();
  });
});

describe("rowWhen", () => {
  const at = new Date(2026, 9, 20, 9);
  const until = new Date(2026, 9, 20, 15).toISOString();
  const plan = { kind: "planned", day: "2026-10-22" } as const;

  it("gives a plan in Planned its icon, the same with an event, which has its own mark", () => {
    expect(rowWhen({ status: "open" }, plan, true, at)?.icon).toBe("plan");
    expect(rowWhen({ status: "open" }, { ...plan, event: {} }, true, at)?.icon).toBe("plan");
  });

  it("leaves a pin for today without an icon, with an event too", () => {
    expect(rowWhen({ status: "open" }, { kind: "today", day: "2026-10-20" }, true, at)).toMatchObject({ text: "Today", icon: undefined });
    expect(rowWhen({ status: "open" }, { kind: "today", day: "2026-10-20", event: {} }, true, at)?.icon).toBeUndefined();
  });

  it("marks a follow-up's time, and leaves a plain age to the row", () => {
    const followUp = rowWhen({ status: "snoozed", until }, plan, false, at);
    expect(followUp?.text).toMatch(/15:00/);
    expect(followUp?.icon).toBe("followUp");
    expect(rowWhen({ status: "open" }, plan, false, at)).toBeUndefined();
  });
});

describe("followUpExtra", () => {
  const boarded: Item = { ...item, boards: [{ id: "PVT_1", title: "Roadmap", status: "In review", sprint: null, fields: [] }] };

  it("stores the date, or none", () => {
    expect(followUpExtra({ item }, ahead)).toEqual({ until: ahead });
    expect(followUpExtra({ item }, "")).toEqual({});
  });

  it("keeps a part that is done, with a fresh snapshot", () => {
    expect(followUpExtra({ item: boarded, updates: [] }, "")).toEqual({ handoff: { boards: { PVT_1: "In review" }, prs: [] } });
  });

  it("stores Remind me only with a date", () => {
    expect(followUpExtra({ item }, ahead, true)).toEqual({ until: ahead, notify: true });
    expect(followUpExtra({ item }, "", true)).toEqual({});
  });
});

describe("followUpUnchanged", () => {
  const entry = (stored?: StoredStatus, comments: Item["comments"] = []) => classify({ ...item, author: "alice", reasons: ["assigned"], assignees: ["me"], comments }, "me", stored, ruleSwitches(), "mention", now);

  it("is true for the follow-up the item already has, with or without a date", () => {
    expect(followUpUnchanged(entry(waiting()), "")).toBe(true);
    expect(followUpUnchanged(entry(waiting(ahead)), ahead)).toBe(true);
  });

  it("is false for another date, an item that does not wait, and one with an ask F would handle", () => {
    expect(followUpUnchanged(entry(waiting(ahead)), "")).toBe(false);
    expect(followUpUnchanged(entry(waiting()), ahead)).toBe(false);
    expect(followUpUnchanged(entry(), "")).toBe(false);
    expect(followUpUnchanged(entry(waiting(), [{ author: "bob", body: "@me ping", createdAt: "2026-10-10T00:00:00Z" }]), "")).toBe(false);
  });

  it("counts Remind me as part of the follow-up, but not without a date", () => {
    expect(followUpUnchanged(entry({ ...waiting(ahead), notify: true }), ahead, true)).toBe(true);
    expect(followUpUnchanged(entry(waiting(ahead)), ahead, true)).toBe(false);
    expect(followUpUnchanged(entry({ ...waiting(ahead), notify: true }), ahead)).toBe(false);
    expect(followUpUnchanged(entry(waiting()), "", true)).toBe(true);
  });
});
