import { listen } from "@tauri-apps/api/event";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { CALENDAR_CHANGED, calendars, eventsBetween, type CalendarEvent } from "../../calendar";
import { localDay } from "../assignments";
import { firstFree, midnight, momentOf, placeSpans, snap, spansOf, STEP, stepWorkday, type Span } from "../calendarSlot";
import { dateLocale, t } from "../i18n";
import { dayLong } from "../plan";

/** Height of one hour in the grid, in pixels. */
const HOUR = 44;
const PX = HOUR / 60;
const DAY = 24 * 60;

interface Props {
  /** The new event's title, shown on its block. */
  title: string;
  /** The day the view opens on, a local date ("2026-10-29"). */
  day: string;
  /** The length a new event starts with, in minutes (the "calendarMinutes" setting). */
  minutes: number;
  /** The "workdays" setting, for ← and →. */
  workdays: readonly number[];
  /** The item's linked event: the view opens on its time and does not show it twice. */
  eventId?: string;
  /** Saves the event; the dialog closes when it resolves and shows the error when it rejects. */
  onSave: (day: string, start: number, end: number) => Promise<void>;
  onClose: () => void;
}

const clock = (minutes: number) => new Date(2026, 0, 1, 0, minutes).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });

/**
 * A day of the macOS calendar with the new event as a block to place: the day's events from all
 * calendars around it, the block dragged to a free time and its lower edge dragged for its length,
 * in quarter hours. It opens on the first free time of the day (see `firstFree`).
 *
 * Keys: ↑ ↓ move by a quarter hour, ⇧↑ ⇧↓ change the length, ← → go to the previous or next
 * workday (not before today), Enter saves, Escape or a click outside cancels. A click on the grid
 * moves the block there.
 *
 * @example
 *   <CalendarDay title={item.title} day={plannedDay} minutes={settings.calendarMinutes} workdays={settings.workdays} onSave={save} onClose={close} />
 */
export function CalendarDay({ title, day: initialDay, minutes, workdays, eventId, onSave, onClose }: Props) {
  const [day, setDay] = useState(initialDay);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Span | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: "move" | "resize"; offset: number } | null>(null);
  const scrolledFor = useRef<string | null>(null);
  const today = localDay();

  useEffect(() => {
    void calendars().then((all) => setColors(Object.fromEntries(all.map((c) => [c.id, c.color ?? "var(--text-faint)"]))));
  }, []);
  useEffect(() => {
    let current = true;
    const load = () =>
      eventsBetween(midnight(day).getTime(), momentOf(day, DAY))
        .then((found) => current && setEvents(found))
        .catch((e: unknown) => current && setError(String(e)));
    void load();
    const stop = listen(CALENDAR_CHANGED, () => void load());
    return () => {
      current = false;
      void stop.then((unlisten) => unlisten());
    };
  }, [day]);

  const others = events?.filter((e) => e.id !== eventId) ?? [];
  const linked = events?.find((e) => e.id === eventId);
  // Until the viewer moves it, the block waits for the day's events, so it can start on a free time.
  const slot = chosen ?? (events && ((linked && spansOf(day, [linked])[0]) || firstFree(day, others, minutes)));
  useLayoutEffect(() => {
    if (!slot || !scroller.current || scrolledFor.current === day) return;
    scrolledFor.current = day;
    scroller.current.scrollTop = Math.max(0, slot.start * PX - 2 * HOUR);
  }, [slot, day]);

  const moveTo = (start: number) => {
    if (!slot) return;
    const from = Math.min(Math.max(0, start), DAY - (slot.end - slot.start));
    setChosen({ start: from, end: from + slot.end - slot.start });
  };
  const resizeTo = (end: number) => slot && setChosen({ ...slot, end: Math.min(DAY, Math.max(slot.start + STEP, end)) });
  const goTo = (direction: 1 | -1) => {
    const next = stepWorkday(day, direction, workdays);
    if (next < today) return;
    setDay(next);
    setEvents(null);
  };
  const save = async () => {
    if (!slot || saving) return;
    setSaving(true);
    try {
      await onSave(day, momentOf(day, slot.start), momentOf(day, slot.end));
      onClose();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  useEffect(() => {
    // Captured and stopped, so the list behind does not also move its selection.
    const keys = (e: KeyboardEvent) => {
      const handled = ["Escape", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key);
      if (!handled) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter") void save();
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") goTo(e.key === "ArrowLeft" ? -1 : 1);
      else if (slot) {
        const by = e.key === "ArrowUp" ? -STEP : STEP;
        if (e.shiftKey) resizeTo(slot.end + by);
        else moveTo(slot.start + by);
      }
    };
    window.addEventListener("keydown", keys, true);
    return () => window.removeEventListener("keydown", keys, true);
  });

  const minuteAt = (e: PointerEvent) => (e.clientY - (grid.current?.getBoundingClientRect().top ?? 0)) / PX;
  const grab = (mode: "move" | "resize", e: PointerEvent) => {
    if (!slot) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, offset: minuteAt(e) - slot.start };
  };
  const pull = (e: PointerEvent) => {
    if (!drag.current) return;
    if (drag.current.mode === "move") moveTo(snap(minuteAt(e) - drag.current.offset));
    else resizeTo(snap(minuteAt(e)));
  };
  const drop = () => (drag.current = null);

  const placed = placeSpans(others.flatMap((event) => spansOf(day, [event]).map((span) => ({ item: event, span }))));
  const allDay = others.filter((e) => e.allDay);
  const length = slot ? slot.end - slot.start : minutes;

  return (
    <div className="overlay" onMouseDown={onClose}>
      <motion.div
        className="dialog calendar-day"
        role="dialog"
        aria-label={t("calendarDay.title")}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="calendar-day-head">
          <button className="icon-btn" onClick={() => goTo(-1)} disabled={stepWorkday(day, -1, workdays) < today} title={t("calendarDay.previous")} aria-label={t("calendarDay.previous")}>
            <ChevronLeft size={16} />
          </button>
          <h2>{dayLong(day)}</h2>
          <button className="icon-btn" onClick={() => goTo(1)} title={t("calendarDay.next")} aria-label={t("calendarDay.next")}>
            <ChevronRight size={16} />
          </button>
        </div>
        {allDay.length > 0 && (
          <div className="calendar-all-day">
            {allDay.map((e) => (
              <span key={e.id} className="calendar-event all-day" style={{ "--event": colors[e.calendarId] } as CSSProperties}>
                {e.title}
              </span>
            ))}
          </div>
        )}
        <div className="calendar-scroller" ref={scroller}>
          <div className="calendar-grid" ref={grid} style={{ height: DAY * PX }} onPointerDown={(e) => slot && moveTo(snap(minuteAt(e) - length / 2))} onPointerMove={pull} onPointerUp={drop}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="calendar-hour" style={{ top: h * HOUR }}>
                <span>{h > 0 && clock(h * 60)}</span>
              </div>
            ))}
            {placed.map(({ item, span, column, columns }) => (
              <div
                key={item.id}
                className={`calendar-event${item.busy ? "" : " free"}`}
                title={`${clock(span.start)}–${clock(span.end)} ${item.title}`}
                style={{ "--event": colors[item.calendarId], top: span.start * PX, height: (span.end - span.start) * PX, left: `calc(var(--gutter-x) + (100% - var(--gutter-x) - 8px) * ${column / columns})`, width: `calc((100% - var(--gutter-x) - 8px) / ${columns} - 2px)` } as CSSProperties}
              >
                {item.title}
              </div>
            ))}
            {slot && (
              <div className="calendar-slot" style={{ top: slot.start * PX, height: length * PX }} onPointerDown={(e) => grab("move", e)} onPointerMove={pull} onPointerUp={drop}>
                <span className="calendar-slot-time">
                  {clock(slot.start)}–{clock(slot.end)}
                </span>
                <span className="calendar-slot-title">{title}</span>
                <span className="calendar-slot-handle" onPointerDown={(e) => grab("resize", e)} onPointerMove={pull} onPointerUp={drop} aria-hidden />
              </div>
            )}
          </div>
        </div>
        {error && <small className="settings-warning">{error}</small>}
        <div className="dialog-actions">
          <small className="calendar-day-hint">{t("calendarDay.hint")}</small>
          <button type="button" className="btn" onClick={onClose}>
            {t("snooze.cancel")}
          </button>
          <button type="button" className="btn success" disabled={!slot || saving} onClick={() => void save()}>
            {t("calendarDay.save")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
