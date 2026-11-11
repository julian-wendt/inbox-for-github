import { CalendarClock, CalendarDays, CircleDot, GitPullRequest, RotateCw, X } from "lucide-react";
import type { Classified } from "../../classify";
import type { Item, Status } from "../../model";
import { t } from "../i18n";
import { STATUSES } from "../labels";
import { followUpOf, type RowWhen } from "../followUp";
import { datedText, eventText, type Dated } from "../plan";
import { reminderText } from "../snooze";
import { StatusIcon } from "./StatusIcon";

/**
 * Glyph telling issues and pull requests apart, with the kind as its tooltip. Given a status, it
 * takes that status's color, a heavier stroke so the color reads, and names it in the tooltip, so a
 * list row needs no separate marker.
 *
 * @example
 *   <KindIcon item={item} size={14} /> // pull request glyph for a PR, issue glyph otherwise
 *   <KindIcon item={item} status="snoozed" /> // tooltip "Issue · Snoozed"
 */
export function KindIcon({ item, size = 14, status }: { item: Pick<Item, "kind">; size?: number; status?: Status }) {
  const [Icon, kind] = item.kind === "pr" ? [GitPullRequest, "Pull Request"] : [CircleDot, "Issue"];
  const label = status ? `${kind} · ${STATUSES.find((s) => s.id === status)!.title}` : kind;
  return (
    <span className={`kind-icon${status ? ` st-${status}` : ""}`} title={label}>
      <Icon size={size} strokeWidth={status ? 2.6 : 2} aria-label={label} />
    </span>
  );
}

/**
 * The detail's chip for an item that waits for a follow-up date: the follow-up icon, date and time. Gone once
 * the item is back in the inbox (see `followUpOf`).
 *
 * @param onRemove  Adds a × that takes the follow-up off the item.
 *
 * @example
 *   <FollowUpChip entry={entry} onRemove={() => remove(entry)} /> // [clock] Mon, 26 Oct, 09:00 [×]
 */
export function FollowUpChip({ entry, onRemove }: { entry: Pick<Classified, "status" | "until">; onRemove?: () => void }) {
  const followUp = followUpOf(entry);
  if (!followUp) return null;
  const text = reminderText(followUp.at);
  return (
    <span className="chip" title={t("snooze.reminderAt", { until: text })}>
      <StatusIcon status="snoozed" size={13} />
      {text}
      {onRemove && (
        <button className="chip-x" title={`${t("reminder.remove")} (X)`} aria-label={t("reminder.remove")} onClick={onRemove}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}

/**
 * The mark of a dated item's calendar event, beside its day: the clock calendar and the start
 * time once known, "In the calendar" as tooltip (see `eventText`). Nothing without an event.
 *
 * @param className  The mark's style: `row-mark` in list rows, `table-planned` in table rows.
 *
 * @example
 *   <EventMark dated={{ kind: "today", day: "2026-10-29", event: { start } }} className="row-mark" /> // [clock calendar] 14:00
 */
export function EventMark({ dated, className }: { dated: Dated; className: string }) {
  const event = eventText(dated);
  if (!event) return null;
  return (
    <span className={`${className} event-mark`} title={event.title} aria-label={event.title}>
      <CalendarClock size={13} strokeWidth={1.75} aria-hidden />
      {event.text && <span>{event.text}</span>}
    </span>
  );
}

const WHEN_ICONS = { plan: CalendarDays, followUp: RotateCw };

/**
 * The icon before a row's trailing "when" (see `rowWhen`), in the text's color; nothing without one.
 *
 * @example
 *   <WhenIcon when={{ text: "Mon", title: "…", icon: "followUp" }} /> // RotateCw
 */
export function WhenIcon({ when }: { when: RowWhen }) {
  if (!when.icon) return null;
  const Icon = WHEN_ICONS[when.icon];
  return <Icon size={13} strokeWidth={1.75} aria-hidden />;
}

/**
 * The detail's chip for an item pinned for today or planned for a day: the plan's icon and
 * "Today", "Tomorrow", the weekday within this work week or the date (see `datedText`), the same
 * text as the row's mark, followed by the event's mark (see `EventMark`). A click opens the plan
 * choices below it.
 *
 * @param onPlan  Gets the chip's box, to open the plan menu under it.
 *
 * @example
 *   <PlanChip dated={{ kind: "planned", day: "2026-10-29", event: { start } }} onPlan={(at) => plan(entry, at)} /> // [calendar] Thursday [clock calendar] 14:00
 */
export function PlanChip({ dated, onPlan }: { dated: Dated; onPlan: (at: DOMRect) => void }) {
  const { text, title } = datedText(dated);
  return (
    <button className="chip chip-link plan-chip" title={`${title} (P)`} onClick={(e) => onPlan(e.currentTarget.getBoundingClientRect())}>
      <CalendarDays size={13} strokeWidth={1.75} aria-hidden />
      {text}
      <EventMark dated={dated} className="row-mark" />
    </button>
  );
}
