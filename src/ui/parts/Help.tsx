import { X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Reopen } from "../../model";
import { bucketHelp } from "../explain";
import { t, type MessageKey } from "../i18n";
import { VIEWS } from "../labels";

export type HelpTab = "rules" | "keys" | "basics";

const TABS: HelpTab[] = ["basics", "rules", "keys"];

/** "–" spans a range; a "/" between keys means "or", a "/" at the end is the slash key itself. */
const SHORTCUTS: { group: MessageKey; keys: [keys: string[], action: MessageKey][] }[] = [
  {
    group: "keys.group.navigate",
    keys: [
      [["↓"], "keys.next"],
      [["↑"], "keys.previous"],
      [["⇧", "↑", "/", "↓"], "keys.extend"],
      [["1", "–", "5"], "keys.bucket"],
      [["T"], "keys.kind"],
      [["G"], "keys.grouping"],
      [["Esc"], "keys.escape"],
    ],
  },
  {
    group: "keys.group.item",
    keys: [
      [["P"], "keys.focus"],
      [["U", "/", "R"], "keys.read"],
      [["D"], "keys.done"],
      [["F"], "keys.snooze"],
      [["X"], "keys.reminderRemove"],
      [["O"], "keys.open"],
      [["⌘", "Z"], "keys.undo"],
      [["⌘", "Y"], "keys.redo"],
      [["Space", "/", "↵"], "keys.openItem"],
      [["←", "/", "→"], "keys.fold"],
      [["⌃", "A"], "keys.assign"],
      [["⌃", "U"], "keys.unassign"],
      [["⌃", "O"], "action.openOnGitHub"],
      [["W"], "orca.open"],
      [["⌃", "R"], "action.refreshItem"],
      [["C"], "menu.copyLink"],
    ],
  },
  {
    group: "keys.group.app",
    keys: [
      [["⌘", "K"], "keys.palette"],
      [["⌘", "F"], "keys.search"],
      [["⌘", "R"], "action.refreshAll"],
      [["⌘", ","], "action.settings"],
      [["?"], "keys.help"],
    ],
  },
];

const BASICS: MessageKey[] = ["help.basics.local", "help.basics.history", "help.basics.token", "help.basics.why", "help.basics.filter", "help.basics.attention"];

/**
 * The help dialog in three tabs: how the app sorts items into its views (following the reopen
 * setting), every keyboard shortcut by group, and the basics of where data comes from and stays.
 * Closes on Escape or a click outside.
 *
 * @param tab             The tab to open on.
 * @param reopenOn        The "reopenOn" setting, which the sorting rules describe.
 * @param refreshMinutes  The refresh interval to name in the basics; 0 is off.
 *
 * @example
 *   <Help tab="keys" reopenOn={settings.reopenOn} refreshMinutes={settings.refreshMinutes} onClose={() => setDialog(null)} />
 */
export function Help(props: { tab: HelpTab; reopenOn: Reopen; refreshMinutes: number; onClose: () => void }) {
  const { reopenOn, refreshMinutes, onClose } = props;
  const [tab, setTab] = useState(props.tab);

  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <motion.div
        className="dialog help"
        role="dialog"
        aria-label={t("help.title")}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>{t("help.title")}</h2>
        <button className="icon-btn dialog-close" onClick={onClose} title={t("popup.close")} aria-label={t("popup.close")}>
          <X size={16} />
        </button>
        <div className="segmented help-tabs" role="tablist">
          {TABS.map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {t(`help.tab.${id}`)}
            </button>
          ))}
        </div>

        <div className="help-body" role="tabpanel">
          {tab === "rules" &&
            VIEWS.map((b) => {
              const help = bucketHelp(b.id, reopenOn);
              return (
                <section key={b.id}>
                  <strong>{b.title}:</strong> {help.lead}
                  <ul>
                    {help.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </section>
              );
            })}

          {tab === "keys" &&
            SHORTCUTS.map(({ group, keys }) => (
              <section key={group}>
                <h3>{t(group)}</h3>
                <dl>
                  {keys.map(([combo, action]) => (
                    <div key={action}>
                      <dt>{t(action)}</dt>
                      <dd>{combo.map((k, i) => (k === "–" || (k === "/" && i !== combo.length - 1) ? <span key={i}>{k === "/" ? t("keys.or") : k}</span> : <kbd key={i}>{k}</kbd>))}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}

          {tab === "keys" && <small>{t("keys.hint")}</small>}

          {tab === "basics" && (
            <ul>
              {BASICS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
              <li>{refreshMinutes > 0 ? t("help.basics.refresh", { count: refreshMinutes }) : t("help.basics.refreshOff")}</li>
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  );
}
