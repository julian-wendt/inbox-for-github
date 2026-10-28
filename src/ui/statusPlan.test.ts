import { describe, expect, it } from "vitest";
import { classify, type Classified } from "../classify";
import type { Item } from "../model";
import { ruleSwitches } from "../rules";
import { planStatus } from "./statusPlan";

const ME = "me";

function entry(overrides: Partial<Item>, asks?: Classified["asks"]): Classified {
  const item: Item = {
    id: "I_1", kind: "issue", repo: "o/r", number: 1, title: "t", url: "u", author: "alice", body: "", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    labels: [], reviewRequests: [], draft: false, reviews: [], threads: [], avatars: {}, pull: null, closed: null, linkedPrs: [], issueType: null, activities: [], boards: [], assignees: [ME], comments: [], reasons: ["assigned"],
    ...overrides,
  };
  const classified = classify(item, ME, undefined, ruleSwitches());
  return asks ? { ...classified, asks } : classified;
}

describe("planStatus", () => {
  it("hands off an open assignment instead of marking it done", () => {
    expect(planStatus(entry({}), "done", ME)).toEqual({ do: "hand-off" });
  });

  it("marks an item done that is not on the viewer's plate", () => {
    expect(planStatus(entry({ assignees: [], reasons: ["mentioned"] }), "done", ME)).toEqual({ do: "set", status: "done" });
  });

  it("ticks off an update before anything else", () => {
    expect(planStatus(entry({}, ["update"]), "done", ME)).toEqual({ do: "tick-update" });
  });

  it("does nothing for done on an item whose part is already done, and resumes it on open", () => {
    const handedOff = { ...entry({}), updates: [] };
    expect(planStatus(handedOff, "done", ME)).toEqual({ do: "none" });
    expect(planStatus(handedOff, "open", ME)).toEqual({ do: "resume" });
  });

  it("does not finish what the viewer opened: a pull request, or an issue without another assignee", () => {
    expect(planStatus(entry({ kind: "pr", author: ME, assignees: [] }), "done", ME)).toEqual({ do: "blocked" });
    expect(planStatus(entry({ author: ME, assignees: [ME] }), "done", ME)).toEqual({ do: "blocked" });
    expect(planStatus(entry({ author: ME, assignees: [] }), "done", ME)).toEqual({ do: "blocked" });
    expect(planStatus(entry({ author: ME, assignees: ["bob"], reasons: ["involved"] }), "done", ME)).toEqual({ do: "blocked" });
  });

  it("hands off an own issue that has another assignee besides the viewer", () => {
    expect(planStatus(entry({ author: ME, assignees: [ME, "bob"] }), "done", ME)).toEqual({ do: "hand-off" });
  });

  it("files an own item that asks again after a follow-up or a reopen, without finishing it", () => {
    expect(planStatus(entry({ author: ME, assignees: [ME] }, ["reopened"]), "done", ME)).toEqual({ do: "clear" });
  });

  it("still lets the viewer put an own item aside", () => {
    expect(planStatus(entry({ author: ME, assignees: [ME] }), "snoozed", ME)).toEqual({ do: "set", status: "snoozed" });
  });

  it("sets other statuses as chosen", () => {
    expect(planStatus(entry({}), "snoozed", ME)).toEqual({ do: "set", status: "snoozed" });
  });
});
