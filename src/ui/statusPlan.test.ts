import { describe, expect, it } from "vitest";
import { classify, type Classified } from "../classify";
import type { Item } from "../model";
import { ruleSwitches } from "../rules";
import type { View } from "./labels";
import { doneAccess, keepsItsPlan, lockedDone, needsAskChoice, planStatus } from "./statusPlan";

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
  const own = { author: ME, assignees: [ME] };
  const others = { assignees: [], reasons: ["mentioned" as const] };
  const plan = (c: Classified, view: View) => planStatus(c, "done", ME, view);

  describe("in the inbox", () => {
    it("files what asks on an assignment, an own item or a handed-off one", () => {
      expect(plan(entry({}, ["mention"]), "inbox")).toEqual({ do: "file" });
      expect(plan(entry(shared, ["review", "feedback"]), "inbox")).toEqual({ do: "file" });
      expect(plan(entry(own, ["reply"]), "inbox")).toEqual({ do: "file" });
      expect(plan({ ...entry(shared, ["mention"]), updates: [] }, "inbox")).toEqual({ do: "file" });
    });

    it("clears a stored Open when O is the only ask, and files a reopen on GitHub", () => {
      expect(plan(entry({}, ["opened"]), "inbox")).toEqual({ do: "clear" });
      expect(plan(entry({}, ["reopened"]), "inbox")).toEqual({ do: "file" });
    });

    it("files an item outside the tables and ends its plan, also with a mention", () => {
      expect(plan(entry(others, ["mention"]), "inbox")).toEqual({ do: "file", unplan: true });
    });

    it("ticks off an update, which files the other asks too", () => {
      expect(plan(entry({}, ["update", "mention"]), "inbox")).toEqual({ do: "tick-update" });
    });

    it("files an own item someone else closed", () => {
      const closed = entry({ author: ME, assignees: [], closed: { state: "closed", at: "2026-10-02T00:00:00Z" } }, ["closed"]);
      expect(plan(closed, "inbox")).toEqual({ do: "file" });
    });
  });

  describe("in Assigned to me", () => {
    it("ends the viewer's part, alone or shared, whatever asks there are", () => {
      expect(plan(entry({}), "assigned")).toEqual({ do: "hand-off" });
      expect(plan(entry(shared), "assigned")).toEqual({ do: "hand-off" });
      expect(plan(entry({}, ["mention"]), "assigned")).toEqual({ do: "hand-off" });
    });

    it("does nothing on a finished part, and O resumes it", () => {
      const handedOff = { ...entry(shared), updates: [] };
      expect(plan(handedOff, "assigned")).toEqual({ do: "none" });
      expect(planStatus(handedOff, "open", ME, "assigned")).toEqual({ do: "resume" });
    });
  });

  describe("in Created by me", () => {
    it("leaves asks to the inbox", () => {
      expect(plan(entry(own, ["mention"]), "authored")).toEqual({ do: "blocked" });
      expect(plan(entry({ ...own, kind: "pr", assignees: [] }, ["review"]), "authored")).toEqual({ do: "blocked" });
      expect(plan(entry(own, ["reopened"]), "authored")).toEqual({ do: "blocked" });
    });

    it("changes nothing on an own item without asks", () => {
      expect(plan(entry({ kind: "pr", author: ME, assignees: [] }), "authored")).toEqual({ do: "blocked" });
      expect(plan(entry({ author: ME, assignees: [ME, "bob"] }), "authored")).toEqual({ do: "blocked" });
    });
  });

  describe("in Planned", () => {
    it("acts as the home view: assignment, own item, anything else", () => {
      expect(plan(entry({}), "planned")).toEqual({ do: "hand-off" });
      expect(plan(entry(own, ["mention"]), "planned")).toEqual({ do: "hand-off" });
      expect(plan(entry(own), "planned")).toEqual({ do: "hand-off" });
      expect(plan(entry({ ...own, assignees: [], reasons: ["involved"] }), "planned")).toEqual({ do: "blocked" });
      expect(plan(entry({ ...own, kind: "pr" }), "planned")).toEqual({ do: "blocked" });
      expect(plan(entry(others), "planned")).toEqual({ do: "file", unplan: true });
    });
  });

  describe("in Follow-up", () => {
    it("ends the follow-up", () => {
      expect(plan(entry({}), "snoozed")).toEqual({ do: "clear" });
      expect(plan(entry(others, ["mention"]), "snoozed")).toEqual({ do: "clear" });
    });
  });

  describe("in Done", () => {
    it("does nothing", () => {
      expect(plan(entry(others), "done")).toEqual({ do: "none" });
    });
  });

  it("still lets the viewer put any item aside", () => {
    expect(planStatus(entry(own), "snoozed", ME, "inbox")).toEqual({ do: "set", status: "snoozed" });
    expect(planStatus(entry({}), "snoozed", ME, "assigned")).toEqual({ do: "set", status: "snoozed" });
  });
});

describe("doneAccess", () => {
  it("offers D while it does something and hides it in Created by me", () => {
    expect(doneAccess(entry({ assignees: [ME, "bob"] }), ME, "assigned")).toBe("on");
    expect(doneAccess(entry({ author: ME, kind: "pr", assignees: [], reasons: ["involved"] }), ME, "authored")).toBe("hidden");
    expect(doneAccess(entry({ author: ME, assignees: [ME] }, ["mention"]), ME, "authored")).toBe("hidden");
    expect(doneAccess(entry({ author: ME, assignees: [ME] }, ["mention"]), ME, "inbox")).toBe("on");
  });

  it("offers D alone for a closed item whose closing waits in the inbox", () => {
    const closed = entry({ author: ME, assignees: [], closed: { state: "closed", at: "2026-10-01T00:00:00Z" } }, ["closed"]);
    expect(doneAccess(closed, ME, "inbox")).toBe("closed");
  });
});

describe("keepsItsPlan", () => {
  it("keeps the plan when D hands off or ticks off an update, shared or not", () => {
    expect(keepsItsPlan({ do: "hand-off" })).toBe(true);
    expect(keepsItsPlan({ do: "tick-update" })).toBe(true);
    expect(keepsItsPlan({ do: "set", status: "done" })).toBe(false);
  });
});

describe("needsAskChoice", () => {
  const ask = (c: Classified, view: View) => needsAskChoice(c, "done", ME, view);
  it("asks where D hands off and asks are open", () => {
    expect(ask(entry({}, ["mention"]), "assigned")).toBe(true);
    expect(ask(entry({}, ["mention"]), "planned")).toBe(true);
  });
  it("acts at once without asks, outside the hand-off or for other statuses", () => {
    expect(ask(entry({}), "assigned")).toBe(false);
    expect(ask(entry({}, ["mention"]), "inbox")).toBe(false);
    expect(needsAskChoice(entry({}, ["mention"]), "open", ME, "assigned")).toBe(false);
  });
});

describe("lockedDone", () => {
  const done = { status: "done" as const };
  const involved = { author: ME, assignees: [], reasons: ["involved" as const] };

  it("keeps my part done on an own issue assigned to me", () => {
    expect(lockedDone(entry({ author: ME }), done, ME)).toBe(false);
  });

  it("clears a done on an own item that is no assignment of mine", () => {
    expect(lockedDone(entry(involved), done, ME)).toBe(true);
    expect(lockedDone(entry({ author: ME, kind: "pr" }), done, ME)).toBe(true);
  });

  it("leaves other items and other statuses alone", () => {
    expect(lockedDone(entry({}), done, ME)).toBe(false);
    expect(lockedDone(entry(involved), { status: "open" }, ME)).toBe(false);
  });
});
