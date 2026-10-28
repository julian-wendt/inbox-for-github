import { describe, expect, it } from "vitest";
import { classify } from "../classify";
import type { Item, StoredStatus } from "../model";
import { ruleSwitches } from "../rules";
import { followUpOf, followUpsFrom } from "./followUp";

const item: Item = {
  id: "I_1", kind: "issue", repo: "o/r", number: 1, title: "t", url: "u", author: "me", body: "", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
  labels: [], reviewRequests: [], draft: false, reviews: [], threads: [], avatars: {}, pull: null, closed: null, linkedPrs: [], issueType: null, activities: [], boards: [], assignees: [], comments: [], reasons: ["involved"],
};
const now = Date.parse("2026-10-20T00:00:00Z");
const ahead = "2026-10-27T09:00:00Z";
const waiting = (until?: string): StoredStatus => ({ status: "snoozed", changedAt: "2026-10-05T00:00:00Z", ...(until && { until }) });

describe("followUpOf", () => {
  it("is the date of an item that waits for one", () => {
    expect(followUpOf(classify(item, "me", waiting(ahead), ruleSwitches(), "mention", now))).toEqual({ at: ahead });
  });

  it("is nothing for a follow-up without a date, for an open item and for one that came due", () => {
    expect(followUpOf(classify(item, "me", waiting(), ruleSwitches(), "mention", now))).toBeNull();
    expect(followUpOf(classify(item, "me", undefined, ruleSwitches(), "mention", now))).toBeNull();
    const due = classify(item, "me", { status: "open", changedAt: "2026-10-10T08:00:00Z", due: true }, ruleSwitches(), "mention", now);
    expect(due.asks).toContain("due");
    expect(followUpOf(due)).toBeNull();
  });

  it("holds an own item in its table while it waits, like an assignment", () => {
    const entry = classify(item, "me", waiting(ahead), ruleSwitches(), "mention", now);

    expect(entry).toMatchObject({ bucket: "authored", status: "snoozed", until: ahead, asks: [] });
  });
});

describe("followUpsFrom", () => {
  const reminders = new Map([
    ["fresh", { at: "2026-10-26T08:00:00Z" }],
    ["opened", { at: "2026-10-26T09:00:00Z" }],
    ["waiting", { at: "2026-10-26T10:00:00Z" }],
    ["done", { at: "2026-10-26T11:00:00Z" }],
    ["due", { at: "2026-10-26T12:00:00Z" }],
  ]);
  const statuses = new Map<string, StoredStatus>([
    ["opened", { status: "open", changedAt: "2026-10-01T00:00:00Z" }],
    ["waiting", waiting(ahead)],
    ["done", { status: "done", changedAt: "2026-10-01T00:00:00Z" }],
    ["due", { status: "open", changedAt: "2026-10-01T00:00:00Z", due: true }],
  ]);

  it("turns the reminders on items without a status or with a plain open into follow-ups, at the reminder's time", () => {
    expect(followUpsFrom(reminders, statuses)).toEqual([
      { id: "fresh", until: "2026-10-26T08:00:00Z" },
      { id: "opened", until: "2026-10-26T09:00:00Z" },
    ]);
  });

  it("does nothing without reminders", () => {
    expect(followUpsFrom(new Map(), statuses)).toEqual([]);
  });
});
