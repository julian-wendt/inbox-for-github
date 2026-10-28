import { describe, expect, it } from "vitest";
import type { Classified } from "../classify";
import type { Item } from "../model";
import { arrivals, notificationTitle, notifies, notifyReason } from "./attention";
import { setLang } from "./i18n";

setLang("en");

function entry(id: string, overrides: Partial<Classified> = {}): Classified {
  return { item: { id } as Item, bucket: "inbox", status: "open", mention: null, answered: null, asks: ["review"], statusAt: null, statusReset: false, ...overrides };
}

describe("arrivals", () => {
  const due = entry("I_due", { asks: ["due"], statusReset: true });

  it("notifies on the first result only for follow-ups that came due while the app was closed", () => {
    expect(arrivals([entry("I_1"), due], null)).toEqual([due]);
  });

  it("notifies afterwards for every item new in the inbox, and nothing outside it", () => {
    const watched = entry("I_3", { bucket: "involved", asks: [] });
    expect(arrivals([entry("I_1"), entry("I_2"), watched], new Set(["I_1"])).map((c) => c.item.id)).toEqual(["I_2"]);
  });

});

describe("notificationTitle", () => {
  const at = "2026-10-05T00:00:00Z";

  it("says the follow-up is due before anything else", () => {
    expect(notificationTitle({ asks: ["due", "mention"], mention: { by: "bob", at, excerpt: "", self: false } })).toBe("Follow-up due");
  });

  it("names who mentioned the viewer, their own self-mention, or a review request", () => {
    expect(notificationTitle({ asks: ["mention"], mention: { by: "bob", at, excerpt: "", self: false } })).toBe("bob mentioned you");
    expect(notificationTitle({ asks: ["mention"], mention: { by: "me", at, excerpt: "", self: true } })).toBe("Self-mention");
    expect(notificationTitle({ asks: ["review"], mention: null })).toBe("Review requested");
  });
});

describe("notifyReason", () => {
  const at = "2026-10-05T00:00:00Z";

  it("files a due follow-up and the viewer's own notes before mentions and reviews", () => {
    expect(notifyReason({ asks: ["due", "mention"], mention: { by: "bob", at, excerpt: "", self: false } })).toBe("due");
    expect(notifyReason({ asks: ["mention"], mention: { by: "me", at, excerpt: "", self: true } })).toBe("reminder");
    expect(notifyReason({ asks: ["update"], mention: null })).toBe("update");
    expect(notifyReason({ asks: ["review"], mention: null })).toBe("review");
    expect(notifyReason({ asks: ["mention"], mention: { by: "bob", at, excerpt: "", self: false } })).toBe("mention");
  });

  it("lets every reason notify unless switched off", () => {
    expect(notifies("review", {})).toBe(true);
    expect(notifies("review", { review: false })).toBe(false);
  });
});
