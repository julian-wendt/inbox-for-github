import { ChevronLeft, ChevronRight } from "lucide-react";
import { localDay } from "../assignments";
import { midnight } from "../calendarSlot";
import { dateLocale, t } from "../i18n";
import { WEEK, weekdayName } from "../plan";
import { daysInMonth, weeksOf } from "../segments";

/** A day as the date field holds it; `month` is 1–12. */
export interface Ymd {
  year: number;
  month: number;
  day: number;
}

/**
 * A month to pick a day from with the pointer, beside the date field that stays the way for the
 * keyboard: its buttons are out of the Tab order. It shows the month of `value` and marks that
 * day and today; the arrows move `value` by a month, as the Mac's own date picker does, but not
 * before `from`, and no day before `from` can be picked. A click leaves the focus where it was.
 *
 * @param value   The chosen day; the grid shows its month.
 * @param from    The first day that can be picked, a local date ("2026-11-17").
 * @param onPick  Called with the clicked day, or with `value` a month earlier or later from the arrows.
 *
 * @example
 *   <MonthGrid value={{ year: 2026, month: 11, day: 17 }} from={localDay()} onPick={(d) => setWhen({ ...when, ...d })} />
 */
export function MonthGrid({ value, from, onPick }: { value: Ymd; from: string; onPick: (day: Ymd) => void }) {
  const { year, month } = value;
  const dayOf = (day: number) => localDay(new Date(year, month - 1, day));
  const today = localDay();
  const shift = (by: 1 | -1) => {
    const first = new Date(year, month - 1 + by, 1);
    const next = new Date(first.getFullYear(), first.getMonth(), Math.min(value.day, daysInMonth(first.getFullYear(), first.getMonth() + 1)));
    const at = localDay(next) < from ? midnight(from) : next;
    onPick({ year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate() });
  };
  const earlier = localDay(new Date(year, month - 1, 0)) < from;

  return (
    <div className="month-grid" onMouseDown={(e) => e.preventDefault()}>
      <div className="month-grid-head">
        <button type="button" className="icon-btn" tabIndex={-1} onClick={() => shift(-1)} disabled={earlier} title={t("snooze.previousMonth")} aria-label={t("snooze.previousMonth")}>
          <ChevronLeft size={16} />
        </button>
        <strong>{new Date(year, month - 1, 1).toLocaleDateString(dateLocale(), { month: "long", year: "numeric" })}</strong>
        <button type="button" className="icon-btn" tabIndex={-1} onClick={() => shift(1)} title={t("snooze.nextMonth")} aria-label={t("snooze.nextMonth")}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="month-grid-days">
        {WEEK.map((d) => (
          <span key={d} className="month-grid-weekday">
            {weekdayName(d)}
          </span>
        ))}
        {weeksOf(year, month)
          .flat()
          .map((day, i) =>
            day === 0 ? (
              <span key={`pad-${i}`} />
            ) : (
              <button
                key={day}
                type="button"
                tabIndex={-1}
                className={`month-grid-day${dayOf(day) === today ? " today" : ""}`}
                aria-pressed={day === value.day}
                aria-label={new Date(year, month - 1, day).toLocaleDateString(dateLocale(), { dateStyle: "full" })}
                disabled={dayOf(day) < from}
                onClick={() => onPick({ year, month, day })}
              >
                {day}
              </button>
            ),
          )}
      </div>
    </div>
  );
}
