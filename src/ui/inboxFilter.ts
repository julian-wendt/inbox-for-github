import type { Classified } from "../classify";
import type { View } from "./labels";
import { mentionsOf } from "../timeline";

/** The switch of the Inbox, Snoozed and Done: everything, only mentions, or only review requests. */
export type AskFilter = "all" | "mention" | "review";

export const ASK_FILTERS: AskFilter[] = ["all", "mention", "review"];

/** The views that offer the mentions/reviews switch instead of Issues/Pull Requests. */
export const ASK_VIEWS: View[] = ["inbox", "snoozed", "done"];

/**
 * Whether an item passes the switch. In the inbox it follows what keeps the item there: "review"
 * holds pull requests whose review request does (asked, reopened or due), "mention" everything
 * else. Elsewhere it follows what the item was about: a review request to the viewer, or a
 * mention of them. An item about both shows under both.
 *
 * @param me  The viewer's login, for mentions outside the inbox.
 *
 * @example
 *   matchesAsk(entry, "review", "octocat"); // true for an unanswered review request
 */
export function matchesAsk(entry: Pick<Classified, "item" | "mention" | "asks" | "bucket">, filter: AskFilter, me: string): boolean {
  if (filter === "all") return true;
  const requested = entry.item.reasons.includes("review");
  if (entry.bucket !== "inbox") return filter === "review" ? requested : mentionsOf(entry.item, me).length > 0;
  const review = requested && entry.asks.some((a) => a === "review" || a === "reopened" || a === "due");
  return filter === "review" ? review : entry.mention !== null || !review;
}
