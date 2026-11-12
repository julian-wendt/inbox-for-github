import type { Classified } from "../classify";
import { t } from "./i18n";

/**
 * Which items deserve a notification now, given the inbox items already known.
 *
 * The first result (`known` is null) is the baseline, so a restart does not replay the inbox.
 * After that, every item that newly enters the inbox or whose ask changed (see `askKey`) notifies,
 * except one that only asks again: the viewer reopened it ("reopened"), or its follow-up came
 * due ("due"), and both return quietly.
 *
 * @param classified  The current classification.
 * @param known       Item id → `askKey` of the inbox items in the previous result, or null before the first one.
 * @returns The items to notify about, in list order.
 *
 * @example
 *   arrivals(classified, null);                         // nothing: the baseline
 *   arrivals(classified, new Map([["I_1", askKey(c)]])); // every inbox item but I_1, unless its ask changed
 */
export function arrivals(classified: Classified[], known: ReadonlyMap<string, string> | null): Classified[] {
  if (!known) return [];
  return classified.filter((c) => c.bucket === "inbox" && known.get(c.item.id) !== askKey(c) && !c.asks.every((ask) => ask === "reopened" || ask === "due"));
}

/** What an inbox item asks, with the time of the ask: it changes when a new mention or feedback comes in. */
export function askKey({ asks, mention, feedback }: Pick<Classified, "asks" | "mention" | "feedback">): string {
  return [...asks, mention?.at, feedback?.at].join("|");
}

/** Why an item notifies; each has its own switch in the settings. */
export type NotifyReason = "mention" | "review" | "reminder" | "update" | "feedback";

/** The reasons in the order the settings list them. */
export const NOTIFY_REASONS: NotifyReason[] = ["mention", "review", "feedback", "reminder", "update"];

/**
 * Why an inbox item notifies: the viewer mentioned themselves as a note to self, an item whose
 * part they finished moved, someone gave feedback, answered in a review thread or closed an own
 * item, a review is requested, or someone mentioned them.
 *
 * @example
 *   notifyReason(entry); // "mention"
 */
export function notifyReason({ asks, mention }: Pick<Classified, "asks" | "mention">): NotifyReason {
  if (asks.includes("update")) return "update";
  if (!mention && !asks.some((ask) => ask === "review" || ask === "commits") && asks.some((ask) => ask === "feedback" || ask === "reply" || ask === "closed")) return "feedback";
  if (!mention) return "review";
  return mention.self ? "reminder" : "mention";
}

/**
 * Whether a reason may notify; reasons without an entry in `switches` do, as before switches existed.
 *
 * @example
 *   notifies("review", { review: false }); // false
 */
export function notifies(reason: NotifyReason, switches: Partial<Record<NotifyReason, boolean>>): boolean {
  return switches[reason] ?? true;
}

/**
 * The title of an item's notification, by its reason (`notifyReason`), e.g. "bob mentioned you".
 *
 * @example
 *   notificationTitle(entry); // "bob mentioned you"
 */
export function notificationTitle(entry: Pick<Classified, "asks" | "mention"> & Partial<Pick<Classified, "feedback" | "repliedBy" | "closedBy">>): string {
  switch (notifyReason(entry)) {
    case "feedback":
      if (entry.closedBy) return t("notify.closedBy", { name: entry.closedBy });
      if (entry.repliedBy && !entry.feedback) return t("notify.replied", { name: entry.repliedBy });
      return t(`notify.feedback.${entry.feedback?.kind ?? "commented"}`, { name: entry.feedback?.by ?? "" });
    case "reminder":
      return t("notify.reminder");
    case "update":
      return t("notify.update");
    case "review":
      return t("notify.reviewRequested");
    case "mention":
      return t("notify.mentioned", { name: entry.mention?.by ?? "" });
  }
}
