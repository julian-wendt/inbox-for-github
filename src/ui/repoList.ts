import type { Classified } from "../classify";
import type { StatusMap } from "../workStatus";
import { groupPlate, plateCount } from "./assignments";
import { authoredCount, groupAuthored } from "./authored";
import { viewOf } from "./labels";

/**
 * The sidebar's repo list: every repo with at least one item in any view, follow-ups and Done
 * included, so a repo does not vanish when its last item is filed away. The count is what the
 * views count for the repo: the inbox proper, Assigned to me without its parked bars (blocked,
 * follow-up, finished) and Created by me without its follow-ups, so a repo with nothing but
 * filed items shows 0. Busiest first; equal counts keep the order of first appearance.
 *
 * @param entries    The classified items.
 * @param me         The viewer's login.
 * @param statusMap  The viewer's board status mapping, for the bars of Assigned to me.
 *
 * @example
 *   repoList(inbox.classified, "octocat"); // [["octo-org/app", 3], ["octo-org/docs", 0]]
 */
export function repoList(entries: Classified[], me: string, statusMap: StatusMap = {}): [repo: string, count: number][] {
  const byRepo = new Map<string, Classified[]>();
  for (const c of entries) if (viewOf(c, me) !== null) byRepo.set(c.item.repo, [...(byRepo.get(c.item.repo) ?? []), c]);
  const counts = [...byRepo].map(([repo, list]): [string, number] => [
    repo,
    list.filter((c) => viewOf(c, me) === "inbox").length +
      plateCount(groupPlate(list.filter((c) => viewOf(c, me) === "assigned"), statusMap, [], me)) +
      authoredCount(groupAuthored(list.filter((c) => viewOf(c, me) === "authored"), me)),
  ]);
  return counts.sort((a, b) => b[1] - a[1]);
}
