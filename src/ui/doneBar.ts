import type { Classified } from "../classify";
import { lastReplyAt, latest, mentionsOf, sameLogin } from "../timeline";
import { onPlate } from "./assignments";
import { isOwnOpen } from "./authored";
import { isWaiting } from "./followUp";

/** How many days the Done bar keeps an open item after it was handled; fixed, no setting. */
export const DONE_DAYS = 7;

/** The Done bar's group in the inbox list; its fold state is stored as "inbox:done". */
export const DONE_GROUP = "done";

const DAY_MS = 86_400_000;

/**
 * When the viewer last handled an item that asks for nothing now: the latest of its handled-until
 * (D, P, T, F), the closing of a closed item that was for them, the time of a "done" stored before
 * handled-until existed, and, outside the tables, their last reply if they were mentioned and
 * their last review if they were asked for one. Null while the item asks (it is in the inbox),
 * waits for a follow-up (a past-due one no longer waits), sits in the bar Finished of Assigned to
 * me as "my part done", and when none of these exist. Other own and assigned items count only
 * through handled-until, so working on them does not keep them in the bar. A closed item counts
 * only while it is for the viewer (bucket "done"); one ticked off that is no longer shows nowhere.
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
  if (c.bucket === "inbox" || isWaiting(c) || (c.updates && onPlate(c, me))) return null;
  const { item } = c;
  // Not `c.bucket`: an own issue whose mention was answered is "done" there, yet in Created by me.
  const outsideTables = !onPlate(c, me) && !isOwnOpen(c, me);
  const reply = outsideTables && mentionsOf(item, me).length > 0 ? lastReplyAt(item, me) : null;
  const review = outsideTables && item.reasons.includes("review") ? latest(...item.reviews.filter((r) => sameLogin(r.author, me)).map((r) => r.at)) : null;
  const closed = c.bucket === "done" && item.closed ? item.closed.at : null;
  const stored = c.bucket === "done" && !c.answered && !item.closed ? c.statusAt : null;
  const until = item.closed && c.bucket !== "done" ? null : handledUntil;
  return latest(until, reply, review, closed, stored);
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
