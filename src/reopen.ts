import type { Item, Reopen, StoredStatus } from "./model";
import { mentionsOf, othersPostedAfter } from "./timeline";

export const REOPEN_DEFAULT: Reopen = "mention";

/**
 * Whether a stored status is a snooze whose date has passed.
 *
 * @example
 *   snoozeEnded({ status: "snoozed", changedAt: "2026-10-01T00:00:00Z", until: "2026-10-05T09:00:00Z" }); // true after that time
 */
export function snoozeEnded(stored: StoredStatus | undefined, now = Date.now()): boolean {
  return stored?.status === "snoozed" && !!stored.until && Date.parse(stored.until) <= now;
}

/**
 * Decides whether a stored "Zurückgestellt" or "Erledigt" falls back to "Offen" because the item
 * needs the viewer again.
 *
 * @param item     The item as fetched.
 * @param me       The viewer's login.
 * @param stored   The viewer's manual status, if any.
 * @param trigger  What counts as needing the viewer, compared against the status change time:
 *                 - "mention": someone (or the viewer, as a reminder) mentioned the viewer;
 *                 - "any-post": anyone else commented or reviewed;
 *                 - "mention-or-assigned-post": a mention, or any post by someone else on an
 *                   item assigned to the viewer.
 * @returns True when the stored status should be discarded.
 *
 * @example
 *   reopens(item, "octocat", { status: "done", changedAt: "2026-10-01T12:00:00Z" }, "mention");
 */
export function reopens(item: Item, me: string, stored: StoredStatus | undefined, trigger: Reopen, now = Date.now()): boolean {
  if (!stored || stored.status === "open") return false;
  if (snoozeEnded(stored, now)) return true;
  const mentioned = mentionsOf(item, me).some((m) => m.at > stored.changedAt);
  if (trigger === "mention") return mentioned;
  const posted = othersPostedAfter(item, me, stored.changedAt);
  if (trigger === "any-post") return posted;
  return mentioned || (item.reasons.includes("assigned") && posted);
}
