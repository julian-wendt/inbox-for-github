import { describe, expect, it } from "vitest";
import { setLang } from "./i18n";
import type { Classified } from "../classify";
import type { Item } from "../model";
import { agoInSentence, compactAgo, firstLine, nextOf, openedText, rowContext, itemLink, statusesFor, sortTime, viewOf, VIEWS } from "./labels";

setLang("de");


describe("rowContext", () => {
  const item = { author: "alice", comments: [] as Item["comments"], reasons: [] as Item["reasons"] } as Item;
  const at = "2026-10-05T00:00:00Z";

  it("names who mentioned the viewer, or the viewer's own self-mention", () => {
    expect(rowContext({ item, answered: null, mention: { by: "bob", at, excerpt: "", self: false } })).toBe("@bob hat dich erwähnt");
    expect(rowContext({ item, answered: null, mention: { by: "me", at, excerpt: "", self: true } })).toBe("Deine Selbst-Erwähnung");
  });

  it("names who pushed since the viewer's review", () => {
    expect(rowContext({ item, answered: null, mention: null, asks: ["commits"], pushedBy: ["alice"] })).toBe("Neue Commits von alice");
    expect(rowContext({ item, answered: null, mention: null, asks: ["commits"], pushedBy: ["bob", "alice"] })).toBe("Neue Commits von alice und anderen");
  });

  it("falls back to the search reason, then to the last poster", () => {
    const base: Pick<Classified, "item" | "mention" | "answered"> = {
      item: { ...item, reasons: ["review", "assigned"] },
      mention: null,
      answered: null,
    };
    expect(rowContext(base)).toBe("Review angefragt");
    expect(rowContext({ ...base, requestedBy: "alice" })).toBe("Review angefragt von alice");
    expect(rowContext({ ...base, answered: "review" })).toBe("Review beantwortet");
    expect(rowContext({ ...base, answered: "mention" })).toBe("Beantwortet");
    expect(rowContext({ ...base, item: { ...item, reasons: ["assigned"] } })).toBe("Dir zugewiesen");
    expect(rowContext({ ...base, item: { ...item, reasons: ["assigned"] }, assignedBy: "bob" })).toBe("Dir zugewiesen von bob");
    expect(rowContext({ ...base, item })).toBe("eröffnet von alice");
    const commented = { ...item, comments: [{ author: "carol", body: "", createdAt: at }] };
    expect(rowContext({ ...base, item: commented })).toBe("carol hat kommentiert");
  });
});

describe("compactAgo", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const before = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it("uses the largest whole unit, rounded down", () => {
    expect(compactAgo(before(30), now)).toBe("jetzt");
    expect(compactAgo(before(12 * 60), now)).toBe("12min");
    expect(compactAgo(before(3.9 * 3600), now)).toBe("3h");
    expect(compactAgo(before(2.5 * 86_400), now)).toBe("2D");
    expect(compactAgo(before(13 * 86_400), now)).toBe("1W");
    expect(compactAgo(before(65 * 86_400), now)).toBe("2M");
    expect(compactAgo(before(400 * 86_400), now)).toBe("1Y");
  });

  it("treats future timestamps as now", () => {
    expect(compactAgo(before(-600), now)).toBe("jetzt");
  });
});

describe("firstLine", () => {
  it("skips comments and markup", () => {
    expect(firstLine("<!-- zizmor-findings-report -->\n## 🌈 zizmor scan results\n\n✅ no issues")).toBe("🌈 zizmor scan results");
    expect(firstLine("> **Note** read this")).toBe("Note read this");
    expect(firstLine("")).toBe("");
  });
});

describe("agoInSentence", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

  it("rephrases the bare words that do not follow a verb", () => {
    expect(agoInSentence(daysAgo(40), now)).toBe("im letzten Monat");
    expect(agoInSentence(daysAgo(8), now)).toBe("vor einer Woche");
    expect(agoInSentence(daysAgo(3), now)).toBe("vor 3 Tagen");
  });
});

describe("English time formats", () => {
  it("speaks English without German rewording", () => {
    setLang("en");
    const now = Date.parse("2026-10-22T12:00:00Z");
    expect(compactAgo(new Date(now).toISOString(), now)).toBe("now");
    expect(agoInSentence(new Date(now - 40 * 86_400_000).toISOString(), now)).toBe("last month");
    setLang("de");
  });
});

describe("itemLink", () => {
  it("formats the URL, the reference and a Markdown link", () => {
    const item = { url: "https://github.com/octo-org/app/pull/7", repo: "octo-org/app", number: 7, title: "Add export" };
    expect(["url", "ref", "markdown"].map((f) => itemLink(item, f as "url"))).toEqual([
      "https://github.com/octo-org/app/pull/7",
      "octo-org/app#7",
      "[Add export (#7)](https://github.com/octo-org/app/pull/7)",
    ]);
  });
});

describe("statusesFor", () => {
  it("offers no status for an item closed on GitHub", () => {
    const item = { reasons: ["assigned"], closed: null } as unknown as Classified["item"];
    expect(statusesFor({ item }).map((s) => s.id)).toEqual(["open", "snoozed", "done"]);
    expect(statusesFor({ item: { ...item, closed: { state: "merged", at: "2026-10-01T00:00:00Z" } } })).toEqual([]);
  });
});

describe("sortTime", () => {
  const item = {
    createdAt: "2026-10-10T00:00:00Z",
    updatedAt: "2026-10-22T00:00:00Z",
    closed: null,
    author: "alice",
    body: "",
    comments: [
      { author: "bob", body: "any news?", createdAt: "2026-10-20T00:00:00Z" },
      { author: "me", body: "done", createdAt: "2026-10-18T00:00:00Z" },
    ],
    reviews: [{ author: "me", at: "2026-10-17T00:00:00Z" }],
    activities: [{ kind: "commit", at: "2026-10-21T00:00:00Z" }],
  } as unknown as Classified["item"];
  const entry = (over: Partial<Classified>) => ({ item, mention: null, statusAt: null, answered: null, ...over }) as Classified;

  it("uses the moment that defines each view", () => {
    expect(sortTime(entry({ bucket: "snoozed", statusAt: "2026-10-15T00:00:00Z" }), "me")).toBe("2026-10-15T00:00:00Z");
    expect(sortTime(entry({ bucket: "done", item: { ...item, closed: { state: "closed", at: "2026-10-19T00:00:00Z" } } }), "me")).toBe("2026-10-19T00:00:00Z");
    expect(sortTime(entry({ bucket: "done", answered: "review" }), "me")).toBe("2026-10-17T00:00:00Z");
    expect(sortTime(entry({ bucket: "done", answered: "mention" }), "me")).toBe("2026-10-18T00:00:00Z");
    expect(sortTime(entry({ bucket: "done", statusAt: "2026-10-16T00:00:00Z" }), "me")).toBe("2026-10-16T00:00:00Z");
    expect(sortTime(entry({ bucket: "inbox" }), "me")).toBe("2026-10-20T00:00:00Z");
  });

  it("leaves out commits and the viewer's own posts, and falls back to the creation", () => {
    const pushed = { ...item, comments: [{ author: "me", body: "pushed a fix", createdAt: "2026-10-21T12:00:00Z" }] };
    expect(sortTime(entry({ bucket: "authored", item: pushed }), "me")).toBe("2026-10-10T00:00:00Z");
    expect(sortTime(entry({ bucket: "authored", item: { ...pushed, author: "me" } }), "me")).toBe("2026-10-10T00:00:00Z");
  });
});

describe("views", () => {
  const entry = (bucket: Classified["bucket"], item: Partial<Item> = {}) =>
    ({ bucket, status: "open", item: { kind: "issue", author: "alice", closed: null, reasons: ["assigned"], ...item } }) as Classified;

  it("offers five views, without Watching and All", () => {
    expect(VIEWS.map((v) => v.id)).toEqual(["inbox", "planned", "done", "assigned", "authored"]);
  });

  it("finds an item's view, none for what the viewer merely takes part in", () => {
    expect(viewOf(entry("inbox"), "me")).toBe("inbox");
    expect(viewOf(entry("snoozed"), "me")).toBe("inbox");
    expect(viewOf(entry("involved", { reasons: ["involved"] }), "me")).toBeNull();
    expect(viewOf(entry("assigned"), "me")).toBe("assigned");
    expect(viewOf(entry("assigned", { kind: "pr", author: "me" }), "me")).toBe("authored");
  });
});

describe("openedText", () => {
  it("names day and month this year, month and year before", () => {
    const now = new Date(2026, 9, 24);
    expect(openedText(new Date(2026, 8, 12).toISOString(), now)).toBe("12. Sept.");
    expect(openedText(new Date(2025, 8, 12).toISOString(), now)).toBe("Sept. 2025");
  });
});

describe("nextOf", () => {
  const kinds = ["all", "issue", "pr"];

  it("steps to the next option and wraps", () => {
    expect(nextOf(kinds, "all")).toBe("issue");
    expect(nextOf(kinds, "issue")).toBe("pr");
    expect(nextOf(kinds, "pr")).toBe("all");
  });

  it("starts at the first option for an unknown one", () => {
    expect(nextOf(kinds, "other")).toBe("all");
  });
});
