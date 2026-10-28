import type { Handoff, Item } from "./model";
import { isBot, posts, sameLogin } from "./timeline";

/** What happened on a handed-off item since the viewer's part ended (see `updatesSince`). */
export type Update =
  | { kind: "post"; by: string; at: string }
  | { kind: "board"; board: string; from: string | null; to: string | null }
  | { kind: "pr"; number: number }
  | { kind: "closed"; state: "closed" | "merged"; at: string };

/**
 * How an item looks the moment the viewer's part ends: its status per board and its linked pull
 * requests, so later changes can be told apart from what was already there.
 *
 * @example
 *   snapshotOf(item); // { boards: { PVT_1: "In progress" }, prs: [12] }
 */
export function snapshotOf(item: Pick<Item, "boards" | "linkedPrs">): Handoff {
  return { boards: Object.fromEntries(item.boards.map((b) => [b.id, b.status])), prs: item.linkedPrs.map((p) => p.number) };
}

/**
 * Everything that happened on an item since `since` (when the viewer finished their part, or
 * last ticked off its updates): posts and reviews by others (bots left out), a board status
 * different from the snapshot, a linked pull request not in it, and closing or merging. Boards
 * missing now (e.g. boards not loaded) do not count as a change. Oldest first within each kind.
 *
 * @param since     ISO time the snapshot was taken.
 * @param snapshot  From `snapshotOf` at that time.
 *
 * @example
 *   updatesSince(item, "octocat", stored.changedAt, stored.handoff); // [{ kind: "board", board: "Roadmap", from: "Review", to: "Done" }]
 */
export function updatesSince(item: Item, me: string, since: string, snapshot: Handoff): Update[] {
  const byOthers = (author: string, at: string) => !sameLogin(author, me) && !isBot(author) && at > since;
  const postUpdates: Update[] = [...posts(item).map((p) => ({ by: p.author, at: p.at })), ...item.reviews.map((r) => ({ by: r.author, at: r.at }))]
    .filter((p) => byOthers(p.by, p.at))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((p) => ({ kind: "post", ...p }));
  const boardUpdates: Update[] = item.boards
    .filter((b) => b.id in snapshot.boards && snapshot.boards[b.id] !== b.status)
    .map((b) => ({ kind: "board", board: b.title, from: snapshot.boards[b.id], to: b.status }));
  const prUpdates: Update[] = item.linkedPrs.filter((p) => !snapshot.prs.includes(p.number)).map((p) => ({ kind: "pr", number: p.number }));
  const closed: Update[] = item.closed && item.closed.at > since ? [{ kind: "closed", state: item.closed.state, at: item.closed.at }] : [];
  return [...closed, ...boardUpdates, ...prUpdates, ...postUpdates];
}
