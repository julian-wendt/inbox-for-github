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
