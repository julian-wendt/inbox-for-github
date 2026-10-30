import { CalendarCheck, CalendarDays, CircleDot, GitPullRequest, RotateCw, X, type LucideProps } from "lucide-react";
import type { Classified } from "../../classify";
import type { Item, Status } from "../../model";
import { t } from "../i18n";
import { STATUSES } from "../labels";
import { followUpOf, type RowWhen } from "../followUp";
import { datedText, startText, type Dated } from "../plan";
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
    <span className="chip reminder-chip" title={t("snooze.reminderAt", { until: text })}>
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
 * A plan's icon: the calendar with a check while the plan has an event in the calendar, else the
 * plain calendar, also without a plan. Takes lucide's props for size, stroke and color.
 *
 * @example
 *   <PlanIcon dated={{ kind: "planned", day: "2026-10-29", event: {} }} size={12} /> // CalendarCheck
 */
export function PlanIcon({ dated, ...props }: { dated: Dated | null } & LucideProps) {
  const Icon = dated?.event ? CalendarCheck : CalendarDays;
  return <Icon aria-hidden {...props} />;
}

const WHEN_ICONS = { plan: CalendarDays, event: CalendarCheck, followUp: RotateCw };

/**
 * The icon before a row's trailing "when" (see `rowWhen`), in the text's color; nothing without one.
 *
 * @example
 *   <WhenIcon when={{ text: "Mon", title: "…", icon: "followUp" }} /> // RotateCw
 */
export function WhenIcon({ when }: { when: RowWhen }) {
  if (!when.icon) return null;
  const Icon = WHEN_ICONS[when.icon];
  return <Icon size={13} strokeWidth={2.2} aria-hidden />;
}

/**
 * The detail's chip for an item pinned for today or planned for a day: the plan's icon and
 * "Today", "Tomorrow", the weekday within this work week or the date (see `datedText`), the same
 * text as the row's mark, followed by the event's start time once the calendar gave it back
 * ("Thursday 14:00"). A click opens the plan choices below it.
 *
 * @param onPlan  Gets the chip's box, to open the plan menu under it.
 *
 * @example
 *   <PlanChip dated={{ kind: "planned", day: "2026-10-29" }} onPlan={(at) => plan(entry, at)} /> // [calendar] Thursday
 */
export function PlanChip({ dated, onPlan }: { dated: Dated; onPlan: (at: DOMRect) => void }) {
  const { text, title } = datedText(dated);
  return (
    <button className="chip chip-link plan-chip" title={`${title} (P)`} onClick={(e) => onPlan(e.currentTarget.getBoundingClientRect())}>
      <PlanIcon dated={dated} size={15} strokeWidth={2.2} />
      {dated.event?.start === undefined ? text : `${text} ${startText(dated.event.start)}`}
    </button>
  );
}
