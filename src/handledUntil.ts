import type { StoredStatus } from "./model";
import { latest } from "./timeline";

/** What the older cutoffs hold for the items, as the migration reads them. */
export interface Cutoffs {
  statuses: ReadonlyMap<string, StoredStatus>;
  /** The "filedAt" setting. */
  filedAt: Readonly<Record<string, string>>;
  /** The "plannedAt" setting; it counts only for items still pinned or planned. */
  plannedAt: Readonly<Record<string, string>>;
  /** Ids pinned for today or planned for a day (the settings "focus" and "planned"). */
  dated: ReadonlySet<string>;
}

/**
 * The handled-until each item starts with when the table is created: the latest of its filed time,
 * its plan time (only while it is pinned or planned, as `classify` counts it), the time of a stored
 * "done" without a hand-off, and the start of a stored follow-up. A "done" with a hand-off is "my
 * part done", a fact about the work, and sets nothing. Items none of these touch get no entry.
 *
 * @param cutoffs  The old cutoffs (see `Cutoffs`).
 * @returns Item id → ISO time.
 *
 * @example
 *   deriveHandledUntil({ statuses: new Map(), filedAt: { I_1: "2026-10-01T09:00:00Z" }, plannedAt: {}, dated: new Set() });
 *   // Map { "I_1" => "2026-10-01T09:00:00Z" }
 */
export function deriveHandledUntil({ statuses, filedAt, plannedAt, dated }: Cutoffs): Map<string, string> {
  const derived = new Map<string, string>();
  const note = (id: string, at: string | undefined) => {
    const time = latest(derived.get(id), at);
    if (time) derived.set(id, time);
  };
  for (const [id, at] of Object.entries(filedAt)) note(id, at);
  for (const [id, at] of Object.entries(plannedAt)) if (dated.has(id)) note(id, at);
  for (const [id, s] of statuses) if ((s.status === "done" && !s.handoff) || s.status === "snoozed") note(id, s.changedAt);
  return derived;
}

/**
 * Marks an item handled until `at` as an undo step: `run` sets it, `undo` puts back exactly what
 * the item had before, "never handled" included, and running it again sets `at` once more.
 *
 * @param id        The item's node id.
 * @param previous  Its handled-until before the change, undefined for none.
 * @param at        The new handled-until (ISO 8601), the same "now" as the change it belongs to.
 * @param write     Persists a value or removes it with null, e.g. `useInbox().setHandledUntil`.
 *
 * @example
 *   const step = handledStep("I_1", undefined, "2026-11-12T09:00:00Z", inbox.setHandledUntil);
 *   step.run();  // I_1 handled until 09:00
 *   step.undo(); // I_1 never handled again
 */
export function handledStep(id: string, previous: string | undefined, at: string, write: (id: string, at: string | null) => Promise<void>): { run: () => void; undo: () => void } {
  return { run: () => void write(id, at), undo: () => void write(id, previous ?? null) };
}
