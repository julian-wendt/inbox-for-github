import type { Classified } from "../classify";
import { lastReplyAt, latest, mentionsOf, sameLogin } from "../timeline";
import { onPlate } from "./assignments";
import { isOwnOpen } from "./authored";
import { isWaiting } from "./followUp";
import { RINGING_GROUP, ringing } from "./attention";
import { t } from "./i18n";

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

/** A bar of a list: its fold key ("" for rows under no bar), its heading and its rows. */
export interface ListBar {
  group: string;
  heading: string;
  entries: Classified[];
}

/**
 * The bars of a list view around its rows: the Reminders bar on top with the inbox rows that ring
 * (see `ringing`) and are still unread, the other rows in their time groups, and the Done bar last. Without time groups
 * the other rows stand under no bar, or under "Inbox" when the Reminders bar is above them. Empty
 * bars are left out.
 *
 * @param rows   The view's rows, sorted.
 * @param unread  The inbox's unread ids, or null outside the inbox; rows ring only there, and only until read.
 * @param done   The Done bar's rows; empty outside the inbox.
 * @param timed  Splits rows into time groups with their headings, or null without time groups.
 * @returns The bars, or undefined without time groups when there is no bar to draw.
 *
 * @example
 *   listBars(listed, unreadInboxIds, doneRows, (rows) => groupByTime(rows, rowTime).map((g) => ({ ...g, heading: t(`time.group.${g.group}`) })));
 */
export function listBars(rows: Classified[], unread: ReadonlySet<string> | null, done: Classified[], timed: ((rows: Classified[]) => ListBar[]) | null): ListBar[] | undefined {
  const rings = unread ? rows.filter((c) => ringing(c) && unread.has(c.item.id)) : [];
  const rest = rings.length > 0 ? rows.filter((c) => !rings.includes(c)) : rows;
  const top = rings.length > 0 ? [{ group: RINGING_GROUP, heading: t("inbox.ringingBar"), entries: rings }] : [];
  const bottom = done.length > 0 ? [{ group: DONE_GROUP, heading: t("bucket.done"), entries: done }] : [];
  if (timed) return [...top, ...timed(rest), ...bottom];
  const main = top.length === 0 ? [{ group: "", heading: "", entries: rest }] : rest.length > 0 ? [{ group: "rest", heading: t("bucket.inbox"), entries: rest }] : [];
  return top.length > 0 || bottom.length > 0 ? [...top, ...main, ...bottom] : undefined;
}
