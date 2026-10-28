import type { Classified } from "../classify";
import type { Status } from "../model";
import { sameLogin } from "../timeline";
import { onPlate } from "./assignments";

/** What choosing a status does to an item; `App` carries it out and announces it. */
export type StatusPlan =
  | { do: "resume" }
  | { do: "tick-update" }
  | { do: "hand-off" }
  | { do: "tick-due" }
  | { do: "blocked" }
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
 * Only an issue with another assignee besides the viewer can have "my part done". A follow-up
 * that came due on such an item is filed by D without hiding the item ("tick-due").
 *
 * @param c       The item as classified.
 * @param status  The status the viewer chose.
 * @param me      The viewer's login.
 *
 * @example
 *   planStatus(entry, "done", "octocat"); // { do: "hand-off" } for an open assignment
 */
export function planStatus(c: Classified, status: Status, me: string): StatusPlan {
  if (status === "open" && c.updates) return { do: "resume" };
  if (status !== "done") return { do: "set", status };
  if (c.asks.includes("update")) return { do: "tick-update" };
  if (c.updates) return { do: "none" };
  if (openOnGitHubForGood(c, me)) return c.asks.includes("due") ? { do: "tick-due" } : { do: "blocked" };
  if (onPlate(c, me)) return { do: "hand-off" };
  return { do: "set", status };
}

/** An item the viewer opened that D cannot finish: a pull request, or an issue without another assignee to hand a part to. */
function openOnGitHubForGood(c: Classified, me: string): boolean {
  const { item } = c;
  if (item.closed || !sameLogin(item.author, me)) return false;
  if (item.kind === "pr") return true;
  return !(item.assignees.some((a) => sameLogin(a, me)) && item.assignees.some((a) => !sameLogin(a, me)));
}
