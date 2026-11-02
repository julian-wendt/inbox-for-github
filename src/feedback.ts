import type { Item } from "./model";
import { isBot, lastReplyAt, sameLogin } from "./timeline";

/** Which feedback on the viewer's own items asks for them: any by a person, only requested changes, or none. */
export type FeedbackMode = "any" | "changes" | "off";

/** A post or review by someone else that waits for the viewer. */
export interface Feedback {
  at: string;
  by: string;
  /** What it was: a review requesting changes, an approval, or a comment (a review without verdict counts as one). */
  kind: "changes" | "approved" | "commented";
}

/**
 * The viewer's last answer on an item: their last post that is no self-mention (a comment, a
 * review summary or an inline comment), review or commit. Commits without a known author do not
 * count.
 *
 * @example
 *   lastAnswerAt(item, "octocat"); // "2026-11-02T08:00:00Z"
 */
export function lastAnswerAt(item: Item, me: string): string | null {
  const times = [
    lastReplyAt(item, me),
    ...item.reviews.filter((r) => sameLogin(r.author, me)).map((r) => r.at),
    ...item.activities.flatMap((a) => (a.kind === "commit" && a.author && sameLogin(a.author, me) ? [a.at] : [])),
  ];
  return times.filter((at): at is string => !!at).sort().at(-1) ?? null;
}

/**
 * The latest feedback by a person (not the viewer, not a bot) after `since`: a comment, an inline
 * comment or a review. With "changes" only reviews that request changes count, with "off" none.
 *
 * @param since  The viewer's last answer, or when they filed the item; null takes everything.
 *
 * @example
 *   feedbackSince(item, "octocat", "2026-11-01T00:00:00Z", "any"); // { at: "…", by: "bob", kind: "changes" }
 */
export function feedbackSince(item: Pick<Item, "comments" | "reviews">, me: string, since: string | null, mode: FeedbackMode): Feedback | null {
  if (mode === "off") return null;
  const byOther = (login: string, at: string) => !sameLogin(login, me) && !isBot(login) && (!since || at > since);
  const kindOf = (state?: string): Feedback["kind"] => (state === "CHANGES_REQUESTED" ? "changes" : state === "APPROVED" ? "approved" : "commented");
  const all: Feedback[] = [
    ...item.comments.filter((c) => byOther(c.author, c.createdAt)).map((c) => ({ at: c.createdAt, by: c.author, kind: kindOf(c.reviewState) })),
    ...item.reviews.filter((r) => byOther(r.author, r.at)).map((r) => ({ at: r.at, by: r.author, kind: kindOf(r.state) })),
  ];
  const counted = mode === "changes" ? all.filter((f) => f.kind === "changes") : all;
  return counted.sort((a, b) => a.at.localeCompare(b.at)).at(-1) ?? null;
}

/**
 * The latest answer by a person in a review thread the viewer wrote in, after the viewer's own
 * last comment in that thread. Threads without a comment by the viewer do not count.
 *
 * @example
 *   threadReply(pr, "octocat"); // { at: "2026-11-02T10:00:00Z", by: "alice" }
 */
export function threadReply(item: Pick<Item, "threads">, me: string): { at: string; by: string } | null {
  const replies = item.threads.flatMap((thread) => {
    const mine = thread.comments.filter((c) => sameLogin(c.author, me)).map((c) => c.at).sort().at(-1);
    return mine ? thread.comments.filter((c) => !sameLogin(c.author, me) && !isBot(c.author) && c.at > mine) : [];
  });
  const last = replies.sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  return last ? { at: last.at, by: last.author } : null;
}

/**
 * Who closed the item without it being done, when that was someone other than the viewer: a pull
 * request closed without merging, an issue closed as not planned or a duplicate. Null for an open
 * or merged item, an issue closed as completed (also by a merged pull request), one the viewer
 * closed, and one whose closing the events do not name.
 *
 * @example
 *   closedByOther(issue, "octocat"); // { at: "2026-11-02T09:00:00Z", by: "bob" }
 */
export function closedByOther(item: Pick<Item, "closed" | "activities">, me: string): { at: string; by: string } | null {
  if (item.closed?.state !== "closed") return null;
  const last = item.activities.filter((a) => a.kind === "state" && a.change === "closed").at(-1);
  if (!last || last.kind !== "state" || sameLogin(last.actor, me) || last.reason === "COMPLETED") return null;
  return { at: item.closed.at, by: last.actor };
}
