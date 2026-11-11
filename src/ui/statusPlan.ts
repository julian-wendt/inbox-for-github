import type { Classified } from "../classify";
import type { Status } from "../model";
import { sameLogin } from "../timeline";
import { onPlate } from "./assignments";

/**
 * Why D changes no status on an item: the viewer opened it ("own"; it ends by closing or merging
 * it on GitHub). D still files what asks on such an item.
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
 * Decides what a status chosen for an item means. "Done" means more where there is more to end:
 * an update is ticked off with a fresh snapshot; an assignment becomes "my part done", which
 * follows its updates and ignores another "done". "Open" on an item whose part is done takes it
 * back into the work.
 *
 * A locked item (see `lockOf`) never gets "done" or "my part done", in any view. D on it files
 * whatever asks ("file": the "filedAt" setting): the asks go, the item stays where it is. Back
 * from a follow-up or a reopen alone, it clears the stored Open instead ("clear"). Without asks,
 * D does nothing ("blocked"). An own item someone else closed is filed the same way, and so are
 * feedback and thread answers on any item of the tables.
 *
 * An assignment of the viewer alone is not locked: D there means "my part done" for now, as on a
 * shared one, and the item keeps its plan (see `keepsItsPlan`), so nothing is left lying.
 *
 * @param c       The item as classified.
 * @param status  The status the viewer chose.
 * @param me      The viewer's login.
 *
 * @example
 *   planStatus(entry, "done", "octocat"); // { do: "hand-off" } for an assignment, shared or not
 */
export function planStatus(c: Classified, status: Status, me: string): StatusPlan {
  if (status === "open" && c.updates) return { do: "resume" };
  if (status !== "done") return { do: "set", status };
  if (c.asks.includes("update")) return { do: "tick-update" };
  if (c.updates) return { do: "none" };
  if (c.asks.includes("closed") || (inTable(c, me) && c.asks.some((ask) => ask === "feedback" || ask === "reply"))) return { do: "file" };
  const lock = lockOf(c, me);
  if (lock) {
    if (c.asks.length === 0) return { do: "blocked", why: lock };
    return c.asks.every((ask) => ask === "reopened") ? { do: "clear" } : { do: "file" };
  }
  if (onPlate(c, me)) return { do: "hand-off" };
  return { do: "set", status };
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
 * How D is offered for an item: as usual while it has something to do, and not at all on an own
 * item without asks (it never applies there).
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
