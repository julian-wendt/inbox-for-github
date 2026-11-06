import type { Classified } from "../classify";
import { t } from "./i18n";
import { datedText, type Dated } from "./plan";
import { reminderText, untilShort } from "./snooze";

/**
 * The follow-up date of an item that waits for one, which is what its row and chip show: the
 * item is stored as "snoozed" with a date that has not passed yet. Nothing once the date has
 * passed, since the item is then back in the inbox and needs no mark; nothing for a follow-up
 * without a date.
 *
 * @example
 *   followUpOf(entry); // { at: "2026-10-26T08:00:00Z" }
 */
export function followUpOf(entry: Pick<Classified, "status" | "until">): { at: string } | null {
  return entry.status === "snoozed" && entry.until ? { at: entry.until } : null;
}

/**
 * Whether the classified item belongs in the Follow-up view: still a follow-up, whichever list it
 * otherwise sits in. `classify` already turned one whose date passed back into "open". One that a mention since brought into
 * the inbox still counts, as it still waits.
 *
 * @example
 *   isWaiting(entry); // true for an assignment set to follow up next Monday
 */
export function isWaiting(entry: Pick<Classified, "status" | "item">): boolean {
  return entry.status === "snoozed" && !entry.item.closed;
}

/**
 * What the row of a follow-up with a date shows at its end instead of its age: when it comes
 * back (see `untilShort`), with the full time as tooltip. Nothing without a date.
 *
 * @example
 *   followUpWhen(entry); // { text: "Mon", title: "Follow-up Mon, 26 Oct, 09:00" }
 */
export function followUpWhen(entry: Pick<Classified, "status" | "until">, now = new Date()): { text: string; title: string } | undefined {
  const followUp = followUpOf(entry);
  return followUp ? { text: untilShort(followUp.at, now), title: t("snooze.reminderAt", { until: reminderText(followUp.at) }) } : undefined;
}

/** What a row shows at its end instead of its age, with the icon that says what kind of "when" it is. */
export interface RowWhen {
  text: string;
  title: string;
  /** A plan or a follow-up; none for Today, whose bar says it already. An event has its own mark (see `eventText`). */
  icon?: "plan" | "followUp";
}

/**
 * The end of a row: in Planned the plan's day (see `datedText`), elsewhere a follow-up's return
 * time (see `followUpWhen`), each with its icon; a pin for today gets none. Nothing for a plain age.
 *
 * @param planned  Whether the row is in the Planned view.
 *
 * @example
 *   rowWhen(entry, { kind: "planned", day: "2026-10-29" }, true); // { text: "Thursday", title: "…", icon: "plan" }
 */
export function rowWhen(entry: Pick<Classified, "status" | "until">, dated: Dated | null, planned: boolean, now = new Date()): RowWhen | undefined {
  if (planned && dated) return { ...datedText(dated, now), icon: dated.kind === "planned" ? "plan" : undefined };
  const followUp = followUpWhen(entry, now);
  return followUp && { ...followUp, icon: "followUp" };
}
