import { describe, expect, it } from "vitest";
import type { Activity } from "../model";
import type { Item } from "../model";
import { historyText, shownActivities, shownHistory } from "./activities";

const at = (hour: number) => `2026-10-01T${String(hour).padStart(2, "0")}:00:00Z`;

describe("historyText", () => {
  it("names a follow-up that came due, and any other automatic reopening", () => {
    expect(historyText({ status: "open", at: at(1), automatic: true, source: "auto:snooze-ended" })).toBe("history.due");
    expect(historyText({ status: "open", at: at(1), automatic: true, source: "auto:reopen" })).toBe("history.reopened");
    expect(historyText({ status: "open", at: at(1), automatic: true })).toBe("history.reopened");
    expect(historyText({ status: "snoozed", at: at(1), automatic: false })).toBe("history.snoozed");
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
    ];
    expect(shownActivities({ activities }, "me", []).map((s) => s.activity.at)).toEqual([at(2), at(4), at(6)]);
  });

  it("groups force pushes by one person, and keeps only withdrawn review requests that concern me", () => {
    const activities: Activity[] = [
      { kind: "force-pushed", at: at(1), actor: "lukas" },
      { kind: "force-pushed", at: at(2), actor: "lukas" },
      { kind: "force-pushed", at: at(3), actor: "max" },
      { kind: "review-request-removed", at: at(4), actor: "alice", reviewer: "carol" },
      { kind: "review-request-removed", at: at(5), actor: "alice", reviewer: "me" },
    ];
    expect(shownActivities({ activities }, "me", []).map((s) => [s.activity.at, s.count])).toEqual([
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
    const shown = shownActivities({ activities }, "me", [at(3)]);
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
    expect(shownActivities({ activities }, "me", [])).toEqual([{ activity: activities[3], count: 4, authors: ["bob", "Alice"] }]);
    expect(shownActivities({ activities: [{ kind: "commit", at: at(1) }] }, "me", [])[0].authors).toEqual([]);
  });
});

describe("shownHistory", () => {
  const item = { comments: [{ author: "bob", body: "hm", createdAt: "2026-10-22T12:00:00Z" }], body: "", author: "alice", createdAt: "2026-10-01T00:00:00Z", activities: [], reviews: [] } as unknown as Item;
  const change = (status: "done" | "snoozed", at: string) => ({ status, at, automatic: false });

  it("drops a change replaced before anything else happened", () => {
    expect(shownHistory([change("done", "2026-10-22T10:00:00Z"), change("snoozed", "2026-10-22T10:05:00Z")], item)).toEqual([change("snoozed", "2026-10-22T10:05:00Z")]);
  });

  it("keeps a change when something happened before the next one", () => {
    const history = [change("done", "2026-10-22T10:00:00Z"), change("snoozed", "2026-10-22T13:00:00Z")];
    expect(shownHistory(history, item)).toEqual(history);
  });
});
