import { describe, expect, it } from "vitest";
import type { Classified } from "../classify";
import { repoList } from "./repoList";

function entry(repo: string, bucket: Classified["bucket"], extra: object = {}): Classified {
  const item = { repo, author: "me", createdAt: "2026-10-01T00:00:00Z", assignees: [], reasons: [], boards: [], linkedPrs: [], reviewRequests: [], reviews: [], kind: "issue", draft: false, closed: null };
  return { item, bucket, status: "open", ...extra } as unknown as Classified;
}

describe("repoList", () => {
  it("counts the items of the counting views, busiest repo first", () => {
    const list = repoList([entry("o/a", "inbox"), entry("o/b", "inbox"), entry("o/b", "authored")], "me");
    expect(list).toEqual([["o/b", 2], ["o/a", 1]]);
  });

  it("keeps a repo whose only item sits in Follow-ups or Done, with a count of 0", () => {
    const list = repoList([entry("o/a", "inbox"), entry("o/b", "snoozed"), entry("o/c", "done")], "me");
    expect(list).toEqual([["o/a", 1], ["o/b", 0], ["o/c", 0]]);
  });

  it("counts a repo's assigned items the way the view does, without the parked bars", () => {
    const mine = (repo: string, extra: object) => {
      const e = entry(repo, "assigned", extra);
      e.item.reasons = ["assigned"];
      return e;
    };
    const list = repoList([mine("o/a", { status: "snoozed" }), mine("o/a", { updates: [] }), mine("o/a", {}), mine("o/b", { status: "snoozed" })], "me");
    expect(list).toEqual([["o/a", 1], ["o/b", 0]]);
  });

  it("leaves out items that show in no view", () => {
    expect(repoList([entry("o/a", "involved")], "me")).toEqual([]);
  });
});
