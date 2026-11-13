import { describe, expect, it } from "vitest";
import type { Activity } from "../model";
import type { Item, LogEvent, StatusChange } from "../model";
import { backEvent, eventText, historyText, localLines, shownActivities } from "./activities";

const at = (hour: number) => `2026-10-01T${String(hour).padStart(2, "0")}:00:00Z`;

describe("historyText", () => {
  it("names a follow-up that came due, and any other automatic reopening", () => {
    expect(historyText({ status: "open", at: at(1), automatic: true, source: "auto:snooze-ended" })).toBe("history.due");
    expect(historyText({ status: "open", at: at(1), automatic: true, source: "auto:reassigned" })).toBe("history.reassigned");
    expect(historyText({ status: "done", at: at(1), automatic: true, source: "auto:legacy-done" })).toBe("history.legacyDone");
    expect(historyText({ status: "open", at: at(1), automatic: true, source: "auto:reopen" })).toBe("history.reopened");
    expect(historyText({ status: "open", at: at(1), automatic: true })).toBe("history.reopened");
    expect(historyText({ status: "snoozed", at: at(1), automatic: false })).toBe("history.snoozed");
  });

  it("names the ask that brought an item back, at its time", () => {
    expect(backEvent({ back: { ask: "due", at: at(2) } })).toEqual({ kind: "back", at: at(2), value: "due" });
    expect(eventText(backEvent({ back: { ask: "reopened", at: at(2) } })!)).toBe("history.back.reopened");
    expect(backEvent({})).toBeNull();
  });

  it("names a follow-up by its date and Remind me, and what X and O did, apart from older rows without a date", () => {
    expect(historyText({ status: "snoozed", at: at(1), automatic: false, until: at(3) })).toBe("history.followUpAt");
    expect(historyText({ status: "snoozed", at: at(1), automatic: false, until: at(3), notify: true })).toBe("history.followUpRemind");
    expect(historyText({ status: "snoozed", at: at(1), automatic: false, until: "" })).toBe("history.followUpNone");
    expect(historyText({ status: "open", at: at(1), automatic: true, logAs: "follow-up-ended" })).toBe("history.followUpEnded");
    expect(historyText({ status: "snoozed", at: at(1), automatic: false, logAs: "resumed" })).toBe("history.resumed");
  });

  it("names plans, filing and returns of the item log", () => {
    expect(eventText({ kind: "plan", at: at(1), value: "2026-11-18" })).toBe("history.plan");
    expect(eventText({ kind: "plan-removed", at: at(1) })).toBe("history.planRemoved");
    expect(eventText({ kind: "plan-kept", at: at(1), value: "2026-11-18" })).toBe("history.planKept");
    expect(eventText({ kind: "filed", at: at(1) })).toBe("history.filed");
  });
});

describe("shownActivities", () => {
  it("keeps only what concerns me and drops bot reviews", () => {
    const activities: Activity[] = [
      { kind: "assigned", at: at(1), actor: "alice", assignee: "bob" },
      { kind: "assigned", at: at(2), actor: "alice", assignee: "Me" },
      { kind: "review-requested", at: at(3), actor: "alice", reviewer: "carol" },
      { kind: "review-requested", at: at(4), actor: "alice", reviewer: "team:security" },
      { kind: "reviewed", at: at(5), actor: "copilot[bot]", state: "COMMENTED" },
      { kind: "reviewed", at: at(6), actor: "dave", state: "APPROVED" },
      { kind: "assigned", at: at(7), actor: "Me", assignee: "dave" },
      { kind: "unassigned", at: at(8), actor: "Me", assignee: "dave" },
    ];
    expect(shownActivities({ activities, author: "alice" }, "me", []).map((s) => s.activity.at)).toEqual([at(2), at(4), at(6), at(7), at(8)]);
  });

  it("groups force pushes by one person, and keeps only withdrawn review requests that concern me", () => {
    const activities: Activity[] = [
      { kind: "force-pushed", at: at(1), actor: "lukas" },
      { kind: "force-pushed", at: at(2), actor: "lukas" },
      { kind: "force-pushed", at: at(3), actor: "max" },
      { kind: "review-request-removed", at: at(4), actor: "alice", reviewer: "carol" },
      { kind: "review-request-removed", at: at(5), actor: "alice", reviewer: "me" },
    ];
    expect(shownActivities({ activities, author: "alice" }, "me", []).map((s) => [s.activity.at, s.count])).toEqual([
      [at(2), 2],
      [at(3), 1],
      [at(5), 1],
    ]);
  });

  it("groups consecutive commits unless a post or event comes between", () => {
    const activities: Activity[] = [
      { kind: "commit", at: at(1) },
      { kind: "commit", at: at(2) },
      { kind: "commit", at: at(4) },
      { kind: "reviewed", at: at(5), actor: "dave", state: "APPROVED" },
      { kind: "commit", at: at(6) },
    ];
    const shown = shownActivities({ activities, author: "alice" }, "me", [at(3)]);
    expect(shown.map((s) => [s.activity.at, s.count])).toEqual([
      [at(2), 2],
      [at(4), 1],
      [at(5), 1],
      [at(6), 1],
    ]);
  });
});

describe("historyText", () => {
  it("names the viewer's key presses by status and the app's reopening apart", () => {
    expect(historyText({ status: "snoozed", at: "2026-10-22T10:00:00Z", automatic: false })).toBe("history.snoozed");
    expect(historyText({ status: "open", at: "2026-10-22T10:00:00Z", automatic: false })).toBe("history.open");
    expect(historyText({ status: "open", at: "2026-10-22T10:00:00Z", automatic: true })).toBe("history.reopened");
  });
});

describe("commit authors", () => {
  it("keeps the distinct authors of a run, last author last, and none for unknown ones", () => {
    const activities: Activity[] = [
      { kind: "commit", at: at(1), author: "alice" },
      { kind: "commit", at: at(2), author: "bob" },
      { kind: "commit", at: at(3), author: "Alice" },
      { kind: "commit", at: at(4) },
    ];
    expect(shownActivities({ activities, author: "alice" }, "me", [])).toEqual([{ activity: activities[3], count: 4, authors: ["bob", "Alice"] }]);
    expect(shownActivities({ activities: [{ kind: "commit", at: at(1) }], author: "alice" }, "me", [])[0].authors).toEqual([]);
  });
});

describe("localLines", () => {
  const item = { comments: [{ author: "bob", body: "hm", createdAt: "2026-10-22T12:00:00Z" }], body: "", author: "alice", createdAt: "2026-10-01T00:00:00Z", activities: [], reviews: [] } as unknown as Item;
  const change = (status: "done" | "snoozed" | "open", at: string, more: Partial<StatusChange> = {}): StatusChange => ({ status, at, automatic: false, ...more });
  const shown = (history: StatusChange[], events: LogEvent[] = []) => localLines(history, events, item).map((l) => ("change" in l ? `${l.change.status}${l.change.logAs ? `:${l.change.logAs}` : ""}` : l.event.kind));

  it("drops a change replaced before anything else happened", () => {
    expect(shown([change("done", "2026-10-22T10:00:00Z"), change("snoozed", "2026-10-22T10:05:00Z", { until: "" })])).toEqual(["snoozed"]);
  });

  it("keeps a change when something happened before the next one", () => {
    expect(shown([change("done", "2026-10-22T10:00:00Z"), change("snoozed", "2026-10-22T13:00:00Z")])).toEqual(["done", "snoozed"]);
  });

  it("shows nothing of a follow-up or plan set and taken off again, but the removal of one from before", () => {
    const ended = change("open", "2026-10-22T10:05:00Z", { automatic: true, logAs: "follow-up-ended" });
    expect(shown([change("snoozed", "2026-10-22T10:00:00Z", { until: "" }), ended])).toEqual([]);
    expect(shown([], [{ kind: "plan", at: "2026-10-22T10:00:00Z", value: "2026-10-23" }, { kind: "plan-removed", at: "2026-10-22T10:01:00Z" }])).toEqual([]);
    expect(shown([change("snoozed", "2026-10-22T09:00:00Z", { until: "" }), { ...ended, at: "2026-10-22T13:00:00Z" }])).toEqual(["snoozed", "open:follow-up-ended"]);
  });

  it("leaves out what another line tells, and always shows a return, which also ends a run", () => {
    const history = [change("snoozed", "2026-10-22T09:00:00Z", { until: "2026-10-22T09:30:00Z" }), change("open", "2026-10-22T13:00:00Z", { automatic: true, logAs: "hidden" })];
    const events: LogEvent[] = [{ kind: "back", at: "2026-10-22T09:30:00Z", value: "due" }, { kind: "plan", at: "2026-10-22T13:00:00Z", value: "2026-10-23" }];
    expect(shown(history, events)).toEqual(["snoozed", "back", "plan"]);
  });
});

describe("shownActivities on an own item", () => {
  it("shows who else took it on or left it", () => {
    const activities = [{ kind: "assigned" as const, at: "2026-10-05T00:00:00Z", actor: "bob", assignee: "bob" }];
    expect(shownActivities({ activities, author: "me" }, "me", [])).toHaveLength(1);
    expect(shownActivities({ activities, author: "alice" }, "me", [])).toHaveLength(0);
  });
});
