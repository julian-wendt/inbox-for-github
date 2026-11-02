import { describe, expect, it } from "vitest";
import { closedByOther, feedbackSince, lastAnswerAt, threadReply } from "./feedback";
import type { Item } from "./model";

const at = (hour: number) => `2026-11-02T${String(hour).padStart(2, "0")}:00:00Z`;
const base: Item = {
  id: "PR_1", kind: "pr", repo: "lumen-labs/beacon", number: 7, title: "t", url: "u", author: "me", body: "", createdAt: at(1), updatedAt: at(1),
  labels: [], reviewRequests: [], draft: false, reviews: [], threads: [], avatars: {}, pull: null, closed: null, linkedPrs: [], issueType: null, activities: [], boards: [], assignees: [], comments: [], reasons: ["involved"],
};
const item = (overrides: Partial<Item>): Item => ({ ...base, ...overrides });
const comment = (author: string, hour: number, extra: Partial<Item["comments"][number]> = {}) => ({ author, body: "text", createdAt: at(hour), ...extra });

describe("lastAnswerAt", () => {
  it("takes the viewer's last post, review or commit, whichever came last", () => {
    expect(lastAnswerAt(item({ comments: [comment("me", 2)], reviews: [{ author: "me", at: at(3) }], activities: [{ kind: "commit", at: at(4), author: "me" }] }), "me")).toBe(at(4));
    expect(lastAnswerAt(item({ comments: [comment("me", 5)], activities: [{ kind: "commit", at: at(6) }] }), "me")).toBe(at(5));
  });

  it("does not count a self-mention as an answer", () => {
    expect(lastAnswerAt(item({ comments: [comment("me", 2, { body: "@me later" })] }), "me")).toBe(at(1));
  });
});

describe("feedbackSince", () => {
  const pr = item({
    comments: [comment("bot[bot]", 3), comment("bob", 4, { where: "src/a.ts:3" }), comment("bob", 5, { where: "Review", reviewState: "CHANGES_REQUESTED" })],
    reviews: [{ author: "carol", at: at(6), state: "APPROVED" }, { author: "me", at: at(7), state: "COMMENTED" }],
  });

  it("takes the latest post or review by a person other than the viewer", () => {
    expect(feedbackSince(pr, "me", null, "any")).toEqual({ at: at(6), by: "carol", kind: "approved" });
    expect(feedbackSince(pr, "me", at(6), "any")).toBeNull();
  });

  it("takes only requested changes with 'changes', and nothing with 'off'", () => {
    expect(feedbackSince(pr, "me", null, "changes")).toEqual({ at: at(5), by: "bob", kind: "changes" });
    expect(feedbackSince(pr, "me", at(5), "changes")).toBeNull();
    expect(feedbackSince(pr, "me", null, "off")).toBeNull();
  });

  it("leaves out bots", () => {
    expect(feedbackSince(item({ comments: [comment("copilot-pull-request-reviewer[bot]", 3)] }), "me", null, "any")).toBeNull();
  });
});

describe("threadReply", () => {
  const thread = (comments: [string, number][]) => ({ resolved: false, resolvedBy: null, outdated: false, comments: comments.map(([author, hour]) => ({ author, at: at(hour), url: "u", review: null, reply: true })) });

  it("finds an answer after the viewer's last comment in a thread they wrote in", () => {
    expect(threadReply(item({ threads: [thread([["me", 2], ["alice", 3]]), thread([["bob", 4]])] }), "me")).toEqual({ at: at(3), by: "alice" });
  });

  it("is nothing once the viewer answered, and for threads without them", () => {
    expect(threadReply(item({ threads: [thread([["me", 2], ["alice", 3], ["me", 4]]), thread([["bob", 5]])] }), "me")).toBeNull();
  });
});

describe("closedByOther", () => {
  const closed = (actor: string, state: "closed" | "merged" = "closed") =>
    item({ closed: { state, at: at(5) }, activities: [{ kind: "state", at: at(5), actor, change: state === "merged" ? "merged" : "closed" }] });

  it("names who closed it when that was someone else", () => {
    expect(closedByOther(closed("bob"), "me")).toEqual({ at: at(5), by: "bob" });
  });

  it("is nothing when the viewer closed it, when it was merged, or when it is open", () => {
    expect(closedByOther(closed("me"), "me")).toBeNull();
    expect(closedByOther(closed("bob", "merged"), "me")).toBeNull();
    expect(closedByOther(base, "me")).toBeNull();
  });
});
