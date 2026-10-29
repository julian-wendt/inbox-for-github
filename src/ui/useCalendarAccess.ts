import { useEffect, useState } from "react";
import { calendarAccess, calendarSettings, calendarStatus, type CalendarStatus } from "../calendar";

/** What the calendar notice needs: whether access is missing, and how, and the action that fixes it. */
export interface CalendarAccess {
  /** Null while no calendar is chosen or access is there. */
  missing: Exclude<CalendarStatus, "granted"> | null;
  /** While `fix` runs; the button waits for it. */
  busy: boolean;
  /** Shows macOS's permission dialog, or opens System Settings once access was declined. */
  fix: () => Promise<void>;
}

/**
 * Watches calendar access while a calendar is chosen: at start, when the choice changes and
 * whenever the window gets the focus, as on coming back from System Settings or after an ad hoc
 * rebuild, which macOS takes for a new app (see `docs/reference/calendar.md`). Access granted in
 * System Settings resets the calendar store through `calendarAccess`, so the calendars show.
 *
 * @param calendarId  The "calendarId" setting; empty means the calendar is not used.
 *
 * @example
 *   const calendar = useCalendarAccess(inbox.settings.calendarId);
 *   calendar.missing; // "ask" after a rebuild
 */
export function useCalendarAccess(calendarId: string): CalendarAccess {
  const [status, setStatus] = useState<CalendarStatus>("granted");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!calendarId) return;
    let was: CalendarStatus | null = null;
    const check = () => {
      void calendarStatus()
        .then(async (now) => {
          if (now === "granted" && was !== null && was !== "granted") await calendarAccess();
          was = now;
          setStatus(now);
        })
        .catch(() => undefined);
    };
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [calendarId]);

  const fix = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (status === "ask") setStatus((await calendarAccess()) ? "granted" : "denied");
      else await calendarSettings();
    } catch {
      // The status is read again on the next focus.
    } finally {
      setBusy(false);
    }
  };
  return { missing: calendarId && status !== "granted" ? status : null, busy, fix };
}
