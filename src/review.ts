import type { Item } from "./model";
import { isBot, latest, posts, sameLogin } from "./timeline";

/**
 * Tells whether the viewer has acted on their latest review request: they posted a comment or
 * submitted a review after it, and no other person (bots aside) has posted or reviewed since.
 *
 * Requests to a team count as requests to the viewer, since the events do not say which member
 * is meant. Without any request event (e.g. on issues) the result is false.
 *
 * @param reopenedAt  When the viewer set the item back to "Offen" by hand; counts as a request.
 *
 * @example
 *   reviewAnswered(pr, "octocat"); // true once octocat commented after being asked for a review
 */
export function reviewAnswered(item: Item, me: string, reopenedAt?: string): boolean {
  const requests = item.reviewRequests.filter((r) => sameLogin(r.reviewer, me) || r.reviewer.startsWith("team:"));
  if (requests.length === 0) return false;
  const asked = latest(...requests.map((r) => r.at), reopenedAt)!;
  const activity = [
    ...posts(item).map((p) => ({ author: p.author, at: p.at })),
    ...item.reviews,
  ].filter((a) => !isBot(a.author));
  const acted = latest(...activity.filter((a) => sameLogin(a.author, me)).map((a) => a.at));
  if (!acted || acted <= asked) return false;
  return !activity.some((a) => !sameLogin(a.author, me) && a.at > acted);
}

/** Pushes by others since the viewer's review: when the last came, and who pushed, last pusher last. */
export interface Pushed {
  at: string;
  by: string[];
}

/**
 * The pushes by others to a pull request since the viewer last reviewed or commented on it,
 * provided they have reviewed it before: commits by another author and force pushes by another
 * person. Commits without a linked GitHub user and pushes by bots do not count, nor do the
 * viewer's own pull requests.
 *
 * @returns When the last of them came and their distinct authors, or null when there is none.
 *
 * @example
 *   pushedSinceReview(pr, "octocat"); // { at: "2026-10-27T09:12:00Z", by: ["alice"] } after alice pushed once octocat approved
 */
export function pushedSinceReview(item: Item, me: string): Pushed | null {
  if (item.kind !== "pr" || sameLogin(item.author, me)) return null;
  const reviewed = item.reviews.filter((r) => sameLogin(r.author, me)).map((r) => r.at);
  if (reviewed.length === 0) return null;
  const acted = latest(...reviewed, ...posts(item).filter((p) => sameLogin(p.author, me)).map((p) => p.at))!;
  const pushes = item.activities
    .flatMap((a) => {
      if (a.kind === "commit") return a.author ? [{ by: a.author, at: a.at }] : [];
      return a.kind === "force-pushed" ? [{ by: a.actor, at: a.at }] : [];
    })
    .filter((p) => !sameLogin(p.by, me) && !isBot(p.by) && p.at > acted)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (pushes.length === 0) return null;
  const by = pushes.map((p) => p.by).filter((login, i, all) => !all.slice(i + 1).some((later) => sameLogin(later, login)));
  return { at: pushes.at(-1)!.at, by };
}
