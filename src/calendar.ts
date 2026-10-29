import { invoke } from "@tauri-apps/api/core";

/** A calendar of the macOS calendar store, as `calendar_list` in `src-tauri/src/calendar.rs` returns it. */
export interface Calendar {
  id: string;
  title: string;
  /** The account it belongs to, as Internet Accounts names it. */
  account: string;
  writable: boolean;
  /** The calendar's color as "#rrggbb", if it has one. */
  color: string | null;
}

/** An event of the calendar store, times in milliseconds since 1970, as `calendar_events` returns it. */
export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  /** False for events marked free, which leave the time open. */
  busy: boolean;
}

/** What `putEvent` writes: a new event without `id`, else an update of that event. */
export interface EventDraft {
  id?: string;
  calendarId: string;
  title: string;
  url: string;
  notes: string;
  start: number;
  end: number;
}

/** Whether the app may use the calendar; never asks. */
export const calendarAuthorized = () => invoke<boolean>("calendar_authorized");

/** Whether the app may use the calendar, showing macOS's permission dialog the first time. */
export const calendarAccess = () => invoke<boolean>("calendar_access");

/**
 * The calendars events can go into, grouped by account and sorted by title within it.
 *
 * @example
 *   const calendars = await writableCalendars(); // [{ id: "C76D…", title: "Calendar", account: "Exchange", writable: true }]
 */
export async function writableCalendars(): Promise<Calendar[]> {
  const all = await calendars();
  return all.filter((c) => c.writable).sort((a, b) => a.account.localeCompare(b.account) || a.title.localeCompare(b.title));
}

/** Every calendar for events, writable or not, unsorted. */
export const calendars = () => invoke<Calendar[]>("calendar_list");

/** The events of all calendars that overlap `from` to `to`, in milliseconds since 1970. */
export const eventsBetween = (from: number, to: number) => invoke<CalendarEvent[]>("calendar_events", { from, to });

/** The events with these identifiers that still exist; a deleted one is missing. */
export const findEvents = (ids: string[]) => invoke<CalendarEvent[]>("calendar_find", { ids });

/**
 * Creates the event, or updates the one `draft.id` names, and returns it as saved; null when that
 * event was deleted meanwhile, which is never brought back.
 *
 * @example
 *   const saved = await putEvent({ calendarId, title: "Fix the login", url, notes: "octo-org/app#12", start, end });
 */
export const putEvent = (draft: EventDraft) => invoke<CalendarEvent | null>("calendar_put", { draft });

/** Moves the event to `start`–`end` and keeps its title and notes; null when it is gone. */
export const moveEvent = (id: string, start: number, end: number) => invoke<CalendarEvent | null>("calendar_move", { id, start, end });

/** Deletes the event; one already gone counts as deleted. */
export const removeEvent = (id: string) => invoke<void>("calendar_remove", { id });

/** The app event sent whenever anything in the calendar store changed. */
export const CALENDAR_CHANGED = "calendar-changed";
