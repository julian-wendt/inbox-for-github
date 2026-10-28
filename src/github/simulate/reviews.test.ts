import { describe, expect, it } from "vitest";
import { reviewLines, reviewNote } from "../../ui/reviewLines";
import { HOUR, MINUTE, simulation } from "./vitest";

// Scenarios from TESTING.md: "Reviews im Verlauf".
const sim = simulation();

/** A pull request of alice's that the viewer follows, so it is fetched. */
function followedPr(extra: { author?: string } = {}) {
  const { world } = sim;
  return world.pullRequest({ author: extra.author ?? "alice", assignees: ["octocat"] });
}

describe("Reviews in the timeline", () => {
  it("makes one line per review, however many inline comments it has", async () => {
    const { world, app } = sim;
    const pr = followedPr();
    world.advance(HOUR);
    world.review(pr, "lukas", "CHANGES_REQUESTED", {
      inline: [
        { path: "src/a.ts", line: 3, body: "rename" },
        { path: "src/a.ts", line: 9, body: "extract" },
        { path: "src/b.ts", line: 1, body: "typo" },
      ],
    });
    world.resolveThread(pr, 0, "alice");
    await app.refresh();

    const { item } = app.entry(pr);
    const lines = reviewLines(item);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ actor: "lukas", state: "CHANGES_REQUESTED", inline: 3, resolved: 1, done: null });
    expect(reviewNote(lines[0])).toBe("3 inline comments (1 of 3 resolved)");
    expect(lines[0].url).toContain("#pullrequestreview-");
  });

  it("calls a review done once every thread is resolved, or its author approved later", async () => {
    const { world, app } = sim;
    const pr = followedPr();
    world.review(pr, "lukas", "CHANGES_REQUESTED", { inline: [{ path: "a.ts", line: 1, body: "fix" }] });
    world.resolveThread(pr, 0, "alice");
    const other = followedPr();
    world.advance(MINUTE);
    world.review(other, "max", "CHANGES_REQUESTED", { inline: [{ path: "a.ts", line: 1, body: "fix" }] });
    world.advance(MINUTE);
    world.review(other, "max", "APPROVED");
    await app.refresh();

    expect(reviewLines(app.entry(pr).item)[0]).toMatchObject({ done: "resolved" });
    expect(reviewNote(reviewLines(app.entry(pr).item)[0])).toBe("1 inline comment (all resolved)");
    expect(reviewLines(app.entry(other).item).map((l) => l.done)).toEqual(["approved", null]);
  });

  it("marks a dismissed review and links the dismissal", async () => {
    const { world, app } = sim;
    const pr = followedPr();
    world.review(pr, "lukas", "CHANGES_REQUESTED");
    world.advance(MINUTE);
    world.dismissReview(pr, "alice", "lukas");
    await app.refresh();

    const { item } = app.entry(pr);

    expect(reviewLines(item)[0].done).toBe("dismissed");
    expect(item.activities.find((a) => a.kind === "dismissed")).toMatchObject({ reviewer: "lukas", actor: "alice", url: expect.stringContaining("#event-") as string });
  });

  it("shows replies in existing threads as one line, linked to the first reply", async () => {
    const { world, app } = sim;
    const pr = followedPr({ author: "max" });
    const first = world.review(pr, "lukas", "COMMENTED", { inline: [{ path: "a.ts", line: 1, body: "why?" }, { path: "a.ts", line: 2, body: "and here?" }] });
    world.advance(MINUTE);
    world.replyInThread(pr, 0, "max", "because");
    world.replyInThread(pr, 1, "max", "same reason");
    await app.refresh();

    const lines = reviewLines(app.entry(pr).item);

    expect(first).toMatch(/^PRR_/);
    expect(lines).toHaveLength(1);
    expect(app.entry(pr).item.threads[0].comments.map((c) => c.reply)).toEqual([false, true]);
  });

  it("keeps a review with text as a post, with its verdict, and a silent one as an activity", async () => {
    const { world, app } = sim;
    const pr = followedPr();
    world.review(pr, "lukas", "APPROVED", { body: "Looks great, ship it." });
    world.advance(MINUTE);
    world.review(pr, "max", "APPROVED");
    await app.refresh();

    const { item } = app.entry(pr);

    expect(item.comments).toEqual([expect.objectContaining({ author: "lukas", where: "Review", reviewState: "APPROVED" })]);
    expect(item.activities).toEqual([expect.objectContaining({ kind: "reviewed", actor: "max", state: "APPROVED" })]);
  });

  it("still counts an inline comment that mentions the viewer as a mention", async () => {
    const { world, app } = sim;
    const pr = world.pullRequest({ author: "alice" });
    world.review(pr, "lukas", "COMMENTED", { inline: [{ path: "a.ts", line: 4, body: "@octocat is this intended?" }] });
    await app.refresh();

    expect(app.viewOf(pr)).toBe("inbox");
    expect(app.entry(pr).mention).toMatchObject({ by: "lukas" });
  });
});

describe("Events in the timeline", () => {
  it("records a pull request's life in order: draft, ready, force-pushes, auto-merge, review requests, merge", async () => {
    const { world, app } = sim;
    const pr = world.pullRequest({ author: "alice", draft: true, assignees: ["octocat"] });
    const step = () => world.advance(MINUTE);
    step();
    world.markReady(pr, "alice");
    step();
    world.requestReview(pr, "alice", "lukas");
    step();
    world.withdrawReviewRequest(pr, "alice", "lukas");
    step();
    world.convertToDraft(pr, "alice");
    step();
    world.markReady(pr, "alice");
    step();
    world.forcePush(pr, "alice");
    world.forcePush(pr, "alice");
    step();
    world.enableAutoMerge(pr, "alice");
    step();
    world.merge(pr, "max");
    await app.refresh();

    const kinds = app.entry(pr).item.activities.map((a) => (a.kind === "state" ? `state:${a.change}` : a.kind));

    expect(kinds).toEqual(["state:ready", "review-requested", "review-request-removed", "state:draft", "state:ready", "force-pushed", "force-pushed", "auto-merge", "state:merged"]);
    expect(app.entry(pr).item.closed?.state).toBe("merged");
  });

  it("gives merge, ready, draft and dismissal a link to GitHub, and force-push and reopen none", async () => {
    const { world, app } = sim;
    const pr = world.pullRequest({ author: "alice", assignees: ["octocat"] });
    world.markReady(pr, "alice");
    world.forcePush(pr, "alice");
    world.merge(pr, "max");
    await app.refresh();

    const activities = app.entry(pr).item.activities;
    const urlOf = (change: string) => activities.find((a) => a.kind === "state" && a.change === change);

    expect(urlOf("ready")).toMatchObject({ url: expect.stringContaining("#event-") as string });
    expect(urlOf("merged")).toMatchObject({ url: expect.stringContaining("#event-") as string });
    expect(activities.find((a) => a.kind === "force-pushed")).not.toHaveProperty("url");
  });

  it("shows closing and reopening with the reason, merging without an extra closed line", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "alice", assignees: ["octocat"] });
    world.close(issue, "alice", "NOT_PLANNED");
    world.advance(MINUTE);
    world.reopen(issue, "alice");
    const pr = world.pullRequest({ author: "alice", assignees: ["octocat"] });
    world.merge(pr, "max");
    await app.refresh();

    const states = (ref: typeof issue) => app.entry(ref).item.activities.filter((a) => a.kind === "state").map((a) => [a.kind === "state" && a.change, a.kind === "state" && a.reason]);

    expect(states(issue)).toEqual([["closed", "NOT_PLANNED"], ["reopened", undefined]]);
    expect(states(pr)).toEqual([["merged", undefined]]);
  });

  it("links the pull request of an issue and a duplicate, and shows neither labels nor projects", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "alice", assignees: ["octocat"], labels: [{ name: "bug", color: "d73a4a" }] });
    const pr = world.pullRequest({ author: "max" });
    const canonical = world.issue();
    world.linkPullRequest(issue, pr, "max");
    world.markDuplicate(issue, canonical, "alice");
    world.setBoard(issue, { project: "Roadmap", status: "Backlog" });
    await app.refresh();

    const { item } = app.entry(issue);

    expect(item.activities.map((a) => a.kind)).toEqual(["linked", "duplicate"]);
    expect(item.activities[0]).toMatchObject({ number: world.raw(pr).number, url: world.raw(pr).url });
    expect(item.linkedPrs).toEqual([expect.objectContaining({ author: "max", draft: false })]);
  });

  it("counts commits as activity without text", async () => {
    const { world, app } = sim;
    const pr = followedPr();
    world.commit(pr);
    world.advance(MINUTE);
    world.commit(pr);
    await app.refresh();

    expect(app.entry(pr).item.activities.map((a) => a.kind)).toEqual(["commit", "commit"]);
  });

  it("reads bot comments as bots, with their avatar", async () => {
    const { world, app } = sim;
    const pr = followedPr();
    world.comment(pr, "dependabot[bot]", "Bumps lodash");
    await app.refresh();

    const { item } = app.entry(pr);

    expect(item.comments[0].author).toBe("dependabot[bot]");
    expect(item.avatars["dependabot[bot]"]).toMatch(/^data:image\/svg\+xml,/);
  });
});
