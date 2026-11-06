import type { Classified } from "../classify";
import type { Status } from "../model";
import { sameLogin } from "../timeline";
import { onPlate } from "./assignments";

/**
 * Why D changes no status on an item: the viewer opened it ("own"; it ends by closing or merging
 * it on GitHub), or it is assigned to the viewer alone ("alone"; no work may be left without
 * anyone on it). D still files what asks on such an item.
 */
export type Lock = "own" | "alone";

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
 * In Planned an assignment of the viewer alone is not locked: D there means "my part done" for
 * now, as on a shared one, and the item keeps its plan (see `keepsPlan`), so nothing is left lying.
 *
 * @param c          The item as classified.
 * @param status     The status the viewer chose.
 * @param me         The viewer's login.
 * @param inPlanned  Whether the viewer chose it in the Planned view.
 *
 * @example
 *   planStatus(entry, "done", "octocat"); // { do: "hand-off" } for an assignment shared with others
 *   planStatus(entry, "done", "octocat", true); // { do: "hand-off" } for one octocat alone is on, too
 */
export function planStatus(c: Classified, status: Status, me: string, inPlanned = false): StatusPlan {
  if (status === "open" && c.updates) return { do: "resume" };
  if (status !== "done") return { do: "set", status };
  if (c.asks.includes("update")) return { do: "tick-update" };
  if (c.updates) return { do: "none" };
  if (c.asks.includes("closed") || (inTable(c, me) && c.asks.some((ask) => ask === "feedback" || ask === "reply"))) return { do: "file" };
  const lock = inPlanned && lockOf(c, me) === "alone" ? null : lockOf(c, me);
  if (lock) {
    if (c.asks.length === 0) return { do: "blocked", why: lock };
    return c.asks.every((ask) => ask === "reopened") ? { do: "clear" } : { do: "file" };
  }
  if (onPlate(c, me)) return { do: "hand-off" };
  return { do: "set", status };
}

/**
 * Why D may change no status of an open item, if so: the viewer opened it, or they are its only
 * assignee. Null for closed items and everything else.
 *
 * @example
 *   lockOf(entry, "octocat"); // "alone" for an issue of someone else only octocat is assigned to
 */
export function lockOf({ item }: Pick<Classified, "item">, me: string): Lock | null {
  if (item.closed) return null;
  if (sameLogin(item.author, me)) return "own";
  if (item.assignees.length > 0 && item.assignees.every((a) => sameLogin(a, me))) return "alone";
  return null;
}

/** Whether D is offered for an item: as usual, greyed out, or not at all. */
export type DoneAccess = "on" | "off" | "hidden";

/**
 * How D is offered for an item: as usual while it has something to do, not at all on an own item
 * without asks (it never applies there), and greyed out on one assigned to the viewer alone.
 *
 * @param inPlanned  Whether the item shows in the Planned view (see `planStatus`).
 *
 * @example
 *   doneAccess(entry, "octocat"); // "hidden" for an own pull request without asks
 */
export function doneAccess(c: Classified, me: string, inPlanned = false): DoneAccess {
  const plan = planStatus(c, "done", me, inPlanned);
  if (plan.do !== "blocked") return "on";
  return plan.why === "own" ? "hidden" : "off";
}

/** Whether D sets "my part done", which in Planned keeps the item's plan instead of ending it. */
export function handsOff(plan: StatusPlan): boolean {
  return plan.do === "hand-off" || plan.do === "tick-update";
}

/** Open and in a table: assigned to the viewer, or opened by them. */
function inTable({ item }: Pick<Classified, "item">, me: string): boolean {
  return !item.closed && (item.reasons.includes("assigned") || sameLogin(item.author, me));
}
