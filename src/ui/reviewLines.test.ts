import { describe, expect, it } from "vitest";
import type { Review, ReviewThread } from "../model";
import { reviewLines, reviewNote } from "./reviewLines";

const review = (id: string, state: Review["state"], at: string, author = "lukas"): Review => ({ id, state, at, author, url: `https://github.com/o/r/pull/1#pullrequestreview-${id}` });
const thread = (opener: string, resolved = false, replyBy?: string, outdated = false): ReviewThread => ({
  resolved,
  resolvedBy: resolved ? "alice" : null,
  outdated,
  comments: [
    { author: "lukas", at: "2026-10-20T10:00:00Z", url: `c-${opener}`, review: opener, reply: false },
    ...(replyBy ? [{ author: "max", at: "2026-10-21T10:00:00Z", url: `r-${replyBy}`, review: replyBy, reply: true }] : []),
  ],
});

describe("reviewLines", () => {
  it("makes one line per review with its threads, resolved and outdated", () => {
    const [line] = reviewLines({ reviews: [review("R1", "CHANGES_REQUESTED", "2026-10-20T10:00:00Z")], threads: [thread("R1", true), thread("R1"), thread("R1", false, undefined, true)] });
    expect(line).toMatchObject({ kind: "review", state: "CHANGES_REQUESTED", inline: 3, resolved: 1, outdated: 1, done: null, url: "https://github.com/o/r/pull/1#pullrequestreview-R1" });
  });

  it("counts a request for changes as done once every thread is resolved, or its author approved later", () => {
    expect(reviewLines({ reviews: [review("R1", "CHANGES_REQUESTED", "2026-10-20T10:00:00Z")], threads: [thread("R1", true)] })[0].done).toBe("resolved");
    const later = reviewLines({ reviews: [review("R1", "CHANGES_REQUESTED", "2026-10-20T10:00:00Z"), review("R2", "APPROVED", "2026-10-22T10:00:00Z")], threads: [thread("R1")] });
    expect(later.map((l) => l.done)).toEqual(["approved", null]);
  });

  it("marks a dismissed review as done", () => {
    expect(reviewLines({ reviews: [review("R1", "DISMISSED", "2026-10-20T10:00:00Z")], threads: [] })[0].done).toBe("dismissed");
  });

  it("turns a review that only answered in threads into a replies line linking the first reply", () => {
    const lines = reviewLines({
      reviews: [review("R1", "COMMENTED", "2026-10-20T10:00:00Z"), review("R2", "COMMENTED", "2026-10-21T10:00:00Z", "max")],
      threads: [thread("R1", false, "R2"), thread("R1", false, "R2")],
    });
    expect(lines[1]).toMatchObject({ kind: "replies", actor: "max", replies: 2, inline: 0, url: "r-R2" });
  });

  it("leaves out reviews cached before ids were kept", () => {
    expect(reviewLines({ reviews: [{ author: "lukas", at: "2026-10-20T10:00:00Z" }], threads: [] })).toEqual([]);
  });
});

describe("reviewNote", () => {
  const note = (reviews: Review[], threads: ReviewThread[]) => reviewNote(reviewLines({ reviews, threads })[0]);

  it("names the inline comments and how many are resolved or outdated", () => {
    expect(note([review("R1", "CHANGES_REQUESTED", "2026-10-20T10:00:00Z")], [thread("R1", true), thread("R1"), thread("R1", false, undefined, true)])).toBe("3 inline comments (1 of 3 resolved, 1 outdated)");
    expect(note([review("R1", "COMMENTED", "2026-10-20T10:00:00Z")], [thread("R1", true)])).toBe("1 inline comment (all resolved)");
  });

  it("says why a review is done, and nothing for one without threads", () => {
    expect(note([review("R1", "DISMISSED", "2026-10-20T10:00:00Z")], [])).toBe("(dismissed)");
    expect(note([review("R1", "APPROVED", "2026-10-20T10:00:00Z")], [])).toBe("");
  });
});
