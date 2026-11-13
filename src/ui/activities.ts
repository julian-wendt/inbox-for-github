import type { Ask, Classified } from "../classify";
import type { Activity, Item, LogEvent, StatusChange } from "../model";
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
 * The sentence for one entry of the status history: who set which status, a follow-up with its
 * date (`untilText` fills `{until}`), or what the viewer did when the status alone would mislead.
 *
 * @example
 *   historyText({ status: "done", at: "…", automatic: false }); // "history.done" → "You marked it as done"
 *   historyText({ status: "snoozed", at: "…", automatic: false, until: "2026-11-16T08:00:00Z", notify: true }); // "history.followUpRemind"
 *   historyText({ status: "open", at: "…", automatic: true, logAs: "follow-up-ended" }); // "history.followUpEnded"
 */
export function historyText(change: StatusChange): MessageKey {
  if (change.logAs === "follow-up-ended") return "history.followUpEnded";
  if (change.logAs === "resumed") return "history.resumed";
  if (change.status === "snoozed" && change.until !== undefined) return change.until ? (change.notify ? "history.followUpRemind" : "history.followUpAt") : "history.followUpNone";
  if (!change.automatic) return `history.${change.status}`;
  const auto: Record<string, MessageKey> = { "auto:snooze-ended": "history.due", "auto:locked": "history.unlocked", "auto:reassigned": "history.reassigned", "auto:legacy-done": "history.legacyDone" };
  return auto[change.source ?? ""] ?? "history.reopened";
}

const BACK: Record<Exclude<Ask, "opened">, MessageKey> = {
  mention: "history.back.mention",
  review: "history.back.review",
  commits: "history.back.commits",
  feedback: "history.back.feedback",
  reply: "history.back.reply",
  reopened: "history.back.reopened",
  post: "history.back.post",
  due: "history.back.due",
  update: "history.back.update",
  closed: "history.back.closed",
};

/**
 * The sentence for one entry of the item log; `{day}` takes the planned day.
 *
 * @example
 *   eventText({ kind: "plan", at: "…", value: "2026-11-18" }); // "history.plan" → "You planned it for {day}"
 *   eventText({ kind: "back", at: "…", value: "due" });        // "history.back.due"
 */
export function eventText(event: LogEvent): MessageKey {
  if (event.kind === "back") return BACK[event.value as Exclude<Ask, "opened">] ?? "history.back.update";
  const texts: Record<Exclude<LogEvent["kind"], "back">, MessageKey> = { plan: "history.plan", "plan-removed": "history.planRemoved", "plan-kept": "history.planKept", filed: "history.filed" };
  return texts[event.kind];
}

/**
 * The return to the inbox the classification shows (see `Classified.back`), as a log entry, for
 * the moment before `useInbox` has stored it.
 *
 * @example
 *   backEvent(entry); // { kind: "back", at: "2026-11-10T09:00:00Z", value: "due" }
 */
export function backEvent({ back }: Pick<Classified, "back">): LogEvent | null {
  return back ? { kind: "back", at: back.at, value: back.ask } : null;
}

/** One of the viewer's own lines in the timeline: a status change or an entry of the item log. */
export type LocalLine = { at: string } & ({ change: StatusChange } | { event: LogEvent });

type When = "none" | "follow-up" | "plan";

function whenAfter(when: When, line: LocalLine): When {
  if ("change" in line) return line.change.logAs === "follow-up-ended" ? "none" : line.change.status === "snoozed" && !line.change.logAs ? "follow-up" : when;
  return line.event.kind === "plan" || line.event.kind === "plan-kept" ? "plan" : line.event.kind === "plan-removed" ? "none" : when;
}

const removes = (line: LocalLine) => ("change" in line ? line.change.logAs === "follow-up-ended" : line.event.kind === "plan-removed");

/**
 * The viewer's own lines worth showing in the timeline, oldest first. Returns to the inbox always
 * show. Of the viewer's decisions, a run with nothing else in between (no post, review, event or
 * return) shows only its last, as the others were corrections; and none when that last takes off
 * a follow-up or plan that did not exist before the run (set and taken off again). Changes
 * another line already tells are left out (see `LogAs`). The stored log itself keeps every entry.
 *
 * @param history  The item's status changes, oldest first.
 * @param events   The item's log entries (see `LogEvent`).
 * @param item     The item, for the times of its posts, reviews and events.
 *
 * @example
 *   localLines([done, snoozedRightAfter], [], item);      // [snoozedRightAfter]
 *   localLines([snoozed, endedRightAfter], [], item);     // []
 */
export function localLines(history: StatusChange[], events: LogEvent[], item: Item): LocalLine[] {
  const returns: LocalLine[] = events.filter((e) => e.kind === "back").map((event) => ({ at: event.at, event }));
  const decisions: LocalLine[] = [
    ...history.filter((change) => change.logAs !== "hidden").map((change) => ({ at: change.at, change })),
    ...events.filter((e) => e.kind !== "back").map((event) => ({ at: event.at, event })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const between = [...posts(item).map((p) => p.at), ...item.activities.map((a) => a.at), ...item.reviews.map((r) => r.at), ...returns.map((r) => r.at)];
  const shown: LocalLine[] = [];
  let when: When = "none";
  let run: LocalLine[] = [];
  decisions.forEach((line, i) => {
    run.push(line);
    const next = decisions[i + 1];
    if (next && !between.some((at) => at > line.at && at < next.at)) return;
    const before = when;
    for (const l of run) when = whenAfter(when, l);
    if (!(removes(line) && before === "none")) shown.push(line);
    run = [];
  });
  return [...shown, ...returns].sort((a, b) => a.at.localeCompare(b.at));
}
