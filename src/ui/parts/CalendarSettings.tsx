import { ChevronDown, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { calendarAccess, calendarAuthorized, writableCalendars, type Calendar } from "../../calendar";
import type { Settings } from "../../store";
import { t } from "../i18n";
import { HOURS, MINUTES } from "../segments";
import { clockOf, clockText } from "../snooze";
import { SegmentField } from "./SegmentField";

/** Lengths of a new calendar event to choose from, in minutes. */
const LENGTHS = [30, 60, 90, 120];

type Access = "unknown" | "denied" | "granted";

/**
 * The Calendar section of the settings: access to the macOS calendar, the calendar planned items
 * go into, and where and how long a new event starts out. Asks macOS for access only on the
 * button, never on its own.
 *
 * @param settings  The draft settings of the dialog.
 * @param change    Applies a patch to the draft, like the dialog's other fields.
 *
 * @example
 *   {section === "calendar" && <CalendarSettings settings={draft} change={change} />}
 */
export function CalendarSettings({ settings, change }: { settings: Settings; change: (patch: Partial<Settings>) => void }) {
  const [access, setAccess] = useState<Access>("unknown");
  const [calendars, setCalendars] = useState<Calendar[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void calendarAuthorized().then((ok) => ok && setAccess("granted"));
  }, []);
  useEffect(() => {
    if (!open) return;
    // Captured before the dialog's own Escape handler, as in `OrgSelect`.
    const close = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [open]);
  useEffect(() => {
    if (access === "granted") void writableCalendars().then(setCalendars);
  }, [access]);

  const ask = async () => setAccess((await calendarAccess()) ? "granted" : "denied");
  const chosen = calendars?.find((c) => c.id === settings.calendarId);
  const option = (calendar: Calendar, inMenu: boolean) => (
    <>
      <span className="option-dot" style={{ "--option": calendar.color ?? "transparent" } as CSSProperties} />
      <strong>{calendar.title}</strong>
      {inMenu ? <span className="org-select-summary">{calendar.account}</span> : <span className="calendar-account">({calendar.account})</span>}
    </>
  );
  const pick = (id: string) => {
    change({ calendarId: id });
    setOpen(false);
  };

  return (
    <>
      <div className="field">
        <span>{t("settings.calendar")}</span>
        {access !== "granted" ? (
          <div>
            <button className="btn" onClick={() => void ask()}>
              {t("settings.calendarAllow")}
            </button>
          </div>
        ) : (
          <div className="org-select calendar-select">
            <button className="org-select-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
              {chosen ? option(chosen, false) : <span className="calendar-placeholder">{t("settings.calendarNone")}</span>}
              <ChevronDown size={15} className="org-select-chevron" />
            </button>
            {settings.calendarId && (
              <button className="icon-btn calendar-clear" onClick={() => pick("")} title={t("settings.calendarClear")} aria-label={t("settings.calendarClear")}>
                <X size={13} />
              </button>
            )}
            {open && (
              <>
                <div className="popover-backdrop" onMouseDown={() => setOpen(false)} />
                <ul className="org-select-menu" role="listbox">
                  {(calendars ?? []).map((calendar) => (
                    <li key={calendar.id} role="option" aria-selected={calendar.id === settings.calendarId}>
                      <button className={calendar.id === settings.calendarId ? "on" : ""} onClick={() => pick(calendar.id)}>
                        {option(calendar, true)}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {access === "denied" && <small className="settings-warning">{t("settings.calendarDenied")}</small>}
        {settings.calendarId && calendars && !chosen && <small className="settings-warning">{t("settings.calendarMissing")}</small>}
        <small>{t("settings.calendarHint")}</small>
      </div>
      <div className="field">
        <span>{t("settings.calendarTime")}</span>
        <div className="time-field">
          <SegmentField
            label={t("settings.calendarTime")}
            separator=":"
            parts={[
              { label: t("snooze.hour"), value: clockOf(settings.calendarTime).hours, segment: HOURS },
              { label: t("snooze.minute"), value: clockOf(settings.calendarTime).minutes, segment: MINUTES },
            ]}
            onChange={(index, value) => change({ calendarTime: clockText({ ...clockOf(settings.calendarTime), [index === 0 ? "hours" : "minutes"]: value }) })}
          />
        </div>
        <small>{t("settings.calendarTimeHint")}</small>
      </div>
      <div className="field">
        <span>{t("settings.calendarMinutes")}</span>
        <div className="segmented">
          {LENGTHS.map((m) => (
            <button key={m} className={settings.calendarMinutes === m ? "on" : ""} onClick={() => change({ calendarMinutes: m })}>
              {t("settings.calendarMinutes.value", { count: m })}
            </button>
          ))}
        </div>
        <small>{t("settings.calendarMinutesHint")}</small>
      </div>
    </>
  );
}
