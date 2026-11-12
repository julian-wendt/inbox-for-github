import { describe, expect, it } from "vitest";
import { settleDraft } from "./drafts";

describe("settleDraft", () => {
  it("drops the draft that was sent", () => {
    const drafts = new Map([["I_1", "Thanks!"]]);
    settleDraft(drafts, "I_1", "Thanks!");
    expect(drafts.has("I_1")).toBe(false);
  });

  it("keeps a newer draft typed while the send was running", () => {
    const drafts = new Map([["I_1", "Thanks! And one more thing"]]);
    settleDraft(drafts, "I_1", "Thanks!");
    expect(drafts.get("I_1")).toBe("Thanks! And one more thing");
  });
});
