import { describe, expect, it } from "vitest";
import { snapshotOf, updatesSince } from "./handoff";
import type { Item } from "./model";

const item = (overrides: Partial<Item> = {}) =>
  ({
    author: "alice",
    body: "",
    createdAt: "2026-10-01T00:00:00Z",
    comments: [],
    reviews: [],
    closed: null,
    boards: [{ id: "B", title: "Roadmap", status: "Review", sprint: null, fields: [] }],
    linkedPrs: [{ number: 12, url: "", draft: false, author: "me" }],
    ...overrides,
  }) as Item;

describe("updatesSince", () => {
  const since = "2026-10-10T00:00:00Z";
  const snap = snapshotOf(item());

  it("finds nothing while the item stays as it was", () => {
    expect(snap).toEqual({ boards: { B: "Review" }, prs: [12] });
    expect(updatesSince(item({ comments: [{ author: "bob", body: "old", createdAt: "2026-10-05T00:00:00Z" }] }), "me", since, snap)).toEqual([]);
  });

  it("reports posts and reviews by others, not the viewer's or bots'", () => {
    const later = item({
      comments: [
        { author: "bob", body: "progress", createdAt: "2026-10-11T00:00:00Z" },
        { author: "me", body: "thanks", createdAt: "2026-10-12T00:00:00Z" },
        { author: "dependabot[bot]", body: "bump", createdAt: "2026-10-12T00:00:00Z" },
      ],
      reviews: [{ author: "carol", at: "2026-10-13T00:00:00Z" }],
    });
    expect(updatesSince(later, "me", since, snap).map((u) => (u.kind === "post" ? u.by : u.kind))).toEqual(["bob", "carol"]);
  });

  it("reports a board status change, a new linked pull request and closing", () => {
    const moved = item({
      boards: [{ id: "B", title: "Roadmap", status: "Done", sprint: null, fields: [] }],
      linkedPrs: [
        { number: 12, url: "", draft: false, author: "me" },
        { number: 15, url: "", draft: true, author: "bob" },
      ],
      closed: { state: "closed", at: "2026-10-14T00:00:00Z" },
    });
    expect(updatesSince(moved, "me", since, snap)).toEqual([
      { kind: "closed", state: "closed", at: "2026-10-14T00:00:00Z" },
      { kind: "board", board: "Roadmap", from: "Review", to: "Done" },
      { kind: "pr", number: 15 },
    ]);
  });

  it("ignores boards that are not loaded now", () => {
    expect(updatesSince(item({ boards: [] }), "me", since, snap)).toEqual([]);
  });
});
