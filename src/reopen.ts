import type { Item, Reopen, StoredStatus } from "./model";
import { sameLogin } from "./timeline";

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
 * Whether someone else assigned the viewer after `since` and the viewer is still assigned. The
 * viewer assigning themselves is no news to them.
 *
 * @example
 *   assignedAgain(item, "octocat", "2026-10-01T12:00:00Z"); // true after bob assigned octocat anew
 */
export function assignedAgain(item: Item, me: string, since: string): boolean {
  return item.reasons.includes("assigned") && item.activities.some((a) => a.kind === "assigned" && sameLogin(a.assignee, me) && !sameLogin(a.actor, me) && a.at > since);
}

/** When someone else last reopened the item on GitHub, if they did. */
export function reopenedByOther(item: Item, me: string): string | null {
  return item.activities.filter((a) => a.kind === "state" && a.change === "reopened" && !sameLogin(a.actor, me)).at(-1)?.at ?? null;
}
