import { describe, expect, it } from "vitest";
import { classify } from "../classify";
import { ruleSwitches } from "../rules";
import { toBoards } from "./boards";
import { reasonsOf, toItem, type RawItem } from "./fetch";

function rawPr(overrides: Partial<RawItem> = {}): RawItem {
  return {
    __typename: "PullRequest",
    id: "PR_1",
    number: 7,
    title: "Add export",
    url: "https://github.com/octo-org/app/pull/7",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-05T00:00:00Z",
    body: "Adds the export",
    author: { login: "alice" },
    repository: { nameWithOwner: "octo-org/app" },
    labels: { nodes: [] },
    assignees: { nodes: [] },
    comments: { nodes: [{ author: { login: "carol" }, body: "Nice", createdAt: "2026-10-02T00:00:00Z" }] },
    ...overrides,
  };
}

describe("toItem", () => {
  it("merges review summaries and inline comments into the comments, by time", () => {
    const item = toItem(
      rawPr({
        reviews: {
          nodes: [
            { author: { login: "bob" }, body: "Two nits", state: "COMMENTED", submittedAt: "2026-10-03T00:00:00Z" },
            { author: { login: "bob" }, body: "", state: "COMMENTED", submittedAt: "2026-10-03T00:00:01Z" },
            { author: { login: "dave" }, body: "draft", state: "COMMENTED", submittedAt: null },
          ],
        },
        reviewThreads: {
          nodes: [
            {
              path: "src/app.ts",
              line: null,
              originalLine: 42,
              comments: { nodes: [{ author: { login: "bob" }, body: "@me why?", createdAt: "2026-10-04T00:00:00Z" }] },
            },
          ],
        },
      }),
    );

    expect(item.comments.map((c) => [c.author, c.where])).toEqual([
      ["carol", undefined],
      ["bob", "Review"],
      ["bob", "src/app.ts:42"],
    ]);
    expect(item.comments.map((c) => c.reviewState)).toEqual([undefined, "COMMENTED", undefined]);
  });

  it("keeps review links and each thread's state, with its comments' links, review and whether they answer", () => {
    const item = toItem(
      rawPr({
        reviews: { nodes: [{ id: "R_1", url: "https://github.com/octo-org/app/pull/7#pullrequestreview-1", author: { login: "bob" }, body: "", state: "CHANGES_REQUESTED", submittedAt: "2026-10-03T00:00:00Z" }] },
        reviewThreads: {
          nodes: [
            {
              path: "src/app.ts",
              line: 3,
              originalLine: 3,
              isResolved: true,
              isOutdated: false,
              resolvedBy: { login: "alice" },
              comments: {
                nodes: [
                  { author: { login: "bob" }, body: "rename", createdAt: "2026-10-03T00:00:00Z", url: "u1", replyTo: null, pullRequestReview: { id: "R_1" } },
                  { author: { login: "alice" }, body: "done", createdAt: "2026-10-04T00:00:00Z", url: "u2", replyTo: { id: "C_1" }, pullRequestReview: { id: "R_2" } },
                ],
              },
            },
          ],
        },
      }),
    );

    expect(item.reviews).toEqual([{ author: "bob", at: "2026-10-03T00:00:00Z", id: "R_1", state: "CHANGES_REQUESTED", url: "https://github.com/octo-org/app/pull/7#pullrequestreview-1" }]);
    expect(item.threads).toEqual([
      {
        resolved: true,
        resolvedBy: "alice",
        outdated: false,
        comments: [
          { author: "bob", at: "2026-10-03T00:00:00Z", url: "u1", review: "R_1", reply: false },
          { author: "alice", at: "2026-10-04T00:00:00Z", url: "u2", review: "R_2", reply: true },
        ],
      },
    ]);
  });

  it("maps state changes, force pushes and dismissals, and drops the closing that comes with a merge", () => {
    const actor = { login: "lukas" };
    const item = toItem(
      rawPr({
        timelineItems: {
          nodes: [
            { __typename: "ConvertToDraftEvent", createdAt: "2026-10-02T00:00:00Z", actor, url: "u-draft" },
            { __typename: "HeadRefForcePushedEvent", createdAt: "2026-10-03T00:00:00Z", actor },
            { __typename: "ReviewDismissedEvent", createdAt: "2026-10-04T00:00:00Z", actor, url: "u-dis", review: { author: { login: "bob" } } },
            { __typename: "MergedEvent", createdAt: "2026-10-05T00:00:00Z", actor, url: "u-merge" },
            { __typename: "ClosedEvent", createdAt: "2026-10-05T00:00:01Z", actor, url: "u-close" },
          ],
        },
      }),
    );
    expect(item.activities).toEqual([
      { kind: "state", at: "2026-10-02T00:00:00Z", actor: "lukas", change: "draft", url: "u-draft" },
      { kind: "force-pushed", at: "2026-10-03T00:00:00Z", actor: "lukas" },
      { kind: "dismissed", at: "2026-10-04T00:00:00Z", actor: "lukas", reviewer: "bob", url: "u-dis" },
      { kind: "state", at: "2026-10-05T00:00:00Z", actor: "lukas", change: "merged", url: "u-merge" },
    ]);
  });

  it("reads commits from their own window, so many commits cannot push events out", () => {
    const item = toItem(
      rawPr({
        timelineItems: { nodes: [{ __typename: "ReviewRequestedEvent", createdAt: "2026-10-02T00:00:00Z", actor: { login: "lukas" }, requestedReviewer: { login: "me" } }] },
        commitItems: { nodes: [{ commit: { committedDate: "2026-10-03T00:00:00Z" } }] },
      }),
    );
    expect(item.activities.map((a) => a.kind)).toEqual(["review-requested", "commit"]);
    expect(item.reviewRequests).toEqual([{ reviewer: "me", at: "2026-10-02T00:00:00Z" }]);
  });

  it("maps an issue's closing reason, linked pull requests and duplicates", () => {
    const actor = { login: "anna" };
    const item = toItem(
      rawPr({
        __typename: "Issue",
        assignments: {
          nodes: [
            { __typename: "ConnectedEvent", createdAt: "2026-10-02T00:00:00Z", actor, source: { number: 9, url: "pr-9" }, subject: {} },
            { __typename: "MarkedAsDuplicateEvent", createdAt: "2026-10-03T00:00:00Z", actor, canonical: { number: 4, url: "i-4" } },
            { __typename: "ClosedEvent", createdAt: "2026-10-03T00:00:01Z", actor, url: "u-close", stateReason: "DUPLICATE" },
          ],
        },
      }),
    );
    expect(item.activities).toEqual([
      { kind: "linked", at: "2026-10-02T00:00:00Z", actor: "anna", number: 9, url: "pr-9" },
      { kind: "duplicate", at: "2026-10-03T00:00:00Z", actor: "anna", number: 4, url: "i-4" },
      { kind: "state", at: "2026-10-03T00:00:01Z", actor: "anna", change: "closed", reason: "DUPLICATE", url: "u-close" },
    ]);
  });

  it("puts a pull request under Antworten when the mention is in an inline comment", () => {
    const item = toItem(
      rawPr({
        reviewThreads: {
          nodes: [
            {
              path: "src/app.ts",
              line: 3,
              originalLine: 3,
              comments: { nodes: [{ author: { login: "bob" }, body: "@me can you check?", createdAt: "2026-10-04T00:00:00Z" }] },
            },
          ],
        },
      }),
    );
    item.reasons = ["mentioned", "review"];

    const result = classify(item, "me", undefined, ruleSwitches());

    expect(result.bucket).toBe("inbox");
    expect(result.mention?.by).toBe("bob");
  });

  it("keeps review requests, every submitted review and bot authors", () => {
    const item = toItem(
      rawPr({
        reviews: {
          nodes: [
            { author: { login: "me" }, body: "", state: "COMMENTED", submittedAt: "2026-10-03T00:00:00Z" },
            {
              author: { login: "copilot-pull-request-reviewer", __typename: "Bot", avatarUrl: "https://avatars.githubusercontent.com/in/946600?v=4" },
              body: "Summary",
              state: "COMMENTED",
              submittedAt: "2026-10-02T00:00:00Z",
            },
          ],
        },
        isDraft: true,
        timelineItems: {
          nodes: [
            { __typename: "ReviewRequestedEvent", createdAt: "2026-10-01T00:00:00Z", requestedReviewer: { login: "me" } },
            { __typename: "ReviewRequestedEvent", createdAt: "2026-10-01T00:00:01Z", requestedReviewer: { slug: "security" } },
            { __typename: "ReviewRequestedEvent", createdAt: "2026-10-01T00:00:02Z", requestedReviewer: {} },
            {},
          ],
        },
      }),
    );

    expect(item.draft).toBe(true);
    expect(item.reviewRequests).toEqual([
      { reviewer: "me", at: "2026-10-01T00:00:00Z" },
      { reviewer: "team:security", at: "2026-10-01T00:00:01Z" },
    ]);
    expect(item.reviews.map((r) => r.author)).toEqual(["me", "copilot-pull-request-reviewer[bot]"]);
    expect(item.avatars).toEqual({ "copilot-pull-request-reviewer[bot]": "https://avatars.githubusercontent.com/in/946600?v=4" });
  });

  it("maps pull request state", () => {
    const item = toItem(
      rawPr({
        baseRefName: "main",
        headRefName: "fix/offset",
        mergeable: "CONFLICTING",
        additions: 14,
        deletions: 6,
      }),
    );

    expect(item.pull).toEqual({
      base: "main",
      head: "fix/offset",
      additions: 14,
      deletions: 6,
      conflicts: true,
    });
  });

  it("collects assignments, review requests, silent reviews and commits as activities", () => {
    const item = toItem(
      rawPr({
        timelineItems: {
          nodes: [
            { __typename: "PullRequestCommit", commit: { committedDate: "2026-10-01T10:00:00Z" } },
            { __typename: "PullRequestCommit", commit: { committedDate: "2026-10-01T10:30:00Z", author: { user: { login: "alice" } } } },
            { __typename: "ReviewRequestedEvent", createdAt: "2026-10-01T11:00:00Z", actor: { login: "alice" }, requestedReviewer: { login: "me" } },
            { __typename: "AssignedEvent", createdAt: "2026-10-01T12:00:00Z", actor: { login: "alice" }, assignee: { login: "me" } },
            { __typename: "UnassignedEvent", createdAt: "2026-10-01T13:00:00Z", actor: { login: "me" }, assignee: { login: "me" } },
          ],
        },
        reviews: {
          nodes: [
            { author: { login: "bob" }, body: "", state: "APPROVED", submittedAt: "2026-10-02T00:00:00Z" },
            { author: { login: "carol" }, body: "Looks good", state: "APPROVED", submittedAt: "2026-10-03T00:00:00Z" },
          ],
        },
      }),
    );

    expect(item.activities).toEqual([
      { kind: "commit", at: "2026-10-01T10:00:00Z" },
      { kind: "commit", at: "2026-10-01T10:30:00Z", author: "alice" },
      { kind: "review-requested", at: "2026-10-01T11:00:00Z", actor: "alice", reviewer: "me" },
      { kind: "assigned", at: "2026-10-01T12:00:00Z", actor: "alice", assignee: "me" },
      { kind: "unassigned", at: "2026-10-01T13:00:00Z", actor: "me", assignee: "me" },
      { kind: "reviewed", at: "2026-10-02T00:00:00Z", actor: "bob", state: "APPROVED" },
    ]);
    expect(item.reviewRequests).toEqual([{ reviewer: "me", at: "2026-10-01T11:00:00Z" }]);
  });

  it("marks closed and merged items, and leaves open ones unmarked", () => {
    expect(toItem(rawPr({ closed: true, closedAt: "2026-10-06T00:00:00Z", merged: true })).closed).toEqual({ state: "merged", at: "2026-10-06T00:00:00Z" });
    expect(toItem({ ...rawPr({ closed: true, closedAt: "2026-10-06T00:00:00Z" }), __typename: "Issue" }).closed).toEqual({ state: "closed", at: "2026-10-06T00:00:00Z" });
    expect(toItem(rawPr()).closed).toBeNull();
  });

  it("keeps the open pull requests that would close an issue", () => {
    const issue = toItem({ ...rawPr(), __typename: "Issue", closedByPullRequestsReferences: { nodes: [{ number: 9, url: "https://github.com/octo-org/app/pull/9", isDraft: true, author: { login: "me" } }] } });
    expect(issue.linkedPrs).toEqual([{ number: 9, url: "https://github.com/octo-org/app/pull/9", draft: true, author: "me" }]);
    expect(toItem(rawPr()).linkedPrs).toEqual([]);
  });

  it("keeps an issue's type, and null without one", () => {
    expect(toItem({ ...rawPr(), __typename: "Issue", issueType: { name: "Bug", color: "RED" } }).issueType).toEqual({ name: "Bug", color: "RED" });
    expect(toItem({ ...rawPr(), __typename: "Issue", issueType: null }).issueType).toBeNull();
    expect(toItem(rawPr()).issueType).toBeNull();
  });

  it("leaves issues without review data unchanged", () => {
    const item = toItem({ ...rawPr(), __typename: "Issue" });
    expect(item.comments).toEqual([{ author: "carol", body: "Nice", createdAt: "2026-10-02T00:00:00Z" }]);
    expect(item.reviewRequests).toEqual([]);
  });
});

describe("reasonsOf", () => {
  it("reads assignment and mention from the item, case-insensitively", () => {
    const item = toItem(rawPr({ assignees: { nodes: [{ login: "Me" }] }, body: "cc @me" }));
    expect(reasonsOf(item, "me")).toEqual(["assigned", "mentioned"]);
    expect(reasonsOf(toItem(rawPr()), "me")).toEqual([]);
  });
});

describe("toBoards", () => {
  it("takes each board's Status, first iteration and other fields", () => {
    const boards = toBoards({
      id: "I_1",
      projectItems: {
        nodes: [
          {
            project: { id: "PVT_1", title: "Roadmap" },
            fieldValues: {
              nodes: [
                {},
                { name: "Backlog", color: "GREEN", field: { id: "F_status", name: "Status" } },
                { name: "API", color: "BLUE", field: { id: "F_comp", name: "Component" } },
                { title: "Sprint 2026-11", field: { id: "F_sprint", name: "Sprint" } },
                { number: 24, field: { id: "F_est", name: "Estimation in h" } },
                { text: "Something", field: { id: "F_title", name: "Title" } },
              ],
            },
          },
          { project: { id: "PVT_2", title: "Roadmap" }, fieldValues: { nodes: [] } },
          { project: null, fieldValues: { nodes: [] } },
        ],
      },
    });
    expect(boards).toEqual([
      {
        id: "PVT_1",
        title: "Roadmap",
        status: "Backlog",
        statusColor: "GREEN",
        sprint: "Sprint 2026-11",
        fields: [
          { id: "F_comp", name: "Component", kind: "select", value: "API", color: "BLUE" },
          { id: "F_sprint", name: "Sprint", kind: "iteration", value: "Sprint 2026-11" },
          { id: "F_est", name: "Estimation in h", kind: "number", value: "24" },
        ],
      },
      { id: "PVT_2", title: "Roadmap", status: null, sprint: null, fields: [] },
    ]);
  });
});
