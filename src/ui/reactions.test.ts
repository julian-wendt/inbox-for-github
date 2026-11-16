import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "./i18n";
import type { Item } from "../model";
import { reactionLabel, withReaction } from "./reactions";

describe("reactionLabel", () => {
  afterEach(() => setLang("en"));

  it("counts the others and names the viewer first", () => {
    setLang("en");
    expect(reactionLabel({ content: "HEART", count: 1, mine: false })).toBe("1 person reacted with ❤️");
    expect(reactionLabel({ content: "HEART", count: 4, mine: false })).toBe("4 people reacted with ❤️");
    expect(reactionLabel({ content: "EYES", count: 1, mine: true })).toBe("You reacted with 👀");
    expect(reactionLabel({ content: "EYES", count: 2, mine: true })).toBe("You and 1 other reacted with 👀");
    expect(reactionLabel({ content: "EYES", count: 3, mine: true })).toBe("You and 2 others reacted with 👀");
  });

  it("speaks German", () => {
    setLang("de");
    expect(reactionLabel({ content: "THUMBS_UP", count: 3, mine: true })).toBe("Du und 2 weitere habt mit 👍 reagiert");
  });
});

describe("withReaction", () => {
  const item = {
    id: "I_1",
    reactions: [{ content: "EYES", count: 1, mine: false }],
    comments: [{ id: "IC_1", author: "alice", body: "Shipped", createdAt: "2026-10-02T00:00:00Z", reactions: [{ content: "HEART", count: 2, mine: true }] }, { author: "bob", body: "Old cache", createdAt: "2026-10-03T00:00:00Z" }],
  } as unknown as Item;

  it("counts the viewer in on the description, a new emoji in GitHub's order", () => {
    expect(withReaction(item, "I_1", "THUMBS_UP", true).reactions).toEqual([{ content: "THUMBS_UP", count: 1, mine: true }, { content: "EYES", count: 1, mine: false }]);
    expect(withReaction(item, "I_1", "EYES", true).reactions).toEqual([{ content: "EYES", count: 2, mine: true }]);
  });

  it("takes the viewer out of a comment's pill and drops one left at 0, leaving other posts alone", () => {
    const once = withReaction(item, "IC_1", "HEART", false);
    expect(once.comments[0].reactions).toEqual([{ content: "HEART", count: 1, mine: false }]);
    expect(once.comments[1]).toBe(item.comments[1]);
    expect(once.reactions).toBe(item.reactions);
    const solo = withReaction(withReaction(item, "IC_1", "ROCKET", true), "IC_1", "ROCKET", false);
    expect(solo.comments[0].reactions).toEqual(item.comments[0].reactions);
  });

  it("leaves a post alone that already shows the change, so a fetch can take it again", () => {
    expect(withReaction(item, "IC_1", "HEART", true)).toBe(item);
    expect(withReaction(item, "I_1", "EYES", false)).toBe(item);
  });
});
