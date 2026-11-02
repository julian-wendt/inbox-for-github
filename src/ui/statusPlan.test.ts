import { describe, expect, it } from "vitest";
import { classify, type Classified } from "../classify";
import type { Item } from "../model";
import { ruleSwitches } from "../rules";
import { doneAccess, planStatus } from "./statusPlan";

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
  const shared = { assignees: [ME, "bob"] };

  it("hands off an assignment shared with others instead of marking it done", () => {
    expect(planStatus(entry(shared), "done", ME)).toEqual({ do: "hand-off" });
    expect(planStatus(entry(shared, ["review"]), "done", ME)).toEqual({ do: "hand-off" });
  });

  it("marks an item done that is not on the viewer's plate", () => {
    expect(planStatus(entry({ assignees: [], reasons: ["mentioned"] }), "done", ME)).toEqual({ do: "set", status: "done" });
  });

  it("ticks off an update before anything else, also on a locked item", () => {
    expect(planStatus(entry({}, ["update"]), "done", ME)).toEqual({ do: "tick-update" });
  });

  it("does nothing for done on an item whose part is already done, and resumes it on open", () => {
    const handedOff = { ...entry(shared), updates: [] };
    expect(planStatus(handedOff, "done", ME)).toEqual({ do: "none" });
    expect(planStatus(handedOff, "open", ME)).toEqual({ do: "resume" });
  });

  it("changes no status of an own item or one assigned to the viewer alone, in any view", () => {
    expect(planStatus(entry({ kind: "pr", author: ME, assignees: [] }), "done", ME)).toEqual({ do: "blocked", why: "own" });
    expect(planStatus(entry({ author: ME, assignees: [ME, "bob"] }), "done", ME)).toEqual({ do: "blocked", why: "own" });
    expect(planStatus(entry({}), "done", ME)).toEqual({ do: "blocked", why: "alone" });
  });

  it("files what asks on a locked item instead", () => {
    expect(planStatus(entry({}, ["mention"]), "done", ME)).toEqual({ do: "file" });
    expect(planStatus(entry({}, ["review"]), "done", ME)).toEqual({ do: "file" });
    expect(planStatus(entry({ author: ME, kind: "pr", assignees: [], reasons: ["involved"] }, ["mention"]), "done", ME)).toEqual({ do: "file" });
    expect(planStatus(entry({ author: ME, assignees: [ME] }, ["reopened"]), "done", ME)).toEqual({ do: "clear" });
  });

  it("files feedback and thread answers on any item of the tables", () => {
    expect(planStatus(entry(shared, ["feedback"]), "done", ME)).toEqual({ do: "file" });
    expect(planStatus(entry(shared, ["mention", "reply"]), "done", ME)).toEqual({ do: "file" });
  });

  it("files an own item someone else closed", () => {
    expect(planStatus(entry({ author: ME, assignees: [], closed: { state: "closed", at: "2026-10-02T00:00:00Z" } }, ["closed"]), "done", ME)).toEqual({ do: "file" });
  });

  it("still lets the viewer put any item aside", () => {
    expect(planStatus(entry({ author: ME, assignees: [ME] }), "snoozed", ME)).toEqual({ do: "set", status: "snoozed" });
    expect(planStatus(entry({}), "snoozed", ME)).toEqual({ do: "set", status: "snoozed" });
  });
});

describe("doneAccess", () => {
  it("offers D while it does something, hides it on own items and greys it out on lone assignments", () => {
    expect(doneAccess(entry({ assignees: [ME, "bob"] }), ME)).toBe("on");
    expect(doneAccess(entry({ author: ME, kind: "pr", assignees: [], reasons: ["involved"] }), ME)).toBe("hidden");
    expect(doneAccess(entry({}), ME)).toBe("off");
    expect(doneAccess(entry({}, ["mention"]), ME)).toBe("on");
  });
});
