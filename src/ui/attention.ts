import type { Classified } from "../classify";
import { t } from "./i18n";

/**
 * Which items deserve a notification now, given the inbox items already known.
 *
 * The first result (`known` is null) is the baseline, so a restart does not replay the inbox.
 * After that, every item that newly enters the inbox notifies, except one that only asks again
 * ("reopened"): the viewer reopened it, or its follow-up date came, and both return quietly.
 *
 * @param classified  The current classification.
 * @param known       Ids of the inbox items in the previous result, or null before the first one.
 * @returns The items to notify about, in list order.
 *
 * @example
 *   arrivals(classified, null);              // nothing: the baseline
 *   arrivals(classified, new Set(["I_1"]));  // every inbox item but I_1
 */
export function arrivals(classified: Classified[], known: ReadonlySet<string> | null): Classified[] {
  const inbox = classified.filter((c) => c.bucket === "inbox");
  if (!known) return [];
  return inbox.filter((c) => !known.has(c.item.id) && !c.asks.every((ask) => ask === "reopened"));
}

/** Why an item notifies; each has its own switch in the settings. */
export type NotifyReason = "mention" | "review" | "reminder" | "update";

/** The reasons in the order the settings list them. */
export const NOTIFY_REASONS: NotifyReason[] = ["mention", "review", "reminder", "update"];

/**
 * Why an inbox item notifies: the viewer mentioned themselves as a note to self, an item whose
 * part they finished moved, a review is requested, or someone mentioned them.
 *
 * @example
 *   notifyReason(entry); // "mention"
 */
export function notifyReason({ asks, mention }: Pick<Classified, "asks" | "mention">): NotifyReason {
  if (asks.includes("update")) return "update";
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
export function notificationTitle(entry: Pick<Classified, "asks" | "mention">): string {
  switch (notifyReason(entry)) {
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
