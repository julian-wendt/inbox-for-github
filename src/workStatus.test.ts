import { describe, expect, it } from "vitest";
import type { Board } from "./model";
import { fallbackWorkStatus, guessWorkStatus, workStatus, workStatusOf } from "./workStatus";

describe("guessWorkStatus", () => {
  it("maps common board status names", () => {
    expect(["Backlog", "Todo", "Ready", "In Progress", "🏗 Doing", "Ready for review", "In Review", "Done"].map(guessWorkStatus)).toEqual([
      "todo",
      "todo",
      "todo",
      "progress",
      "progress",
      "review",
      "review",
      "done",
    ]);
  });

  it("puts blocked and waiting under snoozed", () => {
    expect(["Blocked", "Waiting for input", "On hold"].map(guessWorkStatus)).toEqual(["snoozed", "snoozed", "snoozed"]);
  });

  it("returns null for names it cannot place", () => {
    expect(guessWorkStatus("Icebox later maybe")).toBe("todo");
    expect(guessWorkStatus("Someday")).toBeNull();
  });
});

describe("workStatusOf", () => {
  const board = (id: string, status: string | null): Board => ({ id, title: id, status, sprint: null, fields: [] });

  it("prefers the viewer's mapping over the guess", () => {
    expect(workStatusOf({ boards: [board("a", "Someday")] }, { a: { Someday: "progress" } })).toBe("progress");
    expect(workStatusOf({ boards: [board("a", "Backlog")] }, { a: { Backlog: "progress" } })).toBe("progress");
  });

  it("takes the furthest status when boards disagree, and null without any", () => {
    expect(workStatusOf({ boards: [board("a", "Todo"), board("b", "In Review")] }, {})).toBe("review");
    expect(workStatusOf({ boards: [board("a", null)] }, {})).toBeNull();
  });
});

describe("fallbackWorkStatus", () => {
  const pr = (draft: boolean) => ({ number: 1, url: "", draft, author: "me" });

  it("reads the work status from the pull requests when no board gives one", () => {
    expect(fallbackWorkStatus({ kind: "issue", draft: false, linkedPrs: [] })).toBe("todo");
    expect(fallbackWorkStatus({ kind: "issue", draft: false, linkedPrs: [pr(true)] })).toBe("progress");
    expect(fallbackWorkStatus({ kind: "issue", draft: false, linkedPrs: [pr(true), pr(false)] })).toBe("review");
    expect(fallbackWorkStatus({ kind: "pr", draft: true, linkedPrs: [] })).toBe("progress");
    expect(fallbackWorkStatus({ kind: "pr", draft: false, linkedPrs: [] })).toBe("review");
  });

  it("lets a board win over the pull requests", () => {
    const item = { kind: "issue" as const, draft: false, linkedPrs: [pr(false)], boards: [{ id: "a", title: "a", status: "Todo", sprint: null, fields: [] }] };
    expect(workStatus(item, {})).toBe("todo");
  });
});
