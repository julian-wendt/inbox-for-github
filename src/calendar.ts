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
  const all = await invoke<Calendar[]>("calendar_list");
  return all.filter((c) => c.writable).sort((a, b) => a.account.localeCompare(b.account) || a.title.localeCompare(b.title));
}
