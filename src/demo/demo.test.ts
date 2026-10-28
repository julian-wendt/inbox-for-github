import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installSimulator } from "../github/simulate/server";
import { InboxSession } from "../github/simulate/session";
import { settingsFromAddress } from "./index";
import { MemoryStore } from "./memoryStore";
import { demoSeed } from "./seed";
import { buildDemoWorld, type DemoRefs } from "./world";

let restore: () => void;
let session: InboxSession;
let refs: DemoRefs;

beforeEach(async () => {
  const built = buildDemoWorld();
  refs = built.refs;
  restore = installSimulator(built.world);
  session = new InboxSession(built.world);
  const seed = demoSeed(refs);
  for (const [id, stored] of seed.statuses ?? []) session.statuses.set(id, stored);
  await session.refresh();
});
afterEach(() => restore());

const ids = (...names: (keyof DemoRefs)[]) => names.map((name) => refs[name].id).sort();

describe("the demo world", () => {
  it("fills the inbox with every kind of ask", () => {
    const { inbox } = session.views();

    expect(inbox).toEqual(expect.arrayContaining(ids("retries", "csvExport", "dateFns", "installNote", "tooltip", "rounding")));
    expect(session.entry(refs.installNote).mention?.self).toBe(true);
    expect(session.entry(refs.csvExport).asks).toContain("review");
    expect(session.entry(refs.dateFns).asks).toContain("review");
    expect(session.entry(refs.tooltip).asks).toContain("due");
    expect(session.entry(refs.rounding).asks).toEqual(["update"]);
  });

  it("puts assignments of every type and board status on the plate, own pull requests left out", () => {
    const { assigned } = session.views();

    expect(assigned).toEqual(expect.arrayContaining(ids("leak", "settings", "savedFilters", "statement", "contributing", "rateCache", "signature", "rounding", "syncBackup")));
    expect(assigned).not.toContain(refs.virtualRows.id);
    expect(session.entry(refs.leak).item.issueType?.name).toBe("Bug");
    expect(session.entry(refs.statement).item.boards[0].status).toBe("Blocked");
    expect(session.entry(refs.contributing).item.boards[0].status).toBe("Done");
  });

  it("lists what the viewer opened, including a draft with conflicts and one waiting for its date", () => {
    const { authored } = session.views();

    expect(authored).toEqual(expect.arrayContaining(ids("ownKeys", "virtualRows", "focusTrap", "retryDocs", "syncBackup")));
    expect(session.entry(refs.virtualRows).item.pull?.conflicts).toBe(true);
    expect(session.entry(refs.virtualRows).item.draft).toBe(true);
    expect(session.followUp(refs.ownKeys)).not.toBeNull();
  });

  it("files answered, closed and merged items under Done and waiting ones under Wiedervorlage", () => {
    const views = session.views();

    expect(views.done).toEqual(expect.arrayContaining(ids("sidebarTokens", "xmlPayloads", "glossary", "buildTooling")));
    expect(session.entry(refs.buildTooling).item.closed?.state).toBe("merged");
    expect(session.entry(refs.xmlPayloads).item.closed?.state).toBe("closed");
    expect(views.snoozed.sort()).toEqual(ids("negativeBalances", "frameBudget", "rateHeaders"));
  });

  it("carries timelines with reviews, threads, dismissals, force pushes and bot comments", () => {
    const csv = session.entry(refs.csvExport).item;
    const trap = session.entry(refs.focusTrap).item;

    expect(csv.threads).toHaveLength(3);
    expect(csv.threads.filter((t) => t.resolved)).toHaveLength(1);
    expect(csv.comments.some((c) => c.author === "ci-sentinel[bot]")).toBe(true);
    expect(trap.activities.map((a) => a.kind)).toEqual(expect.arrayContaining(["review-requested", "force-pushed", "dismissed", "reviewed"]));
    expect(session.entry(refs.dateFns).item.reviewRequests.map((r) => r.reviewer)).toEqual(["team:platform"]);
  });

  it("writes Markdown with code and task lists", () => {
    const bodies = [session.entry(refs.retries).item.body, ...session.entry(refs.retries).item.comments.map((c) => c.body)].join("\n");

    expect(bodies).toContain("```ts");
    expect(bodies).toContain("- [x] reproduced on staging");
  });

  it("is made up: no network avatars, and every person is a fictional login", () => {
    const people = new Set(session.items.flatMap((i) => [i.author, ...i.comments.map((c) => c.author), ...i.assignees]));
    const avatars = session.items.flatMap((i) => Object.values(i.avatars));

    expect(avatars.length).toBeGreaterThan(0);
    expect(avatars.every((a) => a.startsWith("data:image/svg+xml,"))).toBe(true);
    expect([...people].sort()).toEqual(["ci-sentinel[bot]", "ines-d", "juniper", "lena-f", "marcus-o", "priya-n", "sam-r", "tobias-k"]);
  });

  it("changes in memory only: a comment appears in the world, nothing else moves", async () => {
    await session.comment(refs.retries, "Backoff cap still applies, I will add the test.");

    expect(session.entry(refs.retries).item.comments.at(-1)?.author).toBe("juniper");
    expect(session.viewOf(refs.retries)).toBe("done");
  });
});

describe("the address", () => {
  it("sets the language and theme of a screenshot run, and ignores anything else", () => {
    expect(settingsFromAddress("?lang=de&theme=light")).toEqual({ language: "de", theme: "light" });
    expect(settingsFromAddress("?lang=fr&theme=pink&x=1")).toEqual({});
    expect(settingsFromAddress("")).toEqual({});
  });
});

describe("the demo seed", () => {
  it("leaves some items unread and seen the rest, with a note and the follow-ups", () => {
    const seed = demoSeed(refs, Date.parse("2026-10-25T12:00:00Z"));

    expect(seed.seen?.has(refs.retries.id)).toBe(false);
    expect(seed.seen?.has(refs.settings.id)).toBe(true);
    expect(seed.notes?.get(refs.csvExport.id)).toContain("Priya");
    expect(seed.statuses?.get(refs.tooltip.id)).toMatchObject({ status: "snoozed", until: "2026-10-25T11:00:00.000Z" });
    expect(seed.statuses?.get(refs.rounding.id)?.handoff).toBeDefined();
    expect(seed.settings).toMatchObject({ notifications: false, dockBadge: false });
  });

  it("starts a store that works like the real one", async () => {
    const store = new MemoryStore(demoSeed(refs));

    await store.setStatus(refs.retries.id, "done");
    await store.markSeen(refs.retries.id);

    expect((await store.statuses()).get(refs.retries.id)?.status).toBe("done");
    expect((await store.seen()).has(refs.retries.id)).toBe(true);
    expect((await store.statusLog()).get(refs.retries.id)).toHaveLength(1);
    await store.undoStatus(refs.retries.id, "open");
    expect((await store.statusLog()).get(refs.retries.id)).toEqual([]);
  });

  it("puts a read state back exactly, with and without a mark", async () => {
    const store = new MemoryStore({ seen: new Map([["a", "2026-10-25T10:00:00Z"]]), unreadMarks: new Map([["b", "2026-10-25T11:00:00Z"]]) });

    await store.markSeen("a");
    await store.markSeen("b");
    await store.restoreRead("a", "2026-10-25T10:00:00Z", undefined);
    await store.restoreRead("b", undefined, "2026-10-25T11:00:00Z");

    expect((await store.seen()).get("a")).toBe("2026-10-25T10:00:00Z");
    expect((await store.seen()).has("b")).toBe(false);
    expect((await store.unreadMarks()).get("b")).toBe("2026-10-25T11:00:00Z");
  });
});
