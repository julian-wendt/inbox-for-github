import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "./i18n";
import { reactionLabel } from "./reactions";

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
