import type { Classified } from "../classify";
import type { Status, StoredStatus } from "../model";
import { sameLogin } from "../timeline";
import { onPlate } from "./assignments";
import type { View } from "./labels";

/**
 * Why D has nothing to end on an item without asks: the viewer opened it ("own"; it ends by
 * closing or merging it on GitHub).
 */
export type Lock = "own";

/** What choosing a status does to an item; `App` carries it out and announces it. */
export type StatusPlan =
  | { do: "resume" }
  | { do: "tick-update" }
  | { do: "hand-off" }
  | { do: "clear" }
  | { do: "file"; unplan?: true }
  | { do: "blocked" }
  | { do: "set"; status: Status }
  | { do: "none" };

/**
 * Decides what a status chosen for an item means. D means one thing per view, matching what the
 * view is for:
 *
 * - Inbox (someone wants something from the viewer): D files the item's asks ("file": it sets
 *   handled-until; the asks go, the item leaves the inbox, its status stays). On an item of a
 *   table, a "reopened" ask alone is cleared instead ("clear"). An "update" ask is ticked off
 *   ("tick-update") and the other asks are filed with it; so is the "closed" ask of an own item
 *   someone else closed. An item outside the tables (neither assigned to the viewer nor opened
 *   by them) is filed and loses its plan ("file" with `unplan`); no "done" is stored.
 * - Assigned to me (the viewer's own work): D is "my part done" ("hand-off"), whatever asks the
 *   item has; those stay in the inbox until filed there. A finished part gets "none", also
 *   with an update waiting in the inbox.
 * - Created by me (monitoring): no D ("blocked", hidden): asks are filed in the inbox, and the
 *   item ends on GitHub (see `lockOf`).
 * - Planned: as in the item's home view, an assignment as in Assigned to me, an own item as in
 *   Created by me, anything else is filed as in the inbox.
 * - Follow-up: D ends the follow-up ("clear"); the item returns where it came from.
 * - Done: "none".
 *
 * "Open" on an item whose part is done takes it back into the work ("resume").
 *
 * @param c       The item as classified.
 * @param status  The status the viewer chose.
 * @param me      The viewer's login.
 * @param view    The view the viewer chose it in.
 *
 * @example
 *   planStatus(entry, "done", "octocat", "inbox");    // { do: "file" } for an assignment with a mention
 *   planStatus(entry, "done", "octocat", "assigned"); // { do: "hand-off" } for the same one
 */
export function planStatus(c: Classified, status: Status, me: string, view: View): StatusPlan {
  if (status === "open" && c.updates) return { do: "resume" };
  if (status !== "done") return { do: "set", status };
  if (view === "done") return { do: "none" };
  if (view === "snoozed") return { do: "clear" };
  const home = view === "planned" ? (onPlate(c, me) ? "assigned" : sameLogin(c.item.author, me) ? "authored" : null) : view;
  if (home === "inbox") {
    if (c.asks.includes("update")) return { do: "tick-update" };
    if (c.asks.includes("closed")) return { do: "file" };
    if (!inTable(c, me)) return { do: "file", unplan: true };
    if (c.asks.length === 0) return { do: "none" };
    return { do: c.asks.every((ask) => ask === "reopened") ? "clear" : "file" };
  }
  if (home === "assigned" && onPlate(c, me)) return c.updates ? { do: "none" } : { do: "hand-off" };
  if (home === "authored") return { do: "blocked" };
  if (home === null) return { do: "file", unplan: true };
  return { do: "set", status };
}

/**
 * Whether D on an item first asks what to do with its open asks: it would hand off ("my part
 * done"), and asks wait in the inbox. Enter then keeps them, D files them too.
 *
 * @example
 *   needsAskChoice(entry, "done", "octocat", "assigned"); // true for an assignment with a mention
 */
export function needsAskChoice(c: Classified, status: Status, me: string, view: View): boolean {
  return c.asks.length > 0 && planStatus(c, status, me, view).do === "hand-off";
}

/**
 * Why D may change no status of an open item, if so: the viewer opened it. Null for closed items
 * and everything else. An own issue assigned to the viewer is still handed off in Assigned to me
 * (see `lockedDone`).
 *
 * @example
 *   lockOf(entry, "octocat"); // "own" for an open issue octocat opened
 */
export function lockOf({ item }: Pick<Classified, "item">, me: string): Lock | null {
  return !item.closed && sameLogin(item.author, me) ? "own" : null;
}

/**
 * A "done" stored on an item D may no longer finish (see `lockOf`): from before the lock, it would
 * hide open work for good, so the app clears it. Not on an own issue assigned to the viewer: there
 * D is "my part done", and that hand-off is kept.
 *
 * @example
 *   lockedDone(entry, { status: "done" }, "octocat"); // false for an own issue assigned to octocat
 */
export function lockedDone({ item }: Pick<Classified, "item">, stored: Pick<StoredStatus, "status"> | undefined, me: string): boolean {
  const handsOff = item.kind !== "pr" && item.reasons.includes("assigned");
  return stored?.status === "done" && lockOf({ item }, me) !== null && !handsOff;
}

/** Whether D is offered for an item: as usual, not at all, or alone for a closed item that waits in the inbox. */
export type DoneAccess = "on" | "hidden" | "closed";

/** Whether D works on an item closed on GitHub: only where it files the closing or ticks off an update. */
export function actsOnClosed(plan: StatusPlan): boolean {
  return plan.do === "file" || plan.do === "tick-update";
}

/**
 * How D is offered for an item in a view: as usual while it files, hands off or sets something,
 * not at all where it never applies (Created by me, and own items in Planned), and as the only
 * status of a closed item that waits in the inbox.
 *
 * @example
 *   doneAccess(entry, "octocat", "authored"); // "hidden" for any own item
 */
export function doneAccess(c: Classified, me: string, view: View): DoneAccess {
  const plan = planStatus(c, "done", me, view);
  return plan.do === "blocked" ? "hidden" : c.item.closed && actsOnClosed(plan) ? "closed" : "on";
}

/**
 * Whether D keeps the item's plan and calendar event instead of ending them: whenever it sets "my
 * part done" or ticks off an update, in any view, as the calendar is the record of what was done
 * when. The plan goes once the item closes on GitHub (see `keepsPlan`).
 *
 * @param plan  What D does to the item (see `planStatus`).
 *
 * @example
 *   keepsItsPlan({ do: "hand-off" }); // true
 */
export function keepsItsPlan(plan: StatusPlan): boolean {
  return plan.do === "hand-off" || plan.do === "tick-update";
}

/** Open and in a table: assigned to the viewer, or opened by them. */
function inTable({ item }: Pick<Classified, "item">, me: string): boolean {
  return !item.closed && (item.reasons.includes("assigned") || sameLogin(item.author, me));
}
