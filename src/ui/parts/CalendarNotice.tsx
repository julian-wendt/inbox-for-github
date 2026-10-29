import { CalendarX } from "lucide-react";
import type { CalendarAccess } from "../useCalendarAccess";
import { t } from "../i18n";

/**
 * Notice for a chosen calendar the app may not use: what that costs, and a button that asks
 * macOS for access or, once it was declined, opens the privacy settings. Renders nothing while
 * access is there or no calendar is chosen.
 *
 * @example
 *   <CalendarNotice access={useCalendarAccess(settings.calendarId)} />
 */
export function CalendarNotice({ access }: { access: CalendarAccess }) {
  if (!access.missing) return null;
  return (
    <div className="scope-notice" role="status">
      <strong>
        <CalendarX size={13} /> {t("calendarAccess.title")}
      </strong>
      <small>{t("calendarAccess.text")}</small>
      {access.missing === "denied" && <small>{t("calendarAccess.denied")}</small>}
      <button className="btn" onClick={() => void access.fix()}>
        {t(access.missing === "ask" ? "calendarAccess.ask" : "calendarAccess.settings")}
      </button>
    </div>
  );
}
