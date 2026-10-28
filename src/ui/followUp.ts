import type { Classified } from "../classify";

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
