import type { Classified } from "../classify";
import type { Status } from "../model";
import { sameLogin } from "../timeline";
import { onPlate } from "./assignments";
import type { View } from "./labels";

/**
 * Why D does nothing: an own item still open on GitHub ("open"), any item in Created by me
 * ("created"), or an assignment in Assigned to me nobody else is on ("alone"). The last two are
 * fixed by the view, so the menus grey D out there.
 */
export type Blocked = "open" | "created" | "alone";

/** What choosing a status does to an item; `App` carries it out and announces it. */
export type StatusPlan =
  | { do: "resume" }
  | { do: "tick-update" }
  | { do: "hand-off" }
  | { do: "clear" }
  | { do: "file" }
  | { do: "blocked"; why: Blocked }
  | { do: "set"; status: Status }
  | { do: "none" };

/**
 * Decides what a status chosen for an item means. "Done" means more where there is more to end:
 * an update is ticked off with a fresh snapshot; an assignment of
 * the table becomes "my part done", which follows its updates and ignores another "done".
 * "Open" on an item whose part is done takes it back into the work.
 *
 * What the viewer opened is finished by closing or merging it on GitHub, so D does not finish it
 * (it would stay open there and drop out of every list for good): "blocked" asks for a warning.
 * Only an issue with another assignee besides the viewer can have "my part done". Back from a
 * follow-up or a reopen, such an item asks again; D files it without hiding it ("clear").
 *
 * An item of the tables (assigned or the viewer's own) that asks for feedback or a thread answer,
 * and an own item someone else closed, are filed instead ("file": the "filedAt" setting): the asks go, the item
 * stays where it is, and an assignment keeps the viewer's part; D once more, without asks, ends it.
 *
 * In Created by me D does nothing at all: an own item ends by closing it on GitHub. In Assigned
 * to me it does nothing while the viewer is the only assignee, so no work is left without anyone.
 *
 * @param c       The item as classified.
 * @param status  The status the viewer chose.
 * @param me      The viewer's login.
 * @param view    The view the viewer chose it in; without one, as in the inbox.
 *
 * @example
 *   planStatus(entry, "done", "octocat"); // { do: "hand-off" } for an open assignment
 */
export function planStatus(c: Classified, status: Status, me: string, view?: View): StatusPlan {
  if (status === "open" && c.updates) return { do: "resume" };
  if (status !== "done") return { do: "set", status };
  if (c.asks.includes("update")) return { do: "tick-update" };
  if (c.updates) return { do: "none" };
  const why = viewBlocks(c, me, view);
  if (why) return { do: "blocked", why };
  if (c.asks.includes("closed") || (inTable(c, me) && c.asks.some((ask) => ask === "feedback" || ask === "reply"))) return { do: "file" };
  if (openOnGitHubForGood(c, me)) return c.asks.includes("reopened") ? { do: "clear" } : { do: "blocked", why: "open" };
  if (onPlate(c, me)) return { do: "hand-off" };
  return { do: "set", status };
}

/**
 * Why the view alone keeps D from an open item, if it does: Created by me, or Assigned to me with
 * the viewer as the only assignee. Null in every other view.
 *
 * @example
 *   viewBlocks(entry, "octocat", "assigned"); // "alone" for an issue only octocat is assigned to
 */
export function viewBlocks({ item }: Pick<Classified, "item">, me: string, view?: View): Blocked | null {
  if (item.closed) return null;
  if (view === "authored") return "created";
  if (view === "assigned" && item.assignees.length > 0 && item.assignees.every((a) => sameLogin(a, me))) return "alone";
  return null;
}

/** Whether a view offers D for an item: as usual, greyed out, or not at all. */
export type DoneAccess = "on" | "off" | "hidden";

/**
 * How a view offers D for an item: not at all in Created by me, where it never applies, and
 * greyed out in Assigned to me while the viewer is the only assignee (see `viewBlocks`).
 *
 * @example
 *   doneAccess(entry, "octocat", "authored"); // "hidden"
 */
export function doneAccess(c: Pick<Classified, "item">, me: string, view?: View): DoneAccess {
  const why = viewBlocks(c, me, view);
  return why === "created" ? "hidden" : why === "alone" ? "off" : "on";
}

/** Open and in a table: assigned to the viewer, or opened by them. */
function inTable({ item }: Classified, me: string): boolean {
  return !item.closed && (item.reasons.includes("assigned") || sameLogin(item.author, me));
}

/** An item the viewer opened that D cannot finish: a pull request, or an issue without another assignee to hand a part to. */
function openOnGitHubForGood(c: Classified, me: string): boolean {
  const { item } = c;
  if (item.closed || !sameLogin(item.author, me)) return false;
  if (item.kind === "pr") return true;
  return !(item.assignees.some((a) => sameLogin(a, me)) && item.assignees.some((a) => !sameLogin(a, me)));
}
