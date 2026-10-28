import { describe, expect, it } from "vitest";
import { setLang } from "./i18n";
import { classify } from "../classify";
import type { Item, StoredStatus } from "../model";
import { ruleSwitches } from "../rules";
import { bucketHelp, explain } from "./explain";

setLang("de");

const ME = "me";
const at = (day: number) => `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`;
const comment = (author: string, body: string, day: number) => ({ author, body, createdAt: at(day) });

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "I_1",
    kind: "issue",
    repo: "octo-org/app",
    number: 1,
    title: "Something",
    url: "https://github.com/octo-org/app/issues/1",
    author: "alice",
    body: "Opening post",
    createdAt: at(1),
    updatedAt: at(5),
    labels: [],
    reviewRequests: [],
    draft: false,
    reviews: [],
    threads: [],
    avatars: {},
    pull: null,
    closed: null,
    linkedPrs: [],
    issueType: null,
    activities: [],
    boards: [],
    assignees: [],
    comments: [],
    reasons: ["involved"],
    ...overrides,
  };
}

const why = (i: Item, stored?: StoredStatus) => explain(classify(i, ME, stored, ruleSwitches()), "mention");

describe("explain", () => {
  it("lists every open ask of an inbox item", () => {
    const result = why(
      item({
        kind: "pr",
        reasons: ["assigned", "review", "mentioned"],
        reviewRequests: [{ reviewer: ME, at: at(2) }],
        comments: [comment("bob", "@me can you check?", 3)],
      }),
    );
    expect(result.tone).toBe("inbox");
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatch(/^Dein Review ist angefragt/);
    expect(result.lines[1]).toMatch(/^@bob hat dich .* erwähnt/);
  });

  it("explains an assignment without an ask as being in Assigned to me", () => {
    expect(why(item({ reasons: ["assigned"] }))).toMatchObject({ tone: "assigned", lines: [expect.stringMatching(/^Dir zugewiesen/), expect.any(String)] });
  });

  it("marks a lone self-reminder with the reminder tone", () => {
    expect(why(item({ comments: [comment(ME, "@me later", 2)] })).tone).toBe("reminder");
  });

  it("says why an answered item is done and what brings it back", () => {
    const review = why(item({ kind: "pr", reasons: ["review"], reviewRequests: [{ reviewer: ME, at: at(2) }], comments: [comment(ME, "ok", 3)] }));
    expect(review).toMatchObject({ tone: "done", title: "Erledigt" });
    expect(review.lines[1]).toMatch(/jemand anderes kommentiert/);

    const mention = why(item({ comments: [comment("bob", "@me?", 2), comment(ME, "yes", 3)] }));
    expect(mention.lines).toEqual(["Du hast auf die Erwähnung geantwortet.", expect.stringMatching(/Erwähnung\.$/)]);
  });

  it("explains manual statuses, a reopen and plain involvement", () => {
    expect(why(item(), { status: "snoozed", changedAt: at(4) }).title).toMatch(/^Wiedervorlage seit /);
    expect(why(item(), { status: "done", changedAt: at(4) }).lines[0]).toBe("Von dir als erledigt markiert.");
    const reopened = why(item({ comments: [comment("bob", "@me?", 2), comment(ME, "yes", 3)] }), { status: "open", changedAt: at(4) });
    expect(reopened.lines[0]).toMatch(/^Von dir wieder geöffnet/);
    expect(why(item()).title).toBe("Beobachtet");
  });
});

describe("explain, where the inbox and a stored status meet", () => {
  const waiting: StoredStatus = { status: "snoozed", changedAt: at(4), until: "2026-10-30T09:00:00Z" };

  it("names the ask of an item in the inbox, not the follow-up that waits in place, and then adds that", () => {
    const mentioned = item({ author: ME, comments: [comment("bob", "@me look", 6)] });
    const result = why(mentioned, waiting);
    expect(result.tone).toBe("inbox");
    expect(result.lines[0]).toMatch(/^@bob hat dich .* erwähnt/);
    expect(result.lines.at(-1)).toMatch(/^Seine Wiedervorlage bleibt bis /);
  });

  it("says a follow-up in a table waits there until its date, not that a mention brings it back", () => {
    const result = why(item({ author: ME }), waiting);
    expect(result.tone).toBe("snoozed");
    expect(result.lines[0]).toMatch(/^Wartet in seiner Liste bis /);
  });

  it("explains an update on an item whose part is done as an update", () => {
    const handedOff: StoredStatus = { status: "done", changedAt: at(4), handoff: { boards: {}, prs: [] } };
    const result = why(item({ reasons: ["assigned", "involved"], assignees: [ME], comments: [comment("bob", "news", 6)] }), handedOff);
    expect(result.tone).toBe("inbox");
    expect(result.lines[0]).toMatch(/^Seit dein Teil erledigt ist/);
  });

  it("puts an own pull request that is assigned to the viewer under Created by me", () => {
    const own = item({ kind: "pr", author: ME, reasons: ["assigned", "involved"], assignees: [ME] });
    expect(explain(classify(own, ME, undefined, ruleSwitches()), "mention", ME).tone).toBe("authored");
  });
});

describe("bucketHelp", () => {
  it("describes every bucket and follows the reopen setting", () => {
    for (const bucket of ["inbox", "involved", "snoozed", "done"] as const) {
      expect(bucketHelp(bucket, "mention").points.length).toBeGreaterThan(0);
    }
    expect(bucketHelp("snoozed", "any-post").points[0]).toMatch(/jemand anderes kommentiert/);
  });
});
