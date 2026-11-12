import { describe, expect, it, vi } from "vitest";
import { MemoryStore } from "./demo/memoryStore";
import { ASK_RULES_DEFAULT, classify } from "./classify";
import { deriveHandledUntil, handledStep, type Cutoffs } from "./handledUntil";
import type { Comment, Item, StoredStatus } from "./model";
import { ruleSwitches } from "./rules";
import { Store } from "./store";

const load = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load } }));

const ME = "me";
const NOW = Date.parse("2026-10-20T00:00:00Z");
const day = (d: number, hour = 0) => `2026-10-${String(d).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`;
const mention = (d: number): Comment => ({ author: "alice", body: "@me could you look?", createdAt: day(d) });
const stored = (status: StoredStatus["status"], d: number, extra: Partial<StoredStatus> = {}): StoredStatus => ({ status, changedAt: day(d, 12), ...extra });

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "I_1", kind: "issue", repo: "octo-org/app", number: 1, title: "Something", url: "https://github.com/octo-org/app/issues/1", author: "alice", body: "Opening post",
    createdAt: day(1), updatedAt: day(5), labels: [], reviewRequests: [], draft: false, reviews: [], threads: [], avatars: {}, pull: null, closed: null, linkedPrs: [], issueType: null,
    activities: [], boards: [], assignees: [], comments: [], reasons: ["mentioned", "involved"], ...overrides,
  };
}

const cutoffs = (c: Partial<Cutoffs> = {}): Cutoffs => ({ statuses: new Map(), filedAt: {}, plannedAt: {}, dated: new Set(), ...c });

describe("deriveHandledUntil", () => {
  it("takes the latest of filed, planned (while dated), done and follow-up start", () => {
    const derived = deriveHandledUntil(
      cutoffs({
        statuses: new Map([
          ["done", stored("done", 3)],
          ["snooze", stored("snoozed", 4)],
          ["both", stored("done", 6)],
        ]),
        filedAt: { both: day(5, 12), filed: day(2) },
        plannedAt: { planned: day(7), both: day(8) },
        dated: new Set(["planned", "both"]),
      }),
    );
    expect(Object.fromEntries(derived)).toEqual({ done: day(3, 12), snooze: day(4, 12), both: day(8), filed: day(2), planned: day(7) });
  });

  it("ignores a plan time left behind and a hand-off done", () => {
    const derived = deriveHandledUntil(cutoffs({ statuses: new Map([["work", stored("done", 3, { handoff: { boards: {}, prs: [] } })]]), plannedAt: { gone: day(7) } }));
    expect(derived.size).toBe(0);
  });

  it("counts a follow-up without a date and a done on an own item", () => {
    const derived = deriveHandledUntil(cutoffs({ statuses: new Map([["a", stored("snoozed", 3)], ["b", stored("done", 4)]]) }));
    expect([...derived.keys()]).toEqual(["a", "b"]);
  });
});

// With the derived time as the only cutoff, no item changes view. `before` is what `classify` gave
// with the old cutoffs (`plannedAt` while dated, `filedAt`) on main, after the hook wrote back a reset.
describe("the derived time keeps every item where it was", () => {
  const handoff = { boards: {}, prs: [] };
  const answer = (d: number): Comment => ({ author: ME, body: "Will do.", createdAt: day(d, 6) });
  const assigned = { assignees: [ME], reasons: ["assigned", "mentioned"] as Item["reasons"] };
  type View = Pick<ReturnType<typeof classify>, "bucket" | "status" | "asks">;
  const view = (bucket: View["bucket"], status: View["status"], asks: View["asks"] = []): View => ({ bucket, status, asks });
  const scenarios: { name: string; item: Item; status?: StoredStatus; filedAt?: string; plannedAt?: string; dated?: boolean; before: View; changes?: View }[] = [
    { name: "a mention filed with D", item: item({ comments: [mention(3)] }), filedAt: day(4), before: view("done", "done") },
    { name: "a mention newer than D", item: item({ comments: [mention(3), mention(6)] }), filedAt: day(4), before: view("inbox", "open", ["mention"]) },
    { name: "a mention before a plan", item: item({ comments: [mention(3)] }), plannedAt: day(4), dated: true, before: view("planned", "open") },
    { name: "a mention after a plan", item: item({ comments: [mention(6)] }), plannedAt: day(4), dated: true, before: view("inbox", "open", ["mention"]) },
    { name: "a plan time left behind", item: item({ comments: [mention(3)] }), plannedAt: day(4), dated: false, before: view("inbox", "open", ["mention"]) },
    { name: "a stored done on a mention", item: item({ comments: [mention(3)] }), status: stored("done", 4), before: view("done", "done") },
    { name: "a stored done on an own item", item: item({ author: ME, comments: [mention(3)] }), status: stored("done", 4), before: view("done", "done") },
    { name: "a follow-up on a mentioned item", item: item({ comments: [mention(3)] }), status: stored("snoozed", 4, { until: day(25) }), before: view("snoozed", "snoozed") },
    { name: "a follow-up without a date", item: item({ comments: [mention(3)] }), status: stored("snoozed", 4), before: view("snoozed", "snoozed") },
    { name: "a follow-up on an assignment, mention before it", item: item({ ...assigned, comments: [mention(3)] }), status: stored("snoozed", 4, { until: day(25) }), before: view("assigned", "snoozed") },
    { name: "a follow-up on an assignment, mention after it", item: item({ ...assigned, comments: [mention(6)] }), status: stored("snoozed", 4, { until: day(25) }), before: view("inbox", "snoozed", ["mention"]) },
    { name: "a follow-up after D on an assignment", item: item({ ...assigned, comments: [mention(3)] }), status: stored("snoozed", 6, { until: day(25) }), filedAt: day(4), before: view("assigned", "snoozed") },
    { name: "a follow-up without a date on an assignment", item: item({ ...assigned, comments: [mention(3)] }), status: stored("snoozed", 4), before: view("assigned", "snoozed") },
    { name: "my part done, mention before it", item: item({ ...assigned, comments: [mention(3)] }), status: stored("done", 4, { handoff }), before: view("inbox", "done", ["mention"]) },
    { name: "my part done, mention filed", item: item({ ...assigned, comments: [mention(3)] }), status: stored("done", 4, { handoff }), filedAt: day(5), before: view("assigned", "done") },
    { name: "my part done, mention after a plan", item: item({ ...assigned, comments: [mention(6)] }), status: stored("done", 4, { handoff }), plannedAt: day(5), dated: true, before: view("inbox", "done", ["update", "mention"]) },
    { name: "a due follow-up, mention before it", item: item({ comments: [mention(3)] }), status: stored("snoozed", 4, { until: day(10) }), before: view("inbox", "open", ["mention"]) },
    { name: "a due follow-up on an answered mention", item: item({ comments: [mention(3), answer(3)] }), status: stored("snoozed", 4, { until: day(10) }), before: view("inbox", "open", ["reopened"]) },
    { name: "a due follow-up on an assignment, mention before it", item: item({ ...assigned, comments: [mention(3)] }), status: stored("snoozed", 4, { until: day(10) }), before: view("inbox", "open", ["mention"]) },
    { name: "a due follow-up on an assignment, nothing pending", item: item({ assignees: [ME], reasons: ["assigned"] }), status: stored("snoozed", 4, { until: day(10) }), before: view("assigned", "open") },
    // Intended: the due follow-up asks again what was pending, also what D filed before F.
    { name: "a due follow-up after D on an assignment", item: item({ ...assigned, comments: [mention(3)] }), status: stored("snoozed", 6, { until: day(10) }), filedAt: day(4), before: view("assigned", "open"), changes: view("inbox", "open", ["mention"]) },
  ];

  for (const s of scenarios) {
    it(s.changes ? `${s.name} (changes on purpose)` : s.name, () => {
      const handled = deriveHandledUntil({ statuses: new Map(s.status ? [[s.item.id, s.status]] : []), filedAt: s.filedAt ? { [s.item.id]: s.filedAt } : {}, plannedAt: s.plannedAt ? { [s.item.id]: s.plannedAt } : {}, dated: new Set(s.dated ? [s.item.id] : []) }).get(s.item.id);
      const run = (status?: StoredStatus) => classify(s.item, ME, status, ruleSwitches(), "mention", NOW, true, handled, ASK_RULES_DEFAULT, !!s.dated);
      let after = run(s.status);
      // What the hook writes back on a reset, before the next pass.
      if (after.statusReset) after = run(after.renewed ? undefined : { status: "open", changedAt: new Date(NOW).toISOString() });
      expect({ bucket: after.bucket, status: after.status, asks: after.asks }).toEqual(s.changes ?? s.before);
    });
  }
});

describe("X keeps handled-until", () => {
  it("a plan taken off leaves the mention it handled handled", () => {
    const unplanned = classify(item({ comments: [mention(3)] }), ME, undefined, ruleSwitches(), "mention", NOW, true, day(4), ASK_RULES_DEFAULT, false);
    expect(unplanned).toMatchObject({ bucket: "done", asks: [] });
  });
});

describe("the in-memory store", () => {
  it("keeps, restores and resets handled-until", async () => {
    const store = new MemoryStore({ handledUntil: new Map([["a", day(2)]]) });
    await store.setHandledUntil("b", day(3));
    await store.setHandledUntil("a", null);
    expect([...(await store.handledUntil())]).toEqual([["b", day(3)]]);
    await store.resetStatuses();
    expect((await store.handledUntil()).size).toBe(0);
  });
});

describe("the migration", () => {
  /** Opens a `Store` on a fake database whose settings hold `filedAt`; returns the rows the fill inserted, per statement. */
  async function open(filedAt: Record<string, string>, tableExists = false): Promise<string[][]> {
    const inserts: string[][] = [];
    const db = {
      select: (sql: string) => Promise.resolve(sql.includes("sqlite_master") && tableExists ? [{}] : sql.includes("FROM settings") ? [{ key: "filedAt", value: JSON.stringify(filedAt) }] : []),
      execute: (sql: string, params: string[] = []) => Promise.resolve(void (sql.startsWith("INSERT INTO item_handled") && inserts.push(params))),
    };
    load.mockResolvedValue(db);
    await Store.open();
    return inserts;
  }
  const filed = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`I_${i}`, day(2)]));

  it("writes a large filedAt in chunks of at most 400 rows", async () => {
    const inserts = await open(filed(900));
    expect(inserts.map((params) => params.length / 2)).toEqual([400, 400, 100]);
    expect(new Set(inserts.flat().filter((p) => p.startsWith("I_"))).size).toBe(900);
  });

  it("runs only when the table is created", async () => {
    expect(await open(filed(3), true)).toEqual([]);
  });
});

describe("handledStep", () => {
  const recorded = () => {
    const writes: [string, string | null][] = [];
    return { writes, write: (id: string, at: string | null) => Promise.resolve(void writes.push([id, at])) };
  };

  it("sets the time, undo restores the earlier one, redo sets it again", () => {
    const { writes, write } = recorded();
    const step = handledStep("I_1", day(2), day(5), write);
    step.run();
    step.undo();
    step.run();
    expect(writes).toEqual([["I_1", day(5)], ["I_1", day(2)], ["I_1", day(5)]]);
  });

  it("undo removes the time when the item had none", () => {
    const { writes, write } = recorded();
    const step = handledStep("I_1", undefined, day(5), write);
    step.run();
    step.undo();
    expect(writes).toEqual([["I_1", day(5)], ["I_1", null]]);
  });
});
