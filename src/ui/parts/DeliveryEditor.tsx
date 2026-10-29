import { Plus, X } from "lucide-react";
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

function RemoveButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button className="btn" aria-label={label} disabled={disabled} onClick={onClick}>
      <X size={14} />
    </button>
  );
}

/**
 * The controls for when notifications may arrive: the mode; the days for the other two; the
 * working hours as several ranges, so a break fits between them, or the summary times. Ranges
 * and times stay in the order typed, so a field never moves under the cursor.
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
        <div className="segmented" role="group" aria-label={t("settings.deliveryDays")}>
          {WEEK.map((day) => (
            <button key={day} className={value.days.includes(day) ? "on" : ""} aria-pressed={value.days.includes(day)} onClick={() => toggleDay(day)}>
              {weekdayName(day)}
            </button>
          ))}
        </div>
      )}
      {value.mode === "hours" && (
        <div className="delivery-rows">
          {value.ranges.map((range, index) => (
            <div key={index} className="delivery-row">
              <TimeField label={t("settings.deliveryFrom")} value={range.from} onChange={(time) => setRange(index, "from", time)} />
              <span>–</span>
              <TimeField label={t("settings.deliveryTo")} value={range.to} onChange={(time) => setRange(index, "to", time)} />
              <RemoveButton label={t("settings.deliveryRemove", { time: `${range.from}–${range.to}` })} disabled={value.ranges.length === 1} onClick={() => onChange({ ...value, ranges: value.ranges.filter((_, i) => i !== index) })} />
            </div>
          ))}
          <button className="btn" disabled={value.ranges.length >= MAX_ENTRIES} onClick={() => onChange({ ...value, ranges: [...value.ranges, nextRange(value.ranges)] })}>
            <Plus size={14} /> {t("settings.deliveryAddRange")}
          </button>
        </div>
      )}
      {value.mode === "times" && (
        <div className="delivery-row">
          {value.times.map((time, index) => (
            <div key={index} className="delivery-row">
              <TimeField label={t("settings.deliveryTimes")} value={time} onChange={(next) => setTime(index, next)} />
              <RemoveButton label={t("settings.deliveryRemove", { time })} disabled={value.times.length === 1} onClick={() => onChange({ ...value, times: value.times.filter((_, i) => i !== index) })} />
            </div>
          ))}
          <button className="btn" disabled={value.times.length >= MAX_ENTRIES} onClick={() => onChange({ ...value, times: [...value.times, nextTime(value.times)] })}>
            <Plus size={14} /> {t("settings.deliveryAdd")}
          </button>
        </div>
      )}
    </>
  );
}
