import { describe, expect, it } from "vitest";
import type { Classified } from "../classify";
import type { Item } from "../model";
import { seenStep, unreadAssignment, unreadInInbox, type ReadState } from "./unread";

function entry(overrides: Partial<Classified> = {}, item: Partial<Item> = {}): Classified {
  return {
    item: { id: "I_1", title: "t", repo: "o/a", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-22T00:00:00Z", closed: null, linkedPrs: [], boards: [], kind: "issue", draft: false, reasons: ["mentioned"], comments: [], activities: [], reviews: [], body: "", author: "me", ...item } as Item,
    bucket: "inbox",
    status: "open",
    mention: null,
    answered: null,
    asks: ["mention"],
    statusAt: null,
    statusReset: false,
    ...overrides,
  };
}

const mentioned = { comments: [{ author: "alice", body: "@me look", createdAt: "2026-10-22T10:00:00Z" }] };
const mention = { by: "alice", at: "2026-10-22T10:00:00Z", excerpt: "", self: false };
const seen = new Map([["I_1", "2026-10-22T11:00:00Z"]]);

describe("unreadInInbox", () => {
  it("counts an item never opened as unread", () => {
    expect(unreadInInbox(entry({ mention }, mentioned), new Map(), "me")).toBe(true);
  });

  it("counts it as read once opened after the mention, and unread again after a newer post by someone else", () => {
    expect(unreadInInbox(entry({ mention }, mentioned), seen, "me")).toBe(false);
    const later = { comments: [...mentioned.comments, { author: "bob", body: "any news?", createdAt: "2026-10-22T12:00:00Z" }] };
    expect(unreadInInbox(entry({ mention }, later), seen, "me")).toBe(true);
  });

  it("ignores the viewer's own posts", () => {
    const own = { comments: [...mentioned.comments, { author: "me", body: "on it", createdAt: "2026-10-22T12:00:00Z" }] };
    expect(unreadInInbox(entry({ mention }, own), seen, "me")).toBe(false);
  });

  it("counts a stored Open after the last visit as unread, as after a passed follow-up date", () => {
    expect(unreadInInbox(entry({ asks: ["reopened"], statusAt: "2026-10-23T08:00:00Z" }, mentioned), seen, "me")).toBe(true);
  });
});

describe("unreadInInbox with the movesUp setting", () => {
  const commit = { activities: [{ kind: "commit" as const, at: "2026-10-22T12:00:00Z", actor: "alice" }] };
  const counted = { commits: true, events: true, bots: false };

  it("counts a commit as news only when the setting lets commits count", () => {
    const withCommit = entry({ asks: ["review"] }, commit);
    expect(unreadInInbox(withCommit, seen, "me")).toBe(false);
    expect(unreadInInbox(withCommit, seen, "me", counted)).toBe(true);
  });
});

describe("unreadAssignment", () => {
  it("does not count a new assignment outside Assigned to me, where the row shows none", () => {
    expect(unreadAssignment(entry({ bucket: "authored", asks: [] }, { reasons: ["assigned"] }), new Map(), "me", false)).toBe(false);
  });

  it("counts a new assignment where the view draws it, whatever the item's bucket", () => {
    const assigned = { reasons: ["assigned" as const], activities: [{ kind: "assigned" as const, at: "2026-10-22T09:00:00Z", actor: "alice", assignee: "me" }] };
    expect(unreadAssignment(entry({ bucket: "inbox", asks: [] }, assigned), new Map(), "me", true)).toBe(true);
    expect(unreadAssignment(entry({ bucket: "snoozed", asks: [] }, assigned), new Map(), "me", true)).toBe(true);
  });

  it("does not count it in Planned or Follow-up, which draw no such mark", () => {
    const assigned = { reasons: ["assigned" as const], activities: [{ kind: "assigned" as const, at: "2026-10-22T09:00:00Z", actor: "alice", assignee: "me" }] };
    expect(unreadAssignment(entry({ bucket: "assigned", asks: [] }, assigned), new Map(), "me", false)).toBe(false);
  });

  it("counts a new assignment as unread until opened", () => {
    const assigned = { reasons: ["assigned" as const], activities: [{ kind: "assigned" as const, at: "2026-10-22T09:00:00Z", actor: "alice", assignee: "me" }] };
    expect(unreadAssignment(entry({ bucket: "assigned", asks: [] }, assigned), new Map(), "me", true)).toBe(true);
    expect(unreadAssignment(entry({ bucket: "assigned", asks: [] }, assigned), new Map([["I_1", "2026-10-22T10:00:00Z"]]), "me", true)).toBe(false);
  });
});

describe("seenStep", () => {
  const recorded = () => {
    const calls: [string, ReadState?][] = [];
    const markSeen = (id: string) => Promise.resolve(void calls.push([id]));
    const restoreRead = (id: string, previous: ReadState) => Promise.resolve(void calls.push([id, previous]));
    return { calls, markSeen, restoreRead };
  };

  it("marks the open item seen, undo restores its read state, redo marks it again", () => {
    const { calls, markSeen, restoreRead } = recorded();
    const before = { seen: "2026-10-20T00:00:00Z" };
    const [step] = seenStep("I_1", "I_1", before, markSeen, restoreRead);
    step.run();
    step.undo();
    step.run();
    expect(calls).toEqual([["I_1"], ["I_1", before], ["I_1"]]);
  });

  it("leaves an item alone that is not open", () => {
    const { markSeen, restoreRead } = recorded();
    expect(seenStep("I_1", undefined, {}, markSeen, restoreRead)).toEqual([]);
    expect(seenStep("I_1", "I_2", {}, markSeen, restoreRead)).toEqual([]);
  });

  it("keeps an unread mark set by hand", () => {
    const { markSeen, restoreRead } = recorded();
    expect(seenStep("I_1", "I_1", { seen: "2026-10-20T00:00:00Z", mark: "2026-10-21T00:00:00Z" }, markSeen, restoreRead)).toEqual([]);
  });
});
