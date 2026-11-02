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
    expect(planStatus(entry({ kind: "pr", author: ME, assignees: [] }), "done", ME)).toEqual({ do: "blocked", why: "open" });
    expect(planStatus(entry({ author: ME, assignees: [ME] }), "done", ME)).toEqual({ do: "blocked", why: "open" });
    expect(planStatus(entry({ author: ME, assignees: [] }), "done", ME)).toEqual({ do: "blocked", why: "open" });
    expect(planStatus(entry({ author: ME, assignees: ["bob"], reasons: ["involved"] }), "done", ME)).toEqual({ do: "blocked", why: "open" });
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

  it("files an item of the tables that sits in the inbox, keeping the viewer's part", () => {
    expect(planStatus(entry({}, ["feedback"]), "done", ME)).toEqual({ do: "file" });
    expect(planStatus(entry({}, ["mention", "reply"]), "done", ME)).toEqual({ do: "file" });
    expect(planStatus(entry({ author: ME, kind: "pr", assignees: [], reasons: ["involved"] }, ["feedback"]), "done", ME)).toEqual({ do: "file" });
  });

  it("keeps D's own meaning for a mention or review request alone", () => {
    expect(planStatus(entry({}, ["review"]), "done", ME)).toEqual({ do: "hand-off" });
    expect(planStatus(entry({ author: ME, kind: "pr", assignees: [], reasons: ["involved"] }, ["mention"]), "done", ME)).toEqual({ do: "blocked", why: "open" });
  });

  it("files an own item someone else closed", () => {
    expect(planStatus(entry({ author: ME, assignees: [], closed: { state: "closed", at: "2026-10-02T00:00:00Z" } }, ["closed"]), "done", ME)).toEqual({ do: "file" });
  });

  it("does nothing in Created by me, whatever the item", () => {
    expect(planStatus(entry({ author: ME, assignees: [ME, "bob"] }), "done", ME, "authored")).toEqual({ do: "blocked", why: "created" });
    expect(planStatus(entry({ author: ME, assignees: [] }, ["feedback"]), "done", ME, "authored")).toEqual({ do: "blocked", why: "created" });
  });

  it("does nothing in Assigned to me while the viewer is the only assignee", () => {
    expect(planStatus(entry({}), "done", ME, "assigned")).toEqual({ do: "blocked", why: "alone" });
    expect(planStatus(entry({ assignees: [ME, "bob"] }), "done", ME, "assigned")).toEqual({ do: "hand-off" });
    expect(planStatus(entry({}), "done", ME, "inbox")).toEqual({ do: "hand-off" });
    expect(planStatus(entry({}), "snoozed", ME, "assigned")).toEqual({ do: "set", status: "snoozed" });
  });

  it("still ticks off an update in Assigned to me", () => {
    expect(planStatus(entry({}, ["update"]), "done", ME, "assigned")).toEqual({ do: "tick-update" });
  });

  it("sets other statuses as chosen", () => {
    expect(planStatus(entry({}), "snoozed", ME)).toEqual({ do: "set", status: "snoozed" });
  });
});
