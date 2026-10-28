import type { Classified } from "../classify";
import type { Reminder, StoredStatus } from "../model";

/**
 * The follow-up date of an item that waits for one, which is what its bell and chip show: the
 * item is stored as "snoozed" with a date that has not passed yet. Nothing once the date has
 * passed, since the item is then back in the inbox and needs no mark; nothing for a follow-up
 * without a date.
 *
 * @example
 *   followUpOf(entry); // { at: "2026-10-26T08:00:00Z" }
 */
export function followUpOf(entry: Pick<Classified, "status" | "until">): { at: string } | null {
  return entry.status === "snoozed" && entry.until ? { at: entry.until } : null;
}

/**
 * Which reminders from before follow-ups become one: those on items that have no stored status
 * yet, or only a plain "open". An item that already waits, is done or came due keeps what it has,
 * since an item carries a single date.
 *
 * @param reminders  The reminders still in the database.
 * @param statuses   The stored statuses per item id.
 * @returns The items to put into follow-up, each with its old reminder's time.
 *
 * @example
 *   followUpsFrom(new Map([["I_1", { at: "2026-10-26T08:00:00Z" }]]), new Map()); // [{ id: "I_1", until: "2026-10-26T08:00:00Z" }]
 */
export function followUpsFrom(reminders: ReadonlyMap<string, Reminder>, statuses: ReadonlyMap<string, StoredStatus>): { id: string; until: string }[] {
  return [...reminders]
    .filter(([id]) => {
      const stored = statuses.get(id);
      return !stored || (stored.status === "open" && !stored.due);
    })
    .map(([id, reminder]) => ({ id, until: reminder.at }));
}
