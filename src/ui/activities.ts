import type { Activity, Item, StatusChange } from "../model";
import type { MessageKey } from "./i18n";
import { isBot, posts, sameLogin } from "../timeline";

/**
 * Whether the detail's timeline shows an activity: see `shownActivities`. What counts as news
 * (the blue dot, moving up) uses the same test, so news is always something the viewer can see.
 *
 * @param own  The viewer opened the item: then every assignment shows, as who took it on is what
 *             Created by me watches for.
 *
 * @example
 *   isShownActivity({ kind: "assigned", at, actor: "bob", assignee: "bob" }, "octocat", false); // false
 */
export function isShownActivity(a: Activity, me: string, own: boolean): boolean {
  if (a.kind === "assigned" || a.kind === "unassigned") return own || sameLogin(a.assignee, me) || sameLogin(a.actor, me);
  if (a.kind === "review-requested" || a.kind === "review-request-removed") return sameLogin(a.reviewer, me) || a.reviewer.startsWith("team:");
  if (a.kind === "reviewed") return !isBot(a.actor);
  return true;
}

/** An activity to show, with how many commits it stands for when it groups several. */
export interface ShownActivity {
  activity: Activity;
  count: number;
  /** Commits only: the run's distinct known authors, last author last. */
  authors?: string[];
}

/**
 * Picks the timeline events worth a line between the posts and groups consecutive commits.
 *
 * Kept: assignments of the viewer and those the viewer made, every assignment on an item the viewer opened, review requests (made or withdrawn)
 * that concern the viewer (a team request counts), reviews without text by people (not bots), state changes, links, transfers, dismissals and
 * commits. A run of commits, or of force pushes by one person, with no other event or post in
 * between becomes one entry dated at its last; a run of commits keeps its authors.
 *
 * @param item   The item whose `activities` to sift.
 * @param me     The viewer's login.
 * @param posts  Times of the posts shown with them, so a post also ends a run of commits.
 * @returns The shown activities, oldest first.
 *
 * @example
 *   shownActivities(item, "octocat", comments.map((c) => c.at));
 *   // [{ activity: { kind: "commit", at: "…" }, count: 3 }, …]
 */
export function shownActivities(item: Pick<Item, "activities" | "author">, me: string, posts: string[]): ShownActivity[] {
  const own = sameLogin(item.author, me);
  const relevant = item.activities.filter((a) => isShownActivity(a, me, own));
  const shown: ShownActivity[] = [];
  for (const activity of relevant) {
    const last = shown.at(-1);
    const postBetween = last && posts.some((at) => at > last.activity.at && at < activity.at);
    const author = activity.kind === "commit" && activity.author ? [activity.author] : [];
    if (last && !postBetween && sameRun(last.activity, activity)) {
      const authors = activity.kind === "commit" ? [...(last.authors ?? []).filter((a) => !author.some((b) => sameLogin(a, b))), ...author] : undefined;
      shown[shown.length - 1] = { activity, count: last.count + 1, ...(authors && { authors }) };
    } else {
      shown.push({ activity, count: 1, ...(activity.kind === "commit" && { authors: author }) });
    }
  }
  return shown;
}

function sameRun(a: Activity, b: Activity): boolean {
  if (a.kind === "commit" && b.kind === "commit") return true;
  return a.kind === "force-pushed" && b.kind === "force-pushed" && sameLogin(a.actor, b.actor);
}

/**
 * The sentence for one entry of the status history: who set which status.
 *
 * @example
 *   historyText({ status: "done", at: "…", automatic: false }); // "history.done" → "You marked it as done"
 *   historyText({ status: "open", at: "…", automatic: true, source: "auto:snooze-ended" }); // "history.due" → "Follow-up came due"
 */
export function historyText(change: StatusChange): MessageKey {
  if (!change.automatic) return `history.${change.status}`;
  const auto: Record<string, MessageKey> = { "auto:snooze-ended": "history.due", "auto:locked": "history.unlocked", "auto:reassigned": "history.reassigned", "auto:legacy-done": "history.legacyDone" };
  return auto[change.source ?? ""] ?? "history.reopened";
}

/**
 * The status changes worth a line in the timeline. A change replaced by the next one before
 * anything else happened (no post, review or event in between) was a correction and is left
 * out; the log itself keeps every change.
 *
 * @param history  The item's status changes, oldest first.
 * @param item     The item, for the times of its posts, reviews and events.
 * @returns The changes to show, oldest first.
 *
 * @example
 *   shownHistory([done, snoozedRightAfter], item); // [snoozedRightAfter]
 */
export function shownHistory(history: StatusChange[], item: Item): StatusChange[] {
  const events = [...posts(item).map((p) => p.at), ...item.activities.map((a) => a.at), ...item.reviews.map((r) => r.at)];
  return history.filter((change, i) => {
    const next = history[i + 1];
    return !next || events.some((at) => at > change.at && at < next.at);
  });
}
