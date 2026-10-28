import { describe, expect, it } from "vitest";
import { classify } from "../classify";
import type { Item, StoredStatus } from "../model";
import { ruleSwitches } from "../rules";
import { followUpOf, followUpWhen } from "./followUp";

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
