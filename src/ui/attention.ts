import type { Classified } from "../classify";
import { t } from "./i18n";

/**
 * Which items deserve a notification now, given the inbox items already known.
 *
 * Before the first result (`known` is null) only snoozes whose date passed while the app was
 * closed notify: they are due in this very result (`statusReset`), not yet written back. Every
 * other item in that first result is the baseline, so a restart does not replay the inbox.
 * After that, every item that newly enters the inbox notifies.
 *
 * @param classified  The current classification.
 * @param known       Ids of the inbox items in the previous result, or null before the first one.
 * @returns The items to notify about, in list order.
 *
 * @example
 *   arrivals(classified, null);              // only the snoozes that ended while the app was closed
 *   arrivals(classified, new Set(["I_1"]));  // every inbox item but I_1
 */
export function arrivals(classified: Classified[], known: ReadonlySet<string> | null): Classified[] {
  const inbox = classified.filter((c) => c.bucket === "inbox");
  if (!known) return inbox.filter((c) => c.statusReset && c.asks.includes("due"));
  return inbox.filter((c) => !known.has(c.item.id));
}

/** Why an item notifies; each has its own switch in the settings. */
export type NotifyReason = "mention" | "review" | "due" | "reminder" | "update";

/** The reasons in the order the settings list them. */
export const NOTIFY_REASONS: NotifyReason[] = ["mention", "review", "due", "reminder", "update"];

/**
 * Why an inbox item notifies: its follow-up date came, the viewer mentioned themselves as a note
 * to self, an item whose part they finished moved, a review is requested, or someone mentioned them.
 *
 * @example
 *   notifyReason(entry); // "mention"
 */
export function notifyReason({ asks, mention }: Pick<Classified, "asks" | "mention">): NotifyReason {
  if (asks.includes("due")) return "due";
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
    case "due":
      return t("notify.due");
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
