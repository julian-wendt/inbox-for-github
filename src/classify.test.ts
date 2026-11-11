import { describe, expect, it } from "vitest";
import { ASK_RULES_DEFAULT, classify, type AskRules } from "./classify";
import type { Comment, Item, Reopen, StoredStatus } from "./model";
import { ruleSwitches } from "./rules";
import { findMention } from "./timeline";

const ME = "me";

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "I_1",
    kind: "issue",
    repo: "octo-org/app",
    number: 1,
    title: "Something",
    url: "https://github.com/octo-org/app/issues/1",
    author: "alice",
    body: "Opening post",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-05T00:00:00Z",
    labels: [],
    reviewRequests: [],
    draft: false,
    reviews: [],
    threads: [],
    avatars: {},
    pull: null,
    closed: null,
    linkedPrs: [],
    issueType: null,
    activities: [],
    boards: [],
    assignees: [],
    comments: [],
    reasons: ["mentioned", "involved"],
    ...overrides,
  };
}

const comment = (author: string, body: string, day: number): Comment => ({
  author,
  body,
  createdAt: `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`,
});

const done = (day: number): StoredStatus => ({
  status: "done",
  changedAt: `2026-10-${String(day).padStart(2, "0")}T12:00:00Z`,
});

/** Mentions and review requests alone, as before feedback, replies and closings asked; most cases here are about those. */
const MENTIONS_ONLY: AskRules = { ownFeedback: "off", assignedFeedback: false, threadReplies: false, ownClosed: false };

const run = (i: Item, stored?: StoredStatus, overrides?: Record<string, boolean>, reopenOn?: Reopen) =>
  classify(i, ME, stored, ruleSwitches(overrides), reopenOn, undefined, undefined, undefined, MENTIONS_ONLY);

const withRules = (i: Item, rules: Partial<AskRules> = {}, stored?: StoredStatus, filedAt?: string) =>
  classify(i, ME, stored, ruleSwitches(), "mention", Date.parse("2026-10-20T00:00:00Z"), true, undefined, { ...ASK_RULES_DEFAULT, ...rules }, filedAt);

describe("findMention", () => {
  it("matches the login case-insensitively", () => {
    expect(findMention("ping @Me please", ME)).toContain("@Me");
  });

  it("ignores longer logins, emails and team slugs", () => {
    expect(findMention("@me-too and mail@me and @octo-org/me", ME)).toBeNull();
  });

  it("ignores quotes and code", () => {
    expect(findMention("> @me said\n`@me`\n```\n@me\n```", ME)).toBeNull();
  });
});

describe("mention-after-my-activity", () => {
  it("puts an unanswered mention into the inbox", () => {
    const result = run(item({ comments: [comment("alice", "@me what do you think?", 2)] }));
    expect(result.bucket).toBe("inbox");
    expect(result.mention).toMatchObject({ by: "alice", self: false });
  });

  it("counts the item as done once I reply", () => {
    const result = run(
      item({
        comments: [comment("alice", "@me what do you think?", 2), comment(ME, "Looks good", 3)],
      }),
    );
    expect(result).toMatchObject({ bucket: "done", status: "done", answered: "mention", mention: null });
  });

  it("brings an answered mention back on a manual reopen, until I reply again", () => {
    const reopened: StoredStatus = { status: "open", changedAt: "2026-10-04T12:00:00Z" };
    const answered = [comment("alice", "@me q", 2), comment(ME, "a", 3)];
    expect(run(item({ comments: answered }), reopened).bucket).toBe("inbox");
    expect(run(item({ comments: [...answered, comment(ME, "more", 5)] }), reopened).bucket).toBe("done");
  });

  it("leaves items I was never asked in under involved", () => {
    expect(run(item({ comments: [comment("alice", "unrelated", 2)] })).bucket).toBe("involved");
  });

  it("puts what I opened myself under authored instead, unless something asks for me", () => {
    expect(run(item({ author: ME, comments: [comment("alice", "unrelated", 2)] })).bucket).toBe("authored");
    expect(run(item({ author: ME, comments: [comment("alice", "@me look", 2)] })).bucket).toBe("inbox");
  });

  it("brings the item back on a mention after my reply", () => {
    const result = run(
      item({
        comments: [
          comment("alice", "@me question", 2),
          comment(ME, "answer", 3),
          comment("bob", "@me follow-up", 4),
        ],
      }),
    );
    expect(result.bucket).toBe("inbox");
    expect(result.mention?.by).toBe("bob");
  });

  it("keeps an answered mention done when someone comments without mentioning me", () => {
    const result = run(
      item({
        comments: [comment("alice", "@me q", 2), comment(ME, "a", 3), comment("alice", "thanks!", 4)],
      }),
    );
    expect(result.bucket).toBe("done");
  });

  it("treats a self-mention as a reminder that my own later reply resolves", () => {
    const reminder = item({ comments: [comment(ME, "@me check the schema later", 2)] });
    expect(run(reminder).bucket).toBe("inbox");
    expect(run(reminder).mention).toMatchObject({ by: ME, self: true });

    const resolved = item({
      comments: [comment(ME, "@me check the schema later", 2), comment(ME, "Schema checked", 3)],
    });
    expect(run(resolved).bucket).toBe("done");
  });

  it("does not count a self-mention as a reply to someone else's mention", () => {
    const result = run(
      item({ comments: [comment("alice", "@me q", 2), comment(ME, "@me look into this", 3)] }),
    );
    expect(result.bucket).toBe("inbox");
    expect(result.mention?.self).toBe(true);
  });

  it("counts a mention in the opening post", () => {
    expect(run(item({ body: "Hey @me, can you design this?" })).bucket).toBe("inbox");
  });
});

describe("with the mention rule switched off", () => {
  it("lists every mention under answer, even after my reply", () => {
    const result = run(
      item({ comments: [comment("alice", "@me q", 2), comment(ME, "a", 3)] }),
      undefined,
      { "mention-after-my-activity": false },
    );
    expect(result.bucket).toBe("inbox");
  });
});

describe("manual status", () => {
  const mentionedAgain = item({
    comments: [comment("alice", "@me q", 2), comment("bob", "@me again", 6)],
  });
  const commentedAgain = item({
    comments: [comment("alice", "@me q", 2), comment("bob", "fixed it", 6)],
  });

  it("reopens done on a later mention by default", () => {
    const result = run(mentionedAgain, done(4));
    expect(result).toMatchObject({ bucket: "inbox", status: "open", statusReset: true });
  });

  it("keeps done for mentions before the status change", () => {
    expect(run(mentionedAgain, done(7))).toMatchObject({ bucket: "done", status: "done", statusReset: false });
  });

  it("ignores plain comments unless any post reopens", () => {
    expect(run(commentedAgain, done(4)).statusReset).toBe(false);
    expect(run(commentedAgain, done(4), undefined, "any-post")).toMatchObject({ status: "open", statusReset: true });
  });

  it("moves snoozed items out of every other bucket", () => {
    const snoozed: StoredStatus = { status: "snoozed", changedAt: "2026-10-04T12:00:00Z" };
    expect(run(item({ reasons: ["assigned"] }), snoozed)).toMatchObject({ bucket: "assigned", status: "snoozed" });
    expect(run(item({ comments: [comment("alice", "@me q", 2)] }), snoozed).bucket).toBe("snoozed");
  });

  it("reopens snoozed like done", () => {
    const snoozed: StoredStatus = { status: "snoozed", changedAt: "2026-10-04T12:00:00Z" };
    expect(run(mentionedAgain, snoozed)).toMatchObject({ bucket: "inbox", status: "open", statusReset: true });
  });
});

describe("inbox", () => {
  it("holds review requests until a status moves them out", () => {
    expect(run(item({ reasons: ["review", "involved"] })).bucket).toBe("inbox");
    expect(run(item({ reasons: ["review", "involved"] }), done(4)).bucket).toBe("done");
  });

  it("leaves items I merely take part in under involved, my own under authored", () => {
    expect(run(item({ reasons: ["involved"] })).bucket).toBe("involved");
    expect(run(item({ author: ME, reasons: ["involved"] })).bucket).toBe("authored");
  });
});

describe("review requests", () => {
  const asked = (day: number, reviewer = ME) => ({ reviewer, at: `2026-10-${String(day).padStart(2, "0")}T00:00:00Z` });
  const pr = (overrides: Partial<Item> = {}) =>
    item({ kind: "pr", reasons: ["review", "involved"], reviewRequests: [asked(2)], ...overrides });

  it("stays in the inbox until I act", () => {
    expect(run(pr())).toMatchObject({ bucket: "inbox", status: "open", answered: null });
  });

  it("names who last asked me or my team for the review", () => {
    const requested = (actor: string, reviewer: string, day: number) => ({ kind: "review-requested" as const, at: `2026-10-0${day}T00:00:00Z`, actor, reviewer });
    expect(run(pr({ activities: [requested("alice", ME, 2), requested("bob", "carol", 3)] })).requestedBy).toBe("alice");
    expect(run(pr({ activities: [requested("alice", ME, 2), requested("dave", "team:core", 3)] })).requestedBy).toBe("dave");
    expect(run(pr()).requestedBy).toBeUndefined();
  });

  it("counts a comment or a review without text after the request as done", () => {
    expect(run(pr({ comments: [comment(ME, "Looks odd, see above", 3)] }))).toMatchObject({
      bucket: "done",
      status: "done",
      answered: "review",
    });
    expect(run(pr({ reviews: [{ author: ME, at: "2026-10-03T00:00:00Z" }] })).bucket).toBe("done");
  });

  it("returns to the inbox when a person posts after me, but not for bots", () => {
    const answered = [comment(ME, "Looks odd", 3)];
    expect(run(pr({ comments: [...answered, comment("bob", "Fixed", 4)] })).bucket).toBe("inbox");
    expect(run(pr({ comments: [...answered, comment("github-actions[bot]", "CI passed", 4)] })).bucket).toBe("done");
    expect(run(pr({ comments: answered, reviews: [{ author: "carol", at: "2026-10-04T00:00:00Z" }] })).bucket).toBe("inbox");
  });

  it("returns to the inbox on a new request", () => {
    expect(run(pr({ comments: [comment(ME, "Looks odd", 3)], reviewRequests: [asked(2), asked(4)] })).bucket).toBe("inbox");
  });

  it("ignores my posts from before the request and treats team requests as mine", () => {
    expect(run(pr({ comments: [comment(ME, "early note", 1)] })).bucket).toBe("inbox");
    expect(run(pr({ reviewRequests: [asked(2, "team:security")], comments: [comment(ME, "on it", 3)] })).bucket).toBe("done");
  });

  it("brings an answered request back on a manual reopen, until I answer again", () => {
    const reopened: StoredStatus = { status: "open", changedAt: "2026-10-04T12:00:00Z" };
    const answered = [comment(ME, "Looks odd", 3)];
    expect(run(pr({ comments: answered }), reopened)).toMatchObject({ bucket: "inbox", status: "open", statusReset: false });
    expect(run(pr({ comments: [...answered, comment(ME, "Checked again", 5)] }), reopened).bucket).toBe("done");
  });

  it("leaves an answered request under assigned while it is also assigned to me", () => {
    expect(run(pr({ reasons: ["review", "assigned"], comments: [comment(ME, "Looks odd", 3)] })).bucket).toBe("assigned");
  });
});

describe("pushes after my review", () => {
  const at = (day: number) => `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`;
  const reviewed = (overrides: Partial<Item> = {}) =>
    item({ kind: "pr", reasons: ["involved"], reviews: [{ author: ME, at: at(3) }], ...overrides });
  const commit = (day: number, author?: string) => ({ kind: "commit" as const, at: at(day), ...(author && { author }) });

  it("brings the pull request back on a commit or force push by someone else", () => {
    expect(run(reviewed({ activities: [commit(4, "alice")] }))).toMatchObject({ bucket: "inbox", asks: ["commits"] });
    expect(run(reviewed({ activities: [{ kind: "force-pushed", at: at(4), actor: "alice" }] })).asks).toEqual(["commits"]);
  });

  it("names who pushed, last pusher last", () => {
    const pushed = reviewed({ activities: [commit(4, "bob"), { kind: "force-pushed", at: at(5), actor: "alice" }, commit(6, "bob")] });
    expect(run(pushed).pushedBy).toEqual(["alice", "bob"]);
  });

  it("ignores my own commits, bots, unknown authors and pushes before my review", () => {
    for (const activity of [commit(4, ME), commit(4, "renovate[bot]"), commit(4), commit(2, "alice")]) {
      expect(run(reviewed({ activities: [activity] })).asks).toEqual([]);
    }
  });

  it("leaves once I review or comment again", () => {
    expect(run(reviewed({ activities: [commit(4, "alice")], comments: [comment(ME, "Checked", 5)] })).asks).toEqual([]);
  });

  it("needs a review of mine", () => {
    expect(run(item({ kind: "pr", reasons: ["involved"], activities: [commit(4, "alice")] })).asks).toEqual([]);
  });

  it("reopens a done or snoozed item only for pushes after the status change", () => {
    const pushed = reviewed({ activities: [commit(5, "alice")] });
    expect(run(pushed, done(4))).toMatchObject({ bucket: "inbox", statusReset: true, asks: ["commits"] });
    expect(run(pushed, done(6))).toMatchObject({ bucket: "done", statusReset: false });
  });

  it("does nothing with the setting off", () => {
    const pushed = reviewed({ activities: [commit(5, "alice")] });
    expect(classify(pushed, ME, undefined, ruleSwitches(), "mention", Date.now(), false).asks).toEqual([]);
    expect(classify(pushed, ME, done(4), ruleSwitches(), "mention", Date.now(), false).statusReset).toBe(false);
  });
});

describe("closed items", () => {
  it("are done when they were for the viewer, whatever the stored status, and never reopen", () => {
    const closed = item({ reasons: ["review"], closed: { state: "merged", at: "2026-10-05T00:00:00Z" } });
    const result = classify(closed, "me", { status: "snoozed", changedAt: "2026-10-01T00:00:00Z" }, ruleSwitches());
    expect([result.bucket, result.status, result.statusReset]).toEqual(["done", "done", false]);
    expect(run(item({ comments: [comment("bob", "@me q", 2)], closed: { state: "closed", at: "2026-10-05T00:00:00Z" } })).bucket).toBe("done");
  });

  it("show nowhere when they were assignments or merely taken part in", () => {
    const closedAt = { state: "closed" as const, at: "2026-10-05T00:00:00Z" };
    expect(run(item({ reasons: ["assigned"], closed: closedAt })).bucket).toBe("involved");
    expect(run(item({ reasons: ["involved"], closed: closedAt })).bucket).toBe("involved");
  });
});

describe("assignments", () => {
  const assigned = (overrides: Partial<Item> = {}) => item({ reasons: ["assigned", "involved"], assignees: ["me"], ...overrides });

  it("name who last assigned me, but not when I assigned myself", () => {
    const assignedAt = (actor: string, assignee: string, day: number) => ({ kind: "assigned" as const, at: `2026-10-0${day}T00:00:00Z`, actor, assignee });
    expect(run(assigned({ activities: [assignedAt("alice", ME, 2), assignedAt("bob", "carol", 3)] })).assignedBy).toBe("alice");
    expect(run(assigned({ activities: [assignedAt("alice", ME, 2), assignedAt(ME, ME, 3)] })).assignedBy).toBeUndefined();
  });

  it("go straight to Assigned to me, without passing through the inbox", () => {
    expect(run(assigned())).toMatchObject({ bucket: "assigned", status: "open", asks: [] });
  });

  it("show in the inbox only while a mention waits for an answer", () => {
    const mentioned = assigned({ comments: [comment("bob", "@me look", 2)] });
    expect(run(mentioned)).toMatchObject({ bucket: "inbox", asks: ["mention"] });
    expect(run(assigned({ comments: [...mentioned.comments, comment(ME, "on it", 3)] })).bucket).toBe("assigned");
  });

  it("stay out of the inbox for posts that do not mention the viewer", () => {
    expect(run(assigned({ comments: [comment("bob", "progress?", 4)] }), undefined, undefined, "any-post").bucket).toBe("assigned");
  });

  it("leave Assigned to me once the viewer is unassigned", () => {
    expect(run(item({ reasons: ["involved"] })).bucket).toBe("involved");
  });
});

describe("snooze with a date", () => {
  const snoozed = { status: "snoozed" as const, changedAt: "2026-10-01T00:00:00Z", until: "2026-10-05T09:00:00Z" };

  it("comes back once the date has passed, and not before", () => {
    expect(classify(item(), "me", snoozed, ruleSwitches(), "mention", Date.parse("2026-10-04T00:00:00Z")).bucket).toBe("snoozed");
    expect(classify(item(), "me", snoozed, ruleSwitches(), "mention", Date.parse("2026-10-05T09:01:00Z")).statusReset).toBe(true);
  });

  it("still comes back earlier for a mention", () => {
    const mentioned = item({ comments: [{ author: "bob", body: "@me ping", createdAt: "2026-10-02T00:00:00Z" }] });
    expect(classify(mentioned, "me", snoozed, ruleSwitches(), "mention", Date.parse("2026-10-03T00:00:00Z")).statusReset).toBe(true);
  });

  it("ends at its date without an ask of its own; an item nobody asked for is back where it was", () => {
    const result = classify(item({ reasons: ["involved"] }), "me", snoozed, ruleSwitches(), "mention", Date.parse("2026-10-05T09:01:00Z"));
    expect(result).toMatchObject({ bucket: "involved", asks: [], statusReset: true });
  });

  it("comes back as a mention when one arrives before the date", () => {
    const mentioned = item({ comments: [{ author: "bob", body: "@me ping", createdAt: "2026-10-02T00:00:00Z" }] });
    expect(classify(mentioned, "me", snoozed, ruleSwitches(), "mention", Date.parse("2026-10-03T00:00:00Z")).asks).toEqual(["mention"]);
  });

  it("asks again on the stored Open written at its date where something was answered, until the viewer replies", () => {
    const back = { status: "open" as const, changedAt: "2026-10-05T09:01:00Z" };
    const answered = item({ comments: [comment("bob", "@me ping", 2), comment(ME, "sure", 3)] });
    expect(classify(answered, "me", back, ruleSwitches())).toMatchObject({ bucket: "inbox", asks: ["reopened"] });
    expect(classify(item({ ...answered, comments: [...answered.comments, comment(ME, "done", 6)] }), "me", back, ruleSwitches()).bucket).toBe("done");
    const filed = { status: "snoozed" as const, changedAt: "2026-10-06T00:00:00Z" };
    expect(classify(answered, "me", filed, ruleSwitches()).bucket).toBe("snoozed");
  });
});

describe("snoozing in the tables", () => {
  const assigned = (overrides: Partial<Item> = {}) => item({ reasons: ["assigned", "involved"], assignees: ["me"], ...overrides });
  const snoozed: StoredStatus = { status: "snoozed", changedAt: "2026-10-04T12:00:00Z", until: "2026-10-09T09:00:00Z" };
  const at = (iso: string) => Date.parse(iso);

  it("keeps an assignment in its table, snoozed, until its date", () => {
    expect(classify(assigned(), ME, snoozed, ruleSwitches(), "mention", at("2026-10-05T00:00:00Z"))).toMatchObject({ bucket: "assigned", status: "snoozed", asks: [] });
    expect(classify(assigned(), ME, snoozed, ruleSwitches(), "mention", at("2026-10-09T09:01:00Z"))).toMatchObject({ bucket: "assigned", status: "open", asks: [], statusReset: true });
  });

  it("adds a later mention or post to the inbox but stays snoozed", () => {
    const mentioned = assigned({ comments: [comment("bob", "@me look", 6)] });
    expect(classify(mentioned, ME, snoozed, ruleSwitches(), "mention", at("2026-10-07T00:00:00Z"))).toMatchObject({ bucket: "inbox", status: "snoozed", asks: ["mention"], statusReset: false });
    const posted = assigned({ comments: [comment("bob", "progress", 6)] });
    expect(classify(posted, ME, snoozed, ruleSwitches(), "any-post", at("2026-10-07T00:00:00Z"))).toMatchObject({ bucket: "inbox", status: "snoozed", asks: ["feedback"], statusReset: false });
  });

  it("does the same for the viewer's own items", () => {
    const own = item({ author: ME, reasons: ["involved"], comments: [comment("bob", "@me look", 6)] });
    expect(classify(own, ME, snoozed, ruleSwitches(), "mention", at("2026-10-07T00:00:00Z"))).toMatchObject({ bucket: "inbox", status: "snoozed", asks: ["mention"], statusReset: false });
    const quiet = item({ author: ME, reasons: ["involved"] });
    expect(classify(quiet, ME, snoozed, ruleSwitches(), "mention", at("2026-10-07T00:00:00Z"))).toMatchObject({ bucket: "authored", status: "snoozed", asks: [] });
    expect(classify(quiet, ME, snoozed, ruleSwitches(), "mention", at("2026-10-09T09:01:00Z"))).toMatchObject({ bucket: "authored", asks: [], statusReset: true });
  });
});

describe("my part done", () => {
  const assigned = (overrides: Partial<Item> = {}) => item({ reasons: ["assigned", "involved"], assignees: ["me"], ...overrides });
  const done: StoredStatus = { status: "done", changedAt: "2026-10-04T12:00:00Z", handoff: { boards: {}, prs: [] } };

  it("stays in Assigned to me, done, while nothing happened since", () => {
    expect(run(assigned(), done)).toMatchObject({ bucket: "assigned", status: "done", asks: [], updates: [] });
  });

  it("lands in the inbox for a post by someone else, and stays done", () => {
    const posted = assigned({ comments: [comment("bob", "merged the fix", 5)] });
    expect(run(posted, done)).toMatchObject({ bucket: "inbox", status: "done", asks: ["update"] });
  });

  it("is not reopened by the reopen setting; its updates replace it", () => {
    const posted = assigned({ comments: [comment("bob", "any news?", 5)] });
    expect(run(posted, done, undefined, "any-post")).toMatchObject({ statusReset: false, status: "done" });
  });

  it("brings closing as an update, and shows nowhere once ticked off", () => {
    const closed = assigned({ closed: { state: "closed", at: "2026-10-06T00:00:00Z" } });
    expect(run(closed, done).asks).toEqual(["update"]);
    expect(run(closed, { ...done, changedAt: "2026-10-07T00:00:00Z" }).bucket).toBe("involved");
  });

  it("keeps an ask from before the hand-off in the inbox until it is filed", () => {
    const mentioned = assigned({ comments: [comment("bob", "@me can you look?", 3)] });
    expect(run(mentioned, done)).toMatchObject({ bucket: "inbox", status: "done", asks: ["mention"] });
    const filed = withRules(mentioned, MENTIONS_ONLY, done, "2026-10-05T00:00:00Z");
    expect(filed).toMatchObject({ bucket: "assigned", status: "done", asks: [] });
  });

  it("does not bring back a mention the plan already answered, but keeps a later one", () => {
    const plan = (i: Item) => classify(i, ME, done, ruleSwitches(), "mention", undefined, true, "2026-10-04T00:00:00Z", MENTIONS_ONLY);
    const before = assigned({ comments: [comment("bob", "@me can you look?", 3)] });
    expect(plan(before)).toMatchObject({ bucket: "assigned", asks: [] });
    const after = assigned({ comments: [comment("bob", "@me can you look?", 4), comment("bob", "@me ping", 5)] });
    expect(plan(after)).toMatchObject({ bucket: "inbox" });
    expect(plan(after).asks).toContain("mention");
  });

  it("keeps an open review request in the inbox after the hand-off", () => {
    const pr = assigned({ kind: "pr", reasons: ["assigned", "review", "involved"], activities: [{ kind: "review-requested", at: "2026-10-03T00:00:00Z", actor: "alice", reviewer: ME }] });
    expect(run(pr, done)).toMatchObject({ bucket: "inbox", asks: ["review"] });
  });

  it("no longer counts once the viewer is unassigned: posts are no updates, only mentions bring it back", () => {
    expect(run(item({ reasons: ["involved"], comments: [comment("bob", "update", 5)] }), done)).toMatchObject({ bucket: "involved", asks: [] });
    expect(run(item({ comments: [comment("bob", "@me ping", 5)] }), done).bucket).toBe("inbox");
  });
});

describe("planned items", () => {
  const at = (day: number, hour = 0) => `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`;
  const planned = (i: Item, plannedAt: string, stored?: StoredStatus) => classify(i, ME, stored, ruleSwitches(), "mention", Date.parse(at(10)), true, plannedAt);
  const requested = (day: number, reviewer = ME) => ({ kind: "review-requested" as const, at: at(day), actor: "alice", reviewer });

  it("leave the inbox for Planned once planned, and come back on a mention since", () => {
    const mentioned = item({ comments: [comment("alice", "@me what do you think?", 2)] });
    expect(planned(mentioned, at(3))).toMatchObject({ bucket: "planned", status: "open", asks: [], mention: null });
    expect(planned(mentioned, at(1))).toMatchObject({ bucket: "inbox", asks: ["mention"] });
    expect(planned(item({ comments: [comment("alice", "@me again", 2), comment("alice", "@me and now?", 5)] }), at(3))).toMatchObject({ bucket: "inbox", asks: ["mention"] });
  });

  it("stay in their table when assigned to or opened by the viewer", () => {
    const assigned = item({ reasons: ["assigned", "involved"], assignees: [ME], comments: [comment("alice", "@me look", 2)] });
    expect(planned(assigned, at(3))).toMatchObject({ bucket: "assigned", asks: [] });
    const own = item({ author: ME, reasons: ["involved"], comments: [comment("alice", "@me look", 2)] });
    expect(planned(own, at(3))).toMatchObject({ bucket: "authored", asks: [] });
  });

  it("come back on a review request, a push or a reopen after the plan, not before", () => {
    const pr = item({ kind: "pr", reasons: ["review", "involved"], reviewRequests: [{ reviewer: ME, at: at(2) }] });
    expect(planned(pr, at(3)).bucket).toBe("planned");
    expect(planned(item({ ...pr, activities: [requested(2), requested(5, "team:core")] }), at(3))).toMatchObject({ bucket: "inbox", asks: ["review"] });
    const reviewed = item({ kind: "pr", reasons: ["involved"], reviews: [{ author: ME, at: at(3) }], activities: [{ kind: "commit", at: at(4), author: "alice" }] });
    expect(planned(reviewed, at(5)).bucket).toBe("planned");
    expect(planned(reviewed, at(3, 12))).toMatchObject({ bucket: "inbox", asks: ["commits"], pushedBy: ["alice"] });
    const answered = item({ comments: [comment("alice", "@me?", 2), comment(ME, "done", 3)] });
    expect(planned(answered, at(4), { status: "open", changedAt: at(5) })).toMatchObject({ bucket: "inbox", asks: ["reopened"] });
    expect(planned(answered, at(6), { status: "open", changedAt: at(5) })).toMatchObject({ bucket: "planned", asks: [] });
  });

  it("stay planned once the viewer answers an ask, whether it came before or after the plan", () => {
    expect(planned(item({ reasons: ["involved"] }), at(3)).bucket).toBe("planned");
    expect(planned(item({ comments: [comment("alice", "@me?", 2), comment(ME, "done", 3)] }), at(4))).toMatchObject({ bucket: "planned", status: "open", answered: null });
    expect(planned(item({ comments: [comment("alice", "@me?", 4), comment(ME, "done", 5)] }), at(3))).toMatchObject({ bucket: "planned", status: "open", asks: [] });
    const reviewed = item({ kind: "pr", reasons: ["review", "involved"], reviewRequests: [{ reviewer: ME, at: at(4) }], reviews: [{ author: ME, at: at(5) }] });
    expect(planned(reviewed, at(3))).toMatchObject({ bucket: "planned", status: "open" });
  });

  it("end with a stored Done, which the plan does not outlast", () => {
    expect(planned(item({ comments: [comment("alice", "@me?", 4)] }), at(3), { status: "done", changedAt: at(6) })).toMatchObject({ bucket: "done", status: "done" });
  });
});

describe("feedback, thread replies and closings", () => {
  const at = (day: number) => `2026-10-0${day}T00:00:00Z`;
  const own = (overrides: Partial<Item> = {}) => item({ author: ME, reasons: ["involved"], ...overrides });
  const assigned = (overrides: Partial<Item> = {}) => item({ reasons: ["assigned", "involved"], assignees: [ME], ...overrides });

  it("brings an own item into the inbox for a post by someone else, until the viewer answers", () => {
    expect(withRules(own({ comments: [comment("bob", "why this?", 2)] }))).toMatchObject({ bucket: "inbox", asks: ["feedback"], feedback: { by: "bob", kind: "commented" } });
    expect(withRules(own({ comments: [comment("bob", "why this?", 2), comment(ME, "because", 3)] })).bucket).toBe("authored");
  });

  it("takes only requested changes in the 'changes' mode, and nothing with 'off'", () => {
    const pr = own({ kind: "pr", reviews: [{ author: "bob", at: at(2), state: "APPROVED" }] });
    expect(withRules(pr).asks).toEqual(["feedback"]);
    expect(withRules(pr, { ownFeedback: "changes" }).bucket).toBe("authored");
    expect(withRules({ ...pr, reviews: [{ author: "bob", at: at(2), state: "CHANGES_REQUESTED" }] }, { ownFeedback: "changes" }).asks).toEqual(["feedback"]);
    expect(withRules(pr, { ownFeedback: "off" }).bucket).toBe("authored");
  });

  it("asks on an assignment for a post by someone else, unless switched off", () => {
    const posted = assigned({ comments: [comment("bob", "progress?", 2)] });
    expect(withRules(posted)).toMatchObject({ bucket: "inbox", asks: ["feedback"] });
    expect(withRules(posted, { assignedFeedback: false }).bucket).toBe("assigned");
  });

  it("files feedback from before filedAt, and lets a later one ask again", () => {
    const posted = assigned({ comments: [comment("bob", "progress?", 2)] });
    expect(withRules(posted, {}, undefined, at(3)).bucket).toBe("assigned");
    expect(withRules(assigned({ comments: [...posted.comments, comment("bob", "and now?", 4)] }), {}, undefined, at(3)).asks).toEqual(["feedback"]);
  });

  it("adds feedback on a waiting table item to the inbox without ending the follow-up", () => {
    const waiting: StoredStatus = { status: "snoozed", changedAt: at(2), until: "2026-10-30T09:00:00Z" };
    expect(withRules(assigned({ comments: [comment("bob", "progress?", 3)] }), {}, waiting)).toMatchObject({ bucket: "inbox", status: "snoozed", asks: ["feedback"] });
    expect(withRules(assigned({ comments: [comment("bob", "progress?", 1)] }), {}, waiting)).toMatchObject({ bucket: "assigned", asks: [] });
  });

  it("asks for an answer in a review thread the viewer wrote in, and brings a done item back for it", () => {
    const thread = (comments: [string, number][]) => ({ resolved: false, resolvedBy: null, outdated: false, comments: comments.map(([author, day]) => ({ author, at: at(day), url: "u", review: null, reply: true })) });
    const pr = item({ kind: "pr", reasons: ["involved"], threads: [thread([[ME, 2], ["alice", 4]])] });
    expect(withRules(pr)).toMatchObject({ bucket: "inbox", asks: ["reply"], repliedBy: "alice" });
    expect(withRules(pr, { threadReplies: false }).bucket).toBe("involved");
    expect(withRules(pr, {}, { status: "done", changedAt: at(3) })).toMatchObject({ bucket: "inbox", statusReset: true });
    expect(withRules(pr, {}, { status: "done", changedAt: at(5) }).bucket).toBe("done");
  });

  it("leaves a filed own item without its asks, so a second D has nothing left to file", () => {
    const mentioned = own({ comments: [comment("bob", "@me look", 2)] });
    expect(withRules(mentioned, {}, undefined, at(4))).toMatchObject({ asks: [], mention: null });
  });

  it("adds a thread answer on a waiting assignment to the inbox, once, not again as feedback", () => {
    const thread = { resolved: false, resolvedBy: null, outdated: false, comments: [{ author: ME, at: at(2), url: "u", review: null, reply: true }, { author: "alice", at: at(4), url: "u", review: null, reply: true }] };
    const waiting: StoredStatus = { status: "snoozed", changedAt: at(3), until: "2026-10-30T09:00:00Z" };
    const pr = assigned({ kind: "pr", threads: [thread] });
    expect(withRules(pr, { assignedFeedback: false }, waiting)).toMatchObject({ bucket: "inbox", status: "snoozed", asks: ["reply"] });
    expect(withRules({ ...pr, comments: [comment("alice", "inline", 4)] }).asks).toEqual(["feedback"]);
  });

  it("brings an own item closed by someone else into the inbox until filed", () => {
    const closed = own({ closed: { state: "closed", at: at(3) }, activities: [{ kind: "state", at: at(3), actor: "bob", change: "closed" }] });
    expect(withRules(closed)).toMatchObject({ bucket: "inbox", asks: ["closed"], closedBy: "bob" });
    expect(withRules(closed, { ownClosed: false }).bucket).toBe("involved");
    expect(withRules(closed, {}, undefined, at(4)).bucket).toBe("involved");
  });
});

describe("a new assignment or a reopen on GitHub", () => {
  const assigned = (overrides: Partial<Item> = {}) => item({ reasons: ["assigned", "involved"], assignees: ["me"], ...overrides });
  const assignedBy = (actor: string, day: number) => ({ kind: "assigned" as const, at: `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`, actor, assignee: ME });
  const reopenedBy = (actor: string, day: number) => ({ kind: "state" as const, at: `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`, actor, change: "reopened" as const });
  const handoff: StoredStatus = { ...done(4), handoff: { boards: {}, prs: [] } };

  it("resets a done after a later assignment by someone else, and asks the caller to delete it", () => {
    const result = run(assigned({ activities: [assignedBy("alice", 6)] }), done(4));
    expect(result).toMatchObject({ bucket: "assigned", status: "open", statusReset: true, renewed: true, statusAt: null });
  });

  it("keeps a done from after the assignment, and one the viewer made themselves", () => {
    expect(run(assigned({ activities: [assignedBy("alice", 2)] }), done(4))).toMatchObject({ status: "done", statusReset: false });
    expect(run(assigned({ activities: [assignedBy(ME, 6)] }), done(4))).toMatchObject({ status: "done", statusReset: false });
  });

  it("resets a handed-off part when the viewer was assigned anew, not when they were unassigned", () => {
    expect(run(assigned({ activities: [assignedBy("alice", 6)] }), handoff)).toMatchObject({ bucket: "assigned", status: "open", statusReset: true, renewed: true });
    expect(run(assigned({ activities: [assignedBy("alice", 2)] }), handoff)).toMatchObject({ status: "done", updates: [], statusReset: false });
    expect(run(item({ activities: [assignedBy("alice", 6)] }), handoff)).toMatchObject({ statusReset: false });
  });

  it("brings a finished item back with the reopened ask after a reopen by someone else", () => {
    const answered = item({ comments: [comment("bob", "@me look", 2), comment(ME, "done", 3)], activities: [reopenedBy("bob", 6)] });
    expect(run(answered, done(4))).toMatchObject({ bucket: "inbox", asks: ["reopened"], statusReset: true });
    expect(run(answered, { status: "open", changedAt: "2026-10-07T00:00:00Z" })).toMatchObject({ bucket: "inbox", asks: ["reopened"] });
    expect(run(answered, done(7))).toMatchObject({ bucket: "done", asks: [] });
    expect(run(item({ comments: answered.comments, activities: [reopenedBy(ME, 6)] }), done(4))).toMatchObject({ statusReset: false, asks: [] });
  });

  it("counts a reopen as an update on a handed-off part", () => {
    expect(run(assigned({ activities: [reopenedBy("bob", 6)] }), handoff)).toMatchObject({ bucket: "inbox", status: "done", asks: ["update"], updates: [{ kind: "reopened", by: "bob" }] });
    expect(run(assigned({ activities: [reopenedBy("bob", 3)] }), handoff).updates).toEqual([]);
  });
});
