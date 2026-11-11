import type { Classified } from "../classify";
import type { Status } from "../model";
import { sameLogin } from "../timeline";
import { onPlate } from "./assignments";

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
  | { do: "file" }
  | { do: "blocked"; why: Lock }
  | { do: "set"; status: Status }
  | { do: "none" };

/**
 * Decides what a status chosen for an item means. D on an item of the tables (assigned to the
 * viewer, or opened by them) follows one rule:
 *
 * 1. Something asks for the viewer (mention, review request, feedback, thread answer, closing by
 *    another, ...): D only files it ("file": the "filedAt" setting). The asks go, the item
 *    leaves the inbox, its status stays. If "reopened" is the only ask, D clears the stored Open
 *    instead ("clear").
 * 2. Nothing asks: D ends the viewer's part. An assignment becomes "my part done" ("hand-off"),
 *    which follows its updates and ignores another D ("none"). An own item gets nothing
 *    ("blocked"; see `lockOf`), and D is not offered there.
 *
 * An "update" ask is ticked off first ("tick-update"), with a fresh snapshot. "Open" on an item
 * whose part is done takes it back into the work. An item outside the tables just becomes done.
 *
 * @param c       The item as classified.
 * @param status  The status the viewer chose.
 * @param me      The viewer's login.
 *
 * @example
 *   planStatus(entry, "done", "octocat"); // { do: "file" } for an assignment with a mention
 *   planStatus(entry, "done", "octocat"); // { do: "hand-off" } for the same one after that
 */
export function planStatus(c: Classified, status: Status, me: string): StatusPlan {
  if (status === "open" && c.updates) return { do: "resume" };
  if (status !== "done") return { do: "set", status };
  if (c.asks.includes("update")) return { do: "tick-update" };
  if (c.updates) return { do: "none" };
  if (c.asks.includes("closed")) return { do: "file" };
  if (!inTable(c, me)) return { do: "set", status };
  if (c.asks.length > 0) return c.asks.every((ask) => ask === "reopened") ? { do: "clear" } : { do: "file" };
  const lock = lockOf(c, me);
  if (lock) return { do: "blocked", why: lock };
  return onPlate(c, me) ? { do: "hand-off" } : { do: "set", status };
}

/**
 * Why D may change no status of an open item, if so: the viewer opened it. Null for closed items
 * and everything else.
 *
 * @example
 *   lockOf(entry, "octocat"); // "own" for an open issue octocat opened
 */
export function lockOf({ item }: Pick<Classified, "item">, me: string): Lock | null {
  return !item.closed && sameLogin(item.author, me) ? "own" : null;
}

/** Whether D is offered for an item: as usual, or not at all. */
export type DoneAccess = "on" | "hidden";

/**
 * How D is offered for an item: as usual while it files, hands off or sets something, and not at
 * all on an own item without asks (it never applies there).
 *
 * @example
 *   doneAccess(entry, "octocat"); // "hidden" for an own pull request without asks
 */
export function doneAccess(c: Classified, me: string): DoneAccess {
  return planStatus(c, "done", me).do === "blocked" ? "hidden" : "on";
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
