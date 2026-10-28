import type { Classified } from "../classify";
import { latest } from "../timeline";
import { hasNewActivity, isNewAssignment, lastOthersActivity } from "./assignments";

/**
 * Whether an inbox item has something the viewer has not opened yet, like an unread mail: it was
 * never opened, or opened before what put it there (the mention, the latest post or event by
 * someone else, a review request among them, or a passed snooze date or reminder).
 *
 * @param entry  An item of the inbox.
 * @param seen   When the viewer last opened each item (`useInbox().seen`).
 * @param me     The viewer's login.
 *
 * @example
 *   unreadInInbox(entry, inbox.seen, "octocat"); // true until octocat opens the item after the mention
 */
export function unreadInInbox(entry: Classified, seen: Map<string, string>, me: string): boolean {
  const since = seen.get(entry.item.id);
  if (!since) return true;
  const due = entry.asks.includes("due") ? entry.statusAt : null;
  const last = latest(entry.mention?.at, lastOthersActivity(entry.item, me), due);
  return !!last && last > since;
}

/**
 * Whether a row of Assigned to me is unread: a new assignment or new activity by others since the
 * viewer last opened it, the same as its "new" mark and dot.
 *
 * @example
 *   unreadAssignment(entry, inbox.seen, "octocat"); // true for an assignment octocat has not opened
 */
export function unreadAssignment(entry: Classified, seen: Map<string, string>, me: string): boolean {
  return isNewAssignment(entry, seen, me) || hasNewActivity(entry, seen, me);
}
