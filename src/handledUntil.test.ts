import { describe, expect, it } from "vitest";
import { MemoryStore } from "./demo/memoryStore";
import { ASK_RULES_DEFAULT, classify } from "./classify";
import { deriveHandledUntil, type Cutoffs } from "./handledUntil";
import type { Comment, Item, StoredStatus } from "./model";
import { ruleSwitches } from "./rules";

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

// With the derived time as the only cutoff (what the later steps give `classify`), no item changes view.
describe("the derived time keeps every item where it was", () => {
  const handoff = { boards: {}, prs: [] };
  const scenarios: { name: string; item: Item; status?: StoredStatus; filedAt?: string; plannedAt?: string; dated?: boolean }[] = [
    { name: "a mention filed with D", item: item({ comments: [mention(3)] }), filedAt: day(4) },
    { name: "a mention newer than D", item: item({ comments: [mention(3), mention(6)] }), filedAt: day(4) },
    { name: "a mention before a plan", item: item({ comments: [mention(3)] }), plannedAt: day(4), dated: true },
    { name: "a mention after a plan", item: item({ comments: [mention(6)] }), plannedAt: day(4), dated: true },
    { name: "a plan time left behind", item: item({ comments: [mention(3)] }), plannedAt: day(4), dated: false },
    { name: "a stored done on a mention", item: item({ comments: [mention(3)] }), status: stored("done", 4) },
    { name: "a stored done on an own item", item: item({ author: ME, comments: [mention(3)] }), status: stored("done", 4) },
    { name: "a follow-up on a mentioned item", item: item({ comments: [mention(3)] }), status: stored("snoozed", 4, { until: day(25) }) },
    { name: "a follow-up without a date", item: item({ comments: [mention(3)] }), status: stored("snoozed", 4) },
    { name: "a follow-up on an assignment, mention before it", item: item({ assignees: [ME], reasons: ["assigned", "mentioned"], comments: [mention(3)] }), status: stored("snoozed", 4, { until: day(25) }) },
    { name: "a follow-up on an assignment, mention after it", item: item({ assignees: [ME], reasons: ["assigned", "mentioned"], comments: [mention(6)] }), status: stored("snoozed", 4, { until: day(25) }) },
    { name: "a follow-up after D on an assignment", item: item({ assignees: [ME], reasons: ["assigned", "mentioned"], comments: [mention(3)] }), status: stored("snoozed", 6, { until: day(25) }), filedAt: day(4) },
    { name: "my part done, mention before it", item: item({ assignees: [ME], reasons: ["assigned", "mentioned"], comments: [mention(3)] }), status: stored("done", 4, { handoff }) },
    { name: "my part done, mention filed", item: item({ assignees: [ME], reasons: ["assigned", "mentioned"], comments: [mention(3)] }), status: stored("done", 4, { handoff }), filedAt: day(5) },
    { name: "my part done, mention after a plan", item: item({ assignees: [ME], reasons: ["assigned", "mentioned"], comments: [mention(6)] }), status: stored("done", 4, { handoff }), plannedAt: day(5), dated: true },
  ];

  for (const s of scenarios) {
    it(s.name, () => {
      const statuses = new Map(s.status ? [[s.item.id, s.status]] : []);
      const dated = new Set(s.dated ? [s.item.id] : []);
      const before = classify(s.item, ME, s.status, ruleSwitches(), "mention", NOW, true, s.dated ? s.plannedAt : undefined, ASK_RULES_DEFAULT, s.filedAt);
      const handled = deriveHandledUntil({ statuses, filedAt: s.filedAt ? { [s.item.id]: s.filedAt } : {}, plannedAt: s.plannedAt ? { [s.item.id]: s.plannedAt } : {}, dated }).get(s.item.id);
      const after = classify(s.item, ME, s.status, ruleSwitches(), "mention", NOW, true, s.dated ? handled : undefined, ASK_RULES_DEFAULT, handled);
      expect({ bucket: after.bucket, status: after.status, asks: after.asks }).toEqual({ bucket: before.bucket, status: before.status, asks: before.asks });
    });
  }
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
