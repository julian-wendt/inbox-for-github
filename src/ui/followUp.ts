import type { Classified } from "../classify";
import { t } from "./i18n";
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
