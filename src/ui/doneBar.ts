import type { Classified } from "../classify";
import { lastReplyAt, latest, mentionsOf, sameLogin } from "../timeline";
import { isWaiting } from "./followUp";

/** How many days the Done bar keeps an open item after it was handled; fixed, no setting. */
export const DONE_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * When the viewer last handled an item that asks for nothing now: the latest of its handled-until
 * (D, P, T, F), their last reply if they were mentioned, their last review if they were asked for
 * one, the closing of a closed item that was for them, and the time of a "done" stored before
 * handled-until existed. Null while the item asks (it is in the inbox) or waits for a follow-up,
 * and when none of these exist. A "my part done" counts only through handled-until.
 *
 * @param c             The item as classified.
 * @param handledUntil  Its handled-until (`useInbox().handledUntil`), if any.
 * @param me            The viewer's login.
 * @returns An ISO time, or null.
 *
 * @example
 *   handledAt(answeredMention, undefined, "octocat"); // the time of octocat's reply
 */
export function handledAt(c: Classified, handledUntil: string | undefined, me: string): string | null {
  if (c.bucket === "inbox" || isWaiting(c)) return null;
  const { item } = c;
  const reply = mentionsOf(item, me).length > 0 ? lastReplyAt(item, me) : null;
  const review = item.reasons.includes("review") ? latest(...item.reviews.filter((r) => sameLogin(r.author, me)).map((r) => r.at)) : null;
  const closed = c.bucket === "done" && item.closed ? item.closed.at : null;
  const stored = c.bucket === "done" && !c.answered && !item.closed ? c.statusAt : null;
  return latest(handledUntil, reply, review, closed, stored);
}

/**
 * Whether an item sits in the Done bar at the bottom of the inbox: handled (see `handledAt`) and
 * not planned. An open item stays there for `DONE_DAYS` after it was handled; a closed one as long
 * as it is loaded at all, which the "closedDays" setting decides.
 *
 * @param dated  The item is pinned for today or planned for a day; it then shows in Planned instead.
 * @param now    The current time in milliseconds.
 *
 * @example
 *   inDoneBar(filedMention, "2026-11-12T09:00:00Z", "octocat", Date.parse("2026-11-13T09:00:00Z"), false); // true
 */
export function inDoneBar(c: Classified, handledUntil: string | undefined, me: string, now: number, dated: boolean): boolean {
  const at = dated ? null : handledAt(c, handledUntil, me);
  return !!at && (!!c.item.closed || now - Date.parse(at) < DONE_DAYS * DAY_MS);
}
