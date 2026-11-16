import type { Ask, Classified } from "../classify";
import { t } from "./i18n";
import { dayChoices } from "./plan";
import { followUpOn, thisAfternoon } from "./snooze";

/**
 * Which items deserve a notification now, given the inbox items already known.
 *
 * The first result (`known` is null) is the baseline, so a restart does not replay the inbox.
 * After that, every item that newly enters the inbox or whose ask changed (see `askKey`) notifies,
 * except one that only asks again: the viewer opened it again (O), someone reopened it on GitHub,
 * someone posted with "Any post" on, or its follow-up came due; these return quietly. A due
 * follow-up also raises again what was pending when F was pressed; those asks are older than the
 * due time and stay quiet too, while one newer than it notifies.
 *
 * An ask from before `since` is old news: an item that was missing from the previous result,
 * e.g. cut from a search, comes back quietly. An ask of unknown time still notifies.
 *
 * @param classified  The current classification.
 * @param known       Item id → `askKey` of the inbox items in the previous result, or null before the first one.
 * @param since       Asks before then (ISO 8601) stay quiet; null lets every ask notify.
 * @returns The items to notify about, in list order.
 *
 * @example
 *   arrivals(classified, null);                         // nothing: the baseline
 *   arrivals(classified, new Map([["I_1", askKey(c)]])); // every inbox item but I_1, unless its ask changed
 *   arrivals(classified, known, "2026-11-13T09:55:00Z"); // as above, but only asks made since 09:55
 */
export function arrivals(classified: Classified[], known: ReadonlyMap<string, string> | null, since: string | null = null): Classified[] {
  if (!known) return [];
  return classified.filter((c) => c.bucket === "inbox" && known.get(c.item.id) !== askKey(c) && c.asks.some((ask) => loud(c, ask, since)));
}

const quiet = (ask: Ask) => ask === "opened" || ask === "reopened" || ask === "post" || ask === "due";

function loud({ asked }: Classified, ask: Ask, since: string | null): boolean {
  const at = asked[ask];
  return !quiet(ask) && !(asked.due && (at ?? "") <= asked.due) && !(since && at && at < since);
}

/**
 * Whether an item's follow-up rings: "Remind me" is on and it asks as due (see `Classified.notify`).
 *
 * @example
 *   ringing({ notify: true, asks: ["due"] }); // true
 */
export function ringing(c: Pick<Classified, "notify" | "asks">): boolean {
  return !!c.notify && c.asks.includes("due");
}

/**
 * The due reminders to notify about now: items that ring (see `ringing`) and did not in the
 * previous result. On the first result (`rang` is null) those that came due after `since`, so a
 * reminder missed while the app was quit rings once at start.
 *
 * @param classified  The current classification.
 * @param rang        Ids that rang in the previous result, or null before the first one.
 * @param since       When a reminder last rang (`notifyRangAt`), else the cached fetch's time (ISO 8601); null without either.
 * @returns The items to notify about, in list order.
 *
 * @example
 *   dueReminders(classified, null, "2026-11-12T17:00:00Z"); // what came due since yesterday evening
 *   dueReminders(classified, new Set(["I_1"]), null);       // what rings now apart from I_1
 */
export function dueReminders(classified: Classified[], rang: ReadonlySet<string> | null, since: string | null): Classified[] {
  return classified.filter((c) => ringing(c) && (rang ? !rang.has(c.item.id) : !!since && (c.asked.due ?? "") > since));
}

/** A "Later" button of a reminder's notification: its action id, its title, and when the follow-up comes due again (ISO 8601). */
export interface Later {
  id: string;
  title: string;
  until: string;
}

/**
 * The "Later" choices of a reminder's notification: in an hour, this afternoon (see
 * `thisAfternoon`) while it is earlier than 14:00, and the next workday at the "followUpTime" (see `dayChoices`).
 *
 * @param now           When the notification goes out.
 * @param workdays      The "workdays" setting.
 * @param followUpTime  The "followUpTime" setting ("09:00").
 *
 * @example
 *   laterChoices(new Date(2026, 10, 13, 9), [1, 2, 3, 4, 5], "09:00"); // a Friday: in 1 hour, 14:00, Monday 09:00
 */
export function laterChoices(now: Date, workdays: readonly number[], followUpTime: string): Later[] {
  const afternoon = thisAfternoon(now);
  return [
    { id: "later-hour", title: t("notify.later.hour"), until: new Date(now.getTime() + 3_600_000).toISOString() },
    ...(afternoon ? [{ id: "later-afternoon", title: t("snooze.afternoon"), until: afternoon }] : []),
    { id: "later-workday", title: t("plan.nextWorkday"), until: followUpOn(dayChoices(now, workdays)[0].day, followUpTime) },
  ];
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
