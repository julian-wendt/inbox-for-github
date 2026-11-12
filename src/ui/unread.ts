import type { Classified } from "../classify";
import { latest } from "../timeline";
import { hasNewActivity, isNewAssignment, lastOthersActivity, MOVES_UP_DEFAULT, type MovesUp } from "./assignments";

/**
 * Whether an inbox item has something the viewer has not opened yet, like an unread mail: it was
 * never opened, or opened before what put it there (the mention, the latest post or event by
 * someone else, a review request among them, or the stored Open that asks again after a reopen
 * or a passed follow-up date).
 *
 * @param entry  An item of the inbox.
 * @param seen   When the viewer last opened each item (`useInbox().seen`).
 * @param me     The viewer's login.
 * @param counted  Which activity counts, the "movesUp" setting; the same the rows sort by.
 *
 * @example
 *   unreadInInbox(entry, inbox.seen, "octocat"); // true until octocat opens the item after the mention
 */
export function unreadInInbox(entry: Classified, seen: Map<string, string>, me: string, counted: MovesUp = MOVES_UP_DEFAULT): boolean {
  const since = seen.get(entry.item.id);
  if (!since) return true;
  const reopened = entry.asks.includes("reopened") ? entry.statusAt : null;
  const last = latest(entry.mention?.at, lastOthersActivity(entry.item, me, counted), reopened);
  return !!last && last > since;
}

/**
 * Whether a row of a table is unread: new activity by others since the viewer last opened it,
 * and where the view draws the assignment mark (Assigned to me, `assignment`) also a new
 * assignment, the same as the row's "new" mark and dot.
 *
 * @example
 *   unreadAssignment(entry, inbox.seen, "octocat", true); // true for an assignment octocat has not opened
 */
export function unreadAssignment(entry: Classified, seen: Map<string, string>, me: string, assignment: boolean, counted: MovesUp = MOVES_UP_DEFAULT): boolean {
  return (assignment && isNewAssignment(entry, seen, me)) || hasNewActivity(entry, seen, me, counted);
}

/** An item's read state as `useInbox().restoreRead` puts it back: when it was last seen, and its unread mark. */
export interface ReadState {
  seen?: string;
  mark?: string;
}

/**
 * P, T and F count as seen, but only on the item that is open (the list's detail or a table's
 * pop-up); a table row that is only selected stays unread. As an undo step: `run` marks it seen,
 * `undo` restores `before` exactly, unread mark included, and running it again marks it seen again.
 *
 * @param id           The item's node id.
 * @param openedId     The open item's id, if any.
 * @param before       The item's read state before the change.
 * @param markSeen     E.g. `useInbox().markSeen`.
 * @param restoreRead  E.g. `useInbox().restoreRead`.
 * @returns The step, or none when the item is not open.
 *
 * @example
 *   seenStep("I_1", openedId, { seen: inbox.seen.get("I_1"), mark: inbox.unreadMarks.get("I_1") }, inbox.markSeen, inbox.restoreRead);
 */
export function seenStep(id: string, openedId: string | undefined, before: ReadState, markSeen: (id: string) => Promise<void>, restoreRead: (id: string, previous: ReadState) => Promise<void>): { run: () => void; undo: () => void }[] {
  if (id !== openedId) return [];
  return [{ run: () => void markSeen(id), undo: () => void restoreRead(id, before) }];
}
