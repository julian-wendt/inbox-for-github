import { describe, expect, it } from "vitest";
import type { Classified } from "../classify";
import type { Item, Reason } from "../model";
import { matchesAsk } from "./inboxFilter";

const entry = (reasons: Reason[], asks: Classified["asks"], mentioned = false, bucket: Classified["bucket"] = "inbox") => ({
  item: { reasons, body: "", comments: mentioned ? [{ author: "bob", body: "@me look", createdAt: "2026-10-02T00:00:00Z" }] : [] } as unknown as Item,
  asks,
  bucket,
  mention: mentioned && bucket === "inbox" ? { by: "bob", at: "2026-10-02T00:00:00Z", excerpt: "", self: false } : null,
});

describe("matchesAsk", () => {
  it("splits review requests from mentions", () => {
    const review = entry(["review"], ["review"]);
    const mention = entry(["mentioned"], ["mention"], true);
    expect([matchesAsk(review, "review", "me"), matchesAsk(review, "mention", "me")]).toEqual([true, false]);
    expect([matchesAsk(mention, "review", "me"), matchesAsk(mention, "mention", "me")]).toEqual([false, true]);
  });

  it("shows an item waiting for both under both, and everything under all", () => {
    const both = entry(["review", "mentioned"], ["review", "mention"], true);
    expect([matchesAsk(both, "review", "me"), matchesAsk(both, "mention", "me"), matchesAsk(both, "all", "me")]).toEqual([true, true, true]);
  });

  it("files a due snooze by what it was about", () => {
    expect(matchesAsk(entry(["review"], ["due"]), "review", "me")).toBe(true);
    expect(matchesAsk(entry(["involved"], ["due"]), "mention", "me")).toBe(true);
  });

  it("files new commits after a review under reviews, without a pending request", () => {
    const pushed = entry(["involved"], ["commits"]);
    expect([matchesAsk(pushed, "review", "me"), matchesAsk(pushed, "mention", "me")]).toEqual([true, false]);
  });

  it("outside the inbox, follows the review request or a mention of the viewer", () => {
    const answered = entry(["review"], [], false, "done");
    const mentioned = entry(["mentioned"], [], true, "snoozed");
    const assigned = entry(["assigned"], [], false, "done");
    expect([matchesAsk(answered, "review", "me"), matchesAsk(answered, "mention", "me")]).toEqual([true, false]);
    expect([matchesAsk(mentioned, "review", "me"), matchesAsk(mentioned, "mention", "me")]).toEqual([false, true]);
    expect([matchesAsk(assigned, "review", "me"), matchesAsk(assigned, "mention", "me"), matchesAsk(assigned, "all", "me")]).toEqual([false, false, true]);
  });
});
