import type { Classified } from "../classify";
import { viewOf } from "./labels";

/**
 * The sidebar's repo list: every repo with at least one item in any view, Follow-ups and Done
 * included, so a repo does not vanish when its last item is filed away. The count covers only
 * the views that count (Inbox, Assigned to me, Created by me), so a repo with nothing but filed
 * items shows 0. Busiest first; equal counts keep the order of first appearance.
 *
 * @param entries  The classified items.
 * @param me       The viewer's login.
 *
 * @example
 *   repoList(inbox.classified, "octocat"); // [["octo-org/app", 3], ["octo-org/docs", 0]]
 */
export function repoList(entries: Classified[], me: string): [repo: string, count: number][] {
  const counts = new Map<string, number>();
  for (const c of entries) {
    const view = viewOf(c, me);
    if (view === null) continue;
    const counted = view !== "done" && view !== "snoozed";
    counts.set(c.item.repo, (counts.get(c.item.repo) ?? 0) + (counted ? 1 : 0));
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}
