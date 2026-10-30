import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CALENDAR_CHANGED, calendarAuthorized, calendars, calendarWriting, findEvents, type CalendarEvent } from "../calendar";
import type { Settings } from "../store";
import { localDay } from "./assignments";
import { t } from "./i18n";
import { dayText, followEvent, todayOf, unplan, without } from "./plan";

/** How often the calendar is read back while nothing else asks for it, in milliseconds. */
const EVERY = 5 * 60_000;

/** How soon a read skipped for a write of the app's own is tried again, in milliseconds. */
const RETRY = 1_000;

/** What reading back the calendar changes: the new settings and the items whose plan went or moved. */
interface Followed {
  settings: Settings;
  gone: string[];
  moved: { id: string; day: string }[];
}

/**
 * The settings after the linked events as the calendar has them now, the calendar winning: an
 * item whose event was deleted loses its plan and its link, one whose event is on another day
 * follows it there (see `followEvent`). Links of items without a pin or plan are left alone, and
 * so are links to events that were not asked for, as one made meanwhile.
 *
 * @param asked  The event identifiers the calendar was asked for.
 * @param found  Those of them that still exist, by their identifier.
 *
 * @example
 *   followCalendar(settings, new Set(["E1"]), new Map(), "2026-10-29"); // the item linked to E1 loses its plan
 */
export function followCalendar(settings: Settings, asked: ReadonlySet<string>, found: ReadonlyMap<string, CalendarEvent>, today: string): Followed {
  let state = todayOf(settings);
  let links = settings.calendarEvents;
  const gone: string[] = [];
  const moved: { id: string; day: string }[] = [];
  for (const [id, event] of Object.entries(settings.calendarEvents)) {
    if (!asked.has(event) || (!state.focus.includes(id) && !state.planned.some((p) => p.id === id))) continue;
    const at = found.get(event);
    if (!at) {
      state = unplan(state, [id]);
      links = without(links, id);
      gone.push(id);
      continue;
    }
    const day = localDay(new Date(at.start));
    const next = followEvent(state, id, day, today);
    if (!next) continue;
    state = next;
    moved.push({ id, day });
  }
  return { settings: gone.length + moved.length === 0 ? settings : { ...settings, ...state, calendarEvents: links }, gone, moved };
}

/** The toast for what the calendar changed: the item by its number when it is one, else a count. */
function toastOf({ gone, moved }: Followed, numberOf: (id: string) => number | undefined): string {
  const number = numberOf(gone[0] ?? moved[0]?.id ?? "");
  if (gone.length + moved.length > 1 || number === undefined) return t("calendarSync.many", { count: gone.length + moved.length });
  return gone.length === 1 ? t("calendarSync.removed", { number }) : t("calendarSync.moved", { number, day: dayText(moved[0].day) });
}

/**
 * Reads the linked calendar events back and lets the plans follow them (see `followCalendar`):
 * at start, whenever the calendar store changes (also by a sync from the server), when the window
 * gets the focus and every few minutes. Skips while no calendar is chosen, without calendar
 * access or while the chosen calendar is not listed (an account switched off), which would make
 * every event look deleted, and while a write of the app's own runs. An event counts as deleted
 * only when it is missing on two reads in a row. Also reads when the set of linked events changes,
 * and a second after a read skipped for the app's own write, so a new or changed start shows soon.
 *
 * @param ready     Whether the settings are loaded.
 * @param numberOf  The item's number for the toast, undefined while it is not loaded.
 * @returns The starts of the linked events found on the last read, in milliseconds by event
 *          identifier; all-day events are left out, they have no time to show. Kept in memory only.
 *
 * @example
 *   const starts = useCalendarSync(inbox.ready, inbox.settings, inbox.updateSettings, actions.notify, (id) => byId.get(id)?.item.number);
 */
export function useCalendarSync(ready: boolean, settings: Settings, update: (change: (current: Settings) => Settings) => Promise<void>, notify: (text: string) => void, numberOf: (id: string) => number | undefined): ReadonlyMap<string, number> {
  const latest = useRef({ settings, update, notify, numberOf });
  useLayoutEffect(() => {
    latest.current = { settings, update, notify, numberOf };
  });
  const [starts, setStarts] = useState<ReadonlyMap<string, number>>(new Map());
  const read = useRef<() => void>(() => undefined);
  const linked = Object.values(settings.calendarEvents).sort().join();
  useEffect(() => {
    read.current();
  }, [linked]);

  useEffect(() => {
    if (!ready) return;
    let running = false;
    let again = false;
    let missing = new Set<string>();
    let retry = 0;
    const once = async () => {
      const { calendarId, calendarEvents } = latest.current.settings;
      const ids = Object.values(calendarEvents);
      if (calendarWriting()) return void (retry = window.setTimeout(run, RETRY));
      if (!calendarId || ids.length === 0 || !(await calendarAuthorized())) return;
      if (!(await calendars()).some((c) => c.id === calendarId)) return;
      const found = new Map((await findEvents(ids)).map((e) => [e.id, e]));
      if (calendarWriting()) return void (retry = window.setTimeout(run, RETRY));
      const timed = new Map([...found.values()].filter((e) => !e.allDay).map((e) => [e.id, e.start]));
      setStarts((current) => (sameStarts(current, timed) ? current : timed));
      const gone = ids.filter((id) => !found.has(id));
      const asked = new Set([...found.keys(), ...gone.filter((id) => missing.has(id))]);
      missing = new Set(gone);
      const today = localDay();
      const preview = followCalendar(latest.current.settings, asked, found, today);
      if (preview.gone.length + preview.moved.length === 0) return;
      let followed: Followed | null = null;
      await latest.current.update((current) => (followed = followCalendar(current, asked, found, today)).settings);
      const result = followed as Followed | null;
      if (result && result.gone.length + result.moved.length > 0) latest.current.notify(toastOf(result, latest.current.numberOf));
    };
    const sync = async () => {
      if (running) return void (again = true);
      running = true;
      try {
        await once();
      } finally {
        running = false;
      }
      if (again) {
        again = false;
        void sync();
      }
    };
    const run = () => void sync().catch(() => undefined);
    read.current = run;
    run();
    const stop = listen(CALENDAR_CHANGED, run);
    window.addEventListener("focus", run);
    const timer = window.setInterval(run, EVERY);
    return () => {
      void stop.then((unlisten) => unlisten());
      window.removeEventListener("focus", run);
      window.clearInterval(timer);
      window.clearTimeout(retry);
      read.current = () => undefined;
    };
  }, [ready]);
  return starts;
}

/** Whether two reads gave the same starts, so an unchanged read keeps the map and its renders. */
function sameStarts(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  return a.size === b.size && [...b].every(([id, start]) => a.get(id) === start);
}
