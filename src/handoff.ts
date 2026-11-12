import type { Handoff, Item, StoredStatus } from "./model";
import { isBot, posts, sameLogin } from "./timeline";

/** What happened on a handed-off item since the viewer's part ended (see `updatesSince`). */
export type Update =
  | { kind: "post"; by: string; at: string }
  | { kind: "board"; board: string; from: string | null; to: string | null }
  | { kind: "pr"; number: number }
  | { kind: "closed"; state: "closed" | "merged"; at: string }
  | { kind: "reopened"; by: string; at: string };

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
 * different from the snapshot, a linked pull request not in it, closing or merging, and a
 * reopening by someone else. Boards
 * missing now (e.g. boards not loaded) do not count as a change, nor do boards and pull requests
 * of an item that was closed by `since`: nothing writes a fresh snapshot for it. Oldest first
 * within each kind.
 *
 * @param since     ISO time the snapshot was taken, or the item's handled-until when that is later.
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
  const settled = !!item.closed && item.closed.at <= since;
  const boardUpdates: Update[] = settled ? [] : item.boards
    .filter((b) => b.id in snapshot.boards && snapshot.boards[b.id] !== b.status)
    .map((b) => ({ kind: "board", board: b.title, from: snapshot.boards[b.id], to: b.status }));
  const prUpdates: Update[] = settled ? [] : item.linkedPrs.filter((p) => !snapshot.prs.includes(p.number)).map((p) => ({ kind: "pr", number: p.number }));
  const closed: Update[] = item.closed && item.closed.at > since ? [{ kind: "closed", state: item.closed.state, at: item.closed.at }] : [];
  const reopened: Update[] = item.activities.flatMap((a) => (a.kind === "state" && a.change === "reopened" && byOthers(a.actor, a.at) ? [{ kind: "reopened" as const, by: a.actor, at: a.at }] : []));
  return [...closed, ...reopened, ...boardUpdates, ...prUpdates, ...postUpdates];
}

/**
 * What is left of a stored status once its follow-up is taken off (X, D in Follow-up, P or T): a
 * finished part stays done with its time and snapshot, so news since then still counts; anything
 * else leaves nothing.
 *
 * @example
 *   afterFollowUp({ status: "snoozed", changedAt: "2026-11-02T10:00:00Z", handoff }); // { status: "done", changedAt: "2026-11-02T10:00:00Z", handoff }
 */
export function afterFollowUp(stored: StoredStatus | undefined): StoredStatus | undefined {
  return stored?.handoff ? { status: "done", changedAt: stored.changedAt, handoff: stored.handoff } : undefined;
}
