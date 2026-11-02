import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { formatTime, nextRange, nextTime, timeParts, type Delivery, type DeliveryMode } from "../delivery";
import { dateLocale, t } from "../i18n";
import { HOURS, MINUTES } from "../segments";
import { SegmentField } from "./SegmentField";

const MODES: DeliveryMode[] = ["immediately", "hours", "times"];

/** Weekdays Monday first, as `Date.getDay` numbers them. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

const MAX_ENTRIES = 6;

/** 2026-10-25 is a Sunday, so adding `day` lands on that weekday. */
function weekdayName(day: number): string {
  return new Date(2026, 9, 25 + day).toLocaleDateString(dateLocale(), { weekday: "short" });
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (time: string) => void }) {
  const [hours, minutes] = timeParts(value);
  return (
    <SegmentField
      label={label}
      separator=":"
      parts={[
        { label: t("snooze.hour"), value: hours, segment: HOURS },
        { label: t("snooze.minute"), value: minutes, segment: MINUTES },
      ]}
      onChange={(index, part) => onChange(index === 0 ? formatTime(part, minutes) : formatTime(hours, part))}
    />
  );
}

/** A time or a range with its own ×, as one piece; the × shows only where one can go. */
function TimeChip({ removeLabel, onRemove, children }: { removeLabel: string; onRemove?: () => void; children: ReactNode }) {
  return (
    <span className="time-chip">
      {children}
      {onRemove && (
        <button className="icon-btn time-chip-x" aria-label={removeLabel} title={removeLabel} onClick={onRemove}>
          <X size={13} />
        </button>
      )}
    </span>
  );
}

/**
 * The controls for when notifications may arrive: the mode; the days for the other two; the
 * working hours as several ranges, so a break fits between them, or the summary times. Ranges
 * and times stay in the order typed, so a field never moves under the cursor. Days and times sit
 * in one card, each on a labelled line.
 *
 * @param value     The current schedule.
 * @param onChange  Called with the changed schedule on every edit.
 *
 * @example
 *   <DeliveryEditor value={draft.notifyDelivery} onChange={(notifyDelivery) => change({ notifyDelivery })} />
 */
export function DeliveryEditor({ value, onChange }: { value: Delivery; onChange: (next: Delivery) => void }) {
  const toggleDay = (day: number) => onChange({ ...value, days: value.days.includes(day) ? value.days.filter((d) => d !== day) : [...value.days, day] });
  const setRange = (index: number, edge: "from" | "to", time: string) => onChange({ ...value, ranges: value.ranges.map((range, i) => (i === index ? { ...range, [edge]: time } : range)) });
  const setTime = (index: number, time: string) => onChange({ ...value, times: value.times.map((x, i) => (i === index ? time : x)) });
  const removeRange = (index: number) => (value.ranges.length > 1 ? () => onChange({ ...value, ranges: value.ranges.filter((_, i) => i !== index) }) : undefined);
  const removeTime = (index: number) => (value.times.length > 1 ? () => onChange({ ...value, times: value.times.filter((_, i) => i !== index) }) : undefined);

  return (
    <>
      <div className="segmented">
        {MODES.map((mode) => (
          <button key={mode} className={value.mode === mode ? "on" : ""} onClick={() => onChange({ ...value, mode })}>
            {t(`settings.delivery.${mode}`)}
          </button>
        ))}
      </div>
      {value.mode !== "immediately" && (
        <div className="delivery-card">
          <div className="delivery-line">
            <span className="delivery-label">{t("settings.deliveryDays")}</span>
            <div className="segmented multi" role="group" aria-label={t("settings.deliveryDays")}>
              {WEEK.map((day) => (
                <button key={day} className={value.days.includes(day) ? "on" : ""} aria-pressed={value.days.includes(day)} onClick={() => toggleDay(day)}>
                  {weekdayName(day)}
                </button>
              ))}
            </div>
          </div>
          <div className="delivery-line">
            <span className="delivery-label">{t(value.mode === "hours" ? "settings.deliveryHoursLabel" : "settings.deliveryTimesLabel")}</span>
            <div className="delivery-times">
              {value.mode === "hours"
                ? value.ranges.map((range, index) => (
                    <TimeChip key={index} removeLabel={t("settings.deliveryRemove", { time: `${range.from}–${range.to}` })} onRemove={removeRange(index)}>
                      <TimeField label={t("settings.deliveryFrom")} value={range.from} onChange={(time) => setRange(index, "from", time)} />
                      <span className="time-chip-dash">–</span>
                      <TimeField label={t("settings.deliveryTo")} value={range.to} onChange={(time) => setRange(index, "to", time)} />
                    </TimeChip>
                  ))
                : value.times.map((time, index) => (
                    <TimeChip key={index} removeLabel={t("settings.deliveryRemove", { time })} onRemove={removeTime(index)}>
                      <TimeField label={t("settings.deliveryTimes")} value={time} onChange={(next) => setTime(index, next)} />
                    </TimeChip>
                  ))}
              {value.mode === "hours" ? (
                <button className="btn" disabled={value.ranges.length >= MAX_ENTRIES} onClick={() => onChange({ ...value, ranges: [...value.ranges, nextRange(value.ranges)] })}>
                  <Plus size={14} /> {t("settings.deliveryAddRange")}
                </button>
              ) : (
                <button className="btn" disabled={value.times.length >= MAX_ENTRIES} onClick={() => onChange({ ...value, times: [...value.times, nextTime(value.times)] })}>
                  <Plus size={14} /> {t("settings.deliveryAdd")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
