import type { Item } from "./model";
import { sameLogin } from "./timeline";

/** Where an item stands in the work, normalized across boards that name their statuses differently. */
export type WorkStatus = "todo" | "progress" | "review" | "done" | "snoozed";

/** In display order. */
export const WORK_STATUSES: WorkStatus[] = ["todo", "progress", "review", "done", "snoozed"];

/** When boards disagree, the higher rank wins; "snoozed" (blocked, waiting) outranks only "todo". */
const RANK: Record<WorkStatus, number> = { todo: 0, snoozed: 1, progress: 2, review: 3, done: 4 };

/** Board id → board status value → work status; values left out are mapped by `guessWorkStatus`. */
export type StatusMap = Record<string, Record<string, WorkStatus>>;

const PATTERNS: [RegExp, WorkStatus][] = [
  [/block|waiting|on hold|hold|paused|parked|stuck/i, "snoozed"],
  [/review|approv|qa\b|testing/i, "review"],
  [/progress|doing|wip|working|started|active|develop/i, "progress"],
  [/done|closed|complete|finished|shipped|released|merged/i, "done"],
  [/todo|to do|backlog|ready|new|open|triage|planned|next|icebox/i, "todo"],
];

/**
 * Guesses the work status from a board's status name, e.g. "In Progress" → progress,
 * "Ready for review" → review, "Backlog" → todo, "Blocked" → snoozed. Blocked and review are
 * checked first, so names that mention more than one, like "Ready for review", count as the
 * more specific one.
 *
 * @returns The guess, or null for names that match no pattern.
 *
 * @example
 *   guessWorkStatus("🏗 Doing"); // "progress"
 */
export function guessWorkStatus(name: string): WorkStatus | null {
  return PATTERNS.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

/**
 * The item's work status from its boards: each board's status value goes through the viewer's
 * mapping for that board, else through `guessWorkStatus`. When boards disagree, the furthest
 * status wins (done, review, progress, snoozed, todo), since boards tend to lag behind.
 *
 * @param item  The item with its boards.
 * @param map   The viewer's per-board mapping (setting "statusMap").
 * @returns The work status, or null when no board gives one.
 *
 * @example
 *   workStatusOf(item, { PVT_1: { Backlog: "todo" } }); // "todo"
 */
export function workStatusOf(item: Pick<Item, "boards">, map: StatusMap): WorkStatus | null {
  const found = item.boards.flatMap((b) => {
    if (!b.status) return [];
    const status = map[b.id]?.[b.status] ?? guessWorkStatus(b.status);
    return status ? [status] : [];
  });
  return found.sort((a, b) => RANK[b] - RANK[a])[0] ?? null;
}

/**
 * The work status when no board gives one, from the pull requests:
 * - an issue with an open linked PR: a draft means progress, a ready PR means review
 * - a pull request itself: a draft means progress, otherwise review
 * - anything else: todo
 */
export function fallbackWorkStatus(item: Pick<Item, "kind" | "draft" | "linkedPrs">): WorkStatus {
  if (item.kind === "pr") return item.draft ? "progress" : "review";
  if (item.linkedPrs.length === 0) return "todo";
  return item.linkedPrs.some((pr) => !pr.draft) ? "review" : "progress";
}

/** The work status shown in Assigned to me: from the boards, else from the pull requests. */
export function workStatus(item: Pick<Item, "boards" | "kind" | "draft" | "linkedPrs">, map: StatusMap): WorkStatus {
  return workStatusOf(item, map) ?? fallbackWorkStatus(item);
}

/** The viewer's own linked PRs come first, as they say most about where the work stands. */
export function linkedPrsFirst(item: Pick<Item, "linkedPrs">, me: string) {
  return [...item.linkedPrs].sort((a, b) => Number(sameLogin(b.author, me)) - Number(sameLogin(a.author, me)));
}
