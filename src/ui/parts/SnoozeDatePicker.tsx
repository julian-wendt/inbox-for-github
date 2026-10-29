import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { t } from "../i18n";
import { daysInMonth, daysOf, HOURS, MINUTES, MONTHS, yearsFrom } from "../segments";
import { localDay } from "../assignments";
import { followUpOn } from "../snooze";
import { SegmentField } from "./SegmentField";

interface When {
  day: number;
  month: number;
  year: number;
  hours: number;
  minutes: number;
}

/** The local moment `when` names, or null while a part is out of range (a lone 0 being typed). */
function momentOf(when: When): Date | null {
  const { day, month, year, hours, minutes } = when;
  if (month < MONTHS.min || month > MONTHS.max || day < 1 || day > daysInMonth(year, month)) return null;
  return new Date(year, month - 1, day, hours, minutes);
}

/**
 * A small dialog to snooze until a chosen date and time, starting at tomorrow 09:00, or with
 * `day` to plan for a chosen day. Date (DD.MM.YYYY) and time (24-hour HH:MM) are `SegmentField`s,
 * whatever the system's format; a day past the end of a newly chosen month moves to its last day.
 * Enter or the button confirms, Escape or a click outside cancels. Past times are not accepted,
 * and without a time neither is today.
 *
 * @param onPick  Called with the chosen time as ISO 8601; with `day`, local midnight of the day.
 * @param day     Asks for a day only, to plan for it: the dialog says so and has no time field.
 *
 * @example
 *   <SnoozeDatePicker onPick={(until) => snooze(entry, until)} onClose={() => setPicking(null)} />
 *   <SnoozeDatePicker day onPick={(at) => plan(entry, localDay(new Date(at)))} onClose={() => setPicking(null)} />
 */
export function SnoozeDatePicker({ onPick, onClose, day = false }: { onPick: (until: string) => void; onClose: () => void; day?: boolean }) {
  const [openedAt] = useState(() => Date.now());
  const [when, setWhen] = useState<When>(() => {
    const d = new Date(followUpOn(localDay(new Date(Date.now() + 86_400_000))));
    return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear(), hours: day ? 0 : d.getHours(), minutes: day ? 0 : d.getMinutes() };
  });
  const years = yearsFrom(new Date(openedAt).getFullYear());
  const at = momentOf(when);
  const valid = at !== null && at.getTime() > openedAt;
  const pick = () => {
    if (!valid) return;
    onPick(at.toISOString());
    onClose();
  };
  const setPart = (part: keyof When, value: number) =>
    setWhen((w) => {
      const next = { ...w, [part]: value };
      const last = next.month >= MONTHS.min && next.month <= MONTHS.max ? daysInMonth(next.year, next.month) : 31;
      return part === "day" ? next : { ...next, day: Math.min(next.day, last) };
    });

  useEffect(() => {
    // Captured and stopped, so nothing can swallow it first and it does not also clear the selection behind.
    const close = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <motion.form
        className="dialog snooze-picker"
        role="dialog"
        aria-label={t("snooze.pick")}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16 }}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          pick();
        }}
      >
        <h2>{t(day ? "plan.pickTitle" : "snooze.pickTitle")}</h2>
        <div className="snooze-when">
          <SegmentField
            label={t("snooze.date")}
            separator="."
            autoFocus
            parts={[
              { label: t("snooze.day"), value: when.day, segment: daysOf(when.year, Math.min(Math.max(when.month, 1), 12)) },
              { label: t("snooze.month"), value: when.month, segment: MONTHS },
              { label: t("snooze.year"), value: when.year, segment: years },
            ]}
            onChange={(index, value) => setPart((["day", "month", "year"] as const)[index], value)}
          />
          {!day && (
            <SegmentField
              label={t("snooze.time")}
              separator=":"
              parts={[
                { label: t("snooze.hour"), value: when.hours, segment: HOURS },
                { label: t("snooze.minute"), value: when.minutes, segment: MINUTES },
              ]}
              onChange={(index, value) => setPart(index === 0 ? "hours" : "minutes", value)}
            />
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t("snooze.cancel")}
          </button>
          <button type="submit" className="btn success" disabled={!valid}>
            {t(day ? "plan.confirm" : "snooze.confirm")}
          </button>
        </div>
      </motion.form>
    </div>
  );
}
