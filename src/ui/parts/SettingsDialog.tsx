import { Bell, BellOff, Building2, CalendarDays, CircleUserRound, FolderGit2, FolderOpen, ListChecks, Palette, RotateCcw, Settings2, SquareKanban, X, type LucideIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Budget } from "../../github/client";
import { revealLog, type LogLevel } from "../../log";
import type { Org, Reopen } from "../../model";
import type { MovesUp } from "../assignments";
import type { RepoFilter } from "../../repoFilter";
import type { BotComments, Settings } from "../../store";
import { agoInSentence } from "../labels";
import { NOTIFY_REASONS, notifies } from "../attention";
import { t, type Lang } from "../i18n";
import type { Theme } from "../theme";
import { useGutter } from "../useGutter";
import { HOURS, MINUTES } from "../segments";
import { clockOf, clockText } from "../snooze";
import { toggleWorkday, WEEK, weekdayName } from "../plan";
import { unseenSettings, type SettingsSection } from "../newSettings";
import { SegmentField } from "./SegmentField";
import { CalendarSettings } from "./CalendarSettings";
import { guessWorkStatus, WORK_STATUSES, type WorkStatus } from "../../workStatus";
import { combineAttributes, splitAttributes, type AttributeOption } from "../attributes";
import { AttributeList } from "./AttributeList";
import { DeliveryEditor } from "./DeliveryEditor";
import { avatarUrl } from "../../demo/avatar";
import { isDemo } from "../../demo/flag";
import { OrbShuffle } from "./OrbShuffle";
import { OrgPicker } from "./OrgPicker";
import { OrgSelect } from "./OrgSelect";
import { RepoFilterEditor } from "./RepoFilterEditor";
import { UsageMeter } from "./UsageMeter";

type Section = SettingsSection;

const SECTIONS: { id: Section; icon: LucideIcon }[] = [
  { id: "general", icon: Settings2 },
  { id: "notify", icon: Bell },
  { id: "calendar", icon: CalendarDays },
  { id: "orgs", icon: Building2 },
  { id: "repos", icon: FolderGit2 },
  { id: "look", icon: Palette },
  { id: "avatars", icon: CircleUserRound },
  { id: "rules", icon: ListChecks },
  { id: "boards", icon: SquareKanban },
  { id: "untracked", icon: BellOff },
];

/** Each language under its own name, so it can be found whatever language is active. */
const LANGUAGES: { id: Lang; title: string }[] = [
  { id: "en", title: "English" },
  { id: "de", title: "Deutsch" },
];

const THEMES: Theme[] = ["system", "light", "dark"];

const RECENT_COMMENTS = [3, 8, 20, 0];
const BOT_COMMENTS: BotComments[] = ["folded", "open", "hidden"];

const CLOSED_DAYS = [0, 1, 7, 30];

/** Refresh intervals to choose from, in minutes; 0 is off. */
const REFRESH_MINUTES = [0, 1, 5, 15, 30, 60];

const LOG_LEVELS: LogLevel[] = ["off", "debug", "verbose"];
const OPEN_AT = ["top", "relevant", "latest"] as const;
const DESCRIPTION_MODES = ["collapsed", "expandable", "full"] as const;

/** The choices offered; see `Reopen` for the one left out. */
const REOPEN = ["mention", "any-post"] as const satisfies Reopen[];
const MOVES_UP = ["events", "commits", "bots"] as const satisfies (keyof MovesUp)[];

/** The dictionary key of a rule's title or description; every rule id must have both. */

interface Props {
  settings: Settings;
  /** True on first start: no close button, explanatory intro, an explicit start button. */
  welcome: boolean;
  /** Called with the settings after every change (and on the welcome's start button). */
  /** Saves the keys the viewer changed; the app puts them on top of its current settings. */
  onSave: (changes: Partial<Settings>) => void;
  onClose: () => void;
  /** The viewer's organizations, to pick from. */
  memberOrgs: Org[];
  /** Every attribute the Assigned to me table can show for the loaded items. */
  attributes: AttributeOption[];
  /** GitHub API usage, shown under General. */
  usage: { budget: Budget | null; lastCost: number | null };
  /** The viewer's login, offered first for their personal repositories. */
  me: string | null;
  /** Boards seen on the loaded items, with the status values seen on each, to choose what the detail shows and how statuses map. */
  boards: { id: string; title: string; values: string[] }[];
  /** How many items have a stored status, for the reset under General. */
  statusCount: number;
  /** Drops every stored status; resolves to how many there were. */
  onResetStatuses: () => Promise<number>;
  /** Keys of the new settings (`NEW_SETTINGS`) the viewer has seen. */
  seenSettings: readonly string[];
  /** Records new settings as seen: those of each section the viewer opens, and all on the welcome's start. */
  onSeen: (keys: readonly string[]) => void;
}

export function SettingsDialog({ settings, welcome, onSave, onClose, memberOrgs, me, usage, boards, attributes, statusCount, onResetStatuses, seenSettings, onSeen }: Props) {
  const [active, setActive] = useState<Section>("general");
  // Chips stay for the whole visit, so a section opened now still shows what was new in it.
  const [fresh] = useState(() => new Set<string>(unseenSettings(seenSettings)));
  const isNew = (key: keyof Settings) => fresh.has(key);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetCount, setResetCount] = useState<number | null>(null);
  const reset = async () => {
    setConfirmReset(false);
    setResetCount(await onResetStatuses());
  };
  const body = useRef<HTMLDivElement>(null);
  useGutter(() => body.current);
  const [draft, setDraft] = useState<Settings>(settings);
  const { orgs, theme, reopenOn, hiddenBoards, repoFilters, directOnly } = draft;
  const owners: Org[] = me && memberOrgs.length > 0 ? [{ login: me, name: t("orgs.personal"), avatarUrl: isDemo() ? avatarUrl(me) : `https://github.com/${me}.png` }, ...memberOrgs] : memberOrgs;
  const [chosenOrg, setRepoOrg] = useState<string | null>(null);
  const repoOrg = chosenOrg && orgs.includes(chosenOrg) ? chosenOrg : (orgs[0] ?? "");

  // Settings apply as they change; without any organization nothing is saved, or the welcome would reopen.
  const change = (patch: Partial<Settings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (!welcome && next.orgs.length > 0) onSave(patch);
  };
  const setRepoFilter = (org: string, filter?: RepoFilter) => {
    const next = { ...repoFilters };
    if (filter) next[org] = filter;
    else delete next[org];
    change({ repoFilters: next });
  };
  const setDirectOnly = (org: string, filter?: RepoFilter) => {
    const next = { ...directOnly };
    if (filter && filter.repos.length > 0) next[org] = filter.repos;
    else delete next[org];
    change({ directOnly: next });
  };
  const directOnlyFilters: Record<string, RepoFilter> = Object.fromEntries(Object.entries(directOnly).map(([org, repos]) => [org, { mode: "only", repos }]));
  const mapStatus = (board: string, value: string, status: WorkStatus | "auto") => {
    const forBoard = { ...draft.statusMap[board] };
    if (status === "auto") delete forBoard[value];
    else forBoard[value] = status;
    change({ statusMap: { ...draft.statusMap, [board]: forBoard } });
  };
  const mappable = boards.filter((b) => b.values.length > 0 && !hiddenBoards.includes(b.id));
  const toggleBoard = (id: string, shown: boolean) =>
    change({ hiddenBoards: shown ? hiddenBoards.filter((b) => b !== id) : [...hiddenBoards, id] });
  const start = () => {
    if (orgs.length === 0) return;
    onSeen(unseenSettings([]));
    onSave({ ...draft, orgs: [...new Set(orgs)] });
  };

  // A field unmounting fires no blur, so what is typed in it is saved before the dialog goes.
  const folder = useRef<HTMLInputElement>(null);
  const close = () => {
    const typed = folder.current?.value.trim();
    if (typed !== undefined && typed !== draft.repoFolder) change({ repoFolder: typed });
    onClose();
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (welcome) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [welcome]);

  const section = welcome ? "orgs" : active;

  useEffect(() => {
    if (!welcome) onSeen(unseenSettings(seenSettings, section));
  }, [welcome, section, seenSettings, onSeen]);

  return (
    <div className="overlay" onMouseDown={welcome ? undefined : close}>
      <motion.div
        className={`dialog settings${welcome ? " welcome" : ""}`}
        role="dialog"
        aria-label={t("settings.title")}
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.metaKey && welcome) start();
        }}
      >
        {!welcome && (
          <nav className="settings-nav" aria-label={t("settings.sections")}>
            <h2>{t("settings.title")}</h2>
            {SECTIONS.map(({ id, icon: Icon }) => (
              <button key={id} className={`nav-item${active === id ? " on" : ""}`} onClick={() => setActive(id)}>
                <Icon size={15} strokeWidth={1.8} />
                <span>{t(`settings.section.${id}`)}</span>
                {unseenSettings(seenSettings, id).length > 0 && <NewChip />}
              </button>
            ))}
          </nav>
        )}

        <div className="settings-body" ref={body}>
          {welcome && (
            <>
              <h2>{t("settings.welcome")}</h2>
              <p className="dialog-intro">{t("settings.welcomeIntro")}</p>
            </>
          )}
          {!welcome && (
            <div className="settings-head">
              <h3 className="settings-heading">{t(`settings.section.${section}`)}</h3>
              <button className="icon-btn dialog-close" onClick={close} title={t("settings.closeHint")} aria-label={t("settings.close")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!welcome && section !== "untracked" && <p className="dialog-intro">{t(`settings.intro.${section}`)}</p>}

          {section === "orgs" && <OrgPicker memberOrgs={owners} selected={orgs} onChange={(next) => change({ orgs: next })} />}
          {section === "orgs" && !welcome && orgs.length === 0 && (
            <small className="settings-warning">{t("settings.noOrgWarning")}</small>
          )}

          {section === "repos" &&
            (orgs.length > 0 ? (
              <>
                <OrgSelect orgs={orgs} memberOrgs={owners} value={repoOrg} filters={repoFilters} onChange={setRepoOrg} />
                <RepoFilterEditor key={repoOrg} org={repoOrg} filter={repoFilters[repoOrg]} onChange={(f) => setRepoFilter(repoOrg, f)} />
              </>
            ) : (
              <p className="dialog-intro">{t("settings.reposNeedOrg")}</p>
            ))}

          {section === "untracked" && (
            <>
              <p className="dialog-intro">{t("settings.untrackedIntro")}</p>
              {draft.untracked.length === 0 ? (
                <p className="hint">{t("settings.untrackedEmpty")}</p>
              ) : (
                <ul className="untracked-list">
                  {draft.untracked.map((u) => (
                    <li key={u.id}>
                      <span className="untracked-text">
                        <button className="untracked-title" title={u.url} onClick={() => void openUrl(u.url)}>
                          {u.title}
                        </button>
                        <small>
                          {u.repo.split("/")[1]}#{u.number} · {t("settings.untrackedSince", { ago: agoInSentence(u.at) })}
                        </small>
                      </span>
                      <button className="btn" onClick={() => change({ untracked: draft.untracked.filter((x) => x.id !== u.id) })}>
                        {t("settings.trackAgain")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {section === "general" && (
            <>
              <Field label={t("settings.language")} hint={t("settings.languageHint")}>
                <Choice options={LANGUAGES.map((l) => l.id)} value={draft.language} label={(id) => LANGUAGES.find((l) => l.id === id)!.title} onChange={(language) => change({ language })} />
              </Field>
              <Field label={t("settings.workdays")} hint={t("settings.workdaysHint")}>
                <div className="segmented multi">
                  {WEEK.map((day) => (
                    <button
                      key={day}
                      className={draft.workdays.includes(day) ? "on" : ""}
                      aria-pressed={draft.workdays.includes(day)}
                      onClick={() => change({ workdays: toggleWorkday(draft.workdays, day) })}
                    >
                      {weekdayName(day)}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={t("settings.followUpTime")} hint={t("settings.followUpTimeHint")}>
                <div className="time-field">
                  <SegmentField
                    label={t("settings.followUpTime")}
                    separator=":"
                    parts={[
                      { label: t("snooze.hour"), value: clockOf(draft.followUpTime).hours, segment: HOURS },
                      { label: t("snooze.minute"), value: clockOf(draft.followUpTime).minutes, segment: MINUTES },
                    ]}
                    onChange={(index, value) => change({ followUpTime: clockText({ ...clockOf(draft.followUpTime), [index === 0 ? "hours" : "minutes"]: value }) })}
                  />
                </div>
              </Field>
              <Field label={t("settings.refresh")} hint={t("settings.refreshHint")}>
                <Choice options={REFRESH_MINUTES} value={draft.refreshMinutes} label={(m) => (m === 0 ? t("settings.refresh.off") : t("settings.refresh.minutes", { count: m }))} onChange={(refreshMinutes) => change({ refreshMinutes })} />
              </Field>
              <Field label={t("usage.title")} hint={t("usage.hint")}>
                <UsageMeter usage={usage} refreshMinutes={draft.refreshMinutes} />
              </Field>
              <Field label={t("settings.closedDays")} hint={t("settings.closedDaysHint")}>
                <Choice
                  options={CLOSED_DAYS}
                  value={draft.closedDays}
                  label={(n) => (n === 0 ? t("settings.closedDays.off") : n === 1 ? t("settings.closedDays.day") : t("settings.closedDays.days", { count: n }))}
                  onChange={(closedDays) => change({ closedDays })}
                />
              </Field>
              <Field label={t("settings.repoFolder")} hint={t("settings.repoFolderHint")}>
                <input
                  ref={folder}
                  key={draft.repoFolder}
                  className="repo-search"
                  defaultValue={draft.repoFolder}
                  placeholder={t("settings.repoFolderPlaceholder")}
                  spellCheck={false}
                  aria-label={t("settings.repoFolder")}
                  onBlur={(e) => e.target.value.trim() !== draft.repoFolder && change({ repoFolder: e.target.value.trim() })}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
              </Field>
              <Field label={t("settings.logging")} hint={t("settings.loggingHint")}>
                <div className="logging-row">
                  <Choice options={LOG_LEVELS} value={draft.logging} label={(level) => t(`settings.logging.${level}`)} onChange={(logging) => change({ logging })} />
                  <button className="btn" onClick={() => void revealLog()}>
                    <FolderOpen size={14} aria-hidden />
                    {t("settings.logShow")}
                  </button>
                </div>
              </Field>
              <Field label={t("settings.reset")} hint={resetCount === null ? t("settings.resetHint") : t(resetCount === 1 ? "settings.resetDoneOne" : "settings.resetDone", { count: resetCount })}>
                <div className="reset-row">
                  {confirmReset ? (
                    <>
                      <button className="btn primary" onClick={() => void reset()}>
                        {t(statusCount === 1 ? "settings.resetConfirmOne" : "settings.resetConfirm", { count: statusCount })}
                      </button>
                      <button className="btn" onClick={() => setConfirmReset(false)}>
                        {t("settings.resetCancel")}
                      </button>
                    </>
                  ) : (
                    <button className="btn" disabled={statusCount === 0} onClick={() => setConfirmReset(true)}>
                      {t("settings.resetButton")}
                    </button>
                  )}
                </div>
              </Field>
            </>
          )}

          {section === "calendar" && <CalendarSettings settings={draft} change={change} />}

          {section === "notify" && (
            <>
              <Field>
                <div className="toggle-card">
                  <Toggle title={t("settings.notifications")} hint={t("settings.notificationsHint")} checked={draft.notifications} onChange={(on) => change({ notifications: on })} />
                  <fieldset className="toggle-card-part" disabled={!draft.notifications}>
                    <legend>{t("settings.notifyOnHeading")}</legend>
                    {NOTIFY_REASONS.map((reason) => (
                      <Toggle key={reason} compact title={t(`settings.notifyOn.${reason}`)} checked={notifies(reason, draft.notifyOn)} onChange={(on) => change({ notifyOn: { ...draft.notifyOn, [reason]: on } })} />
                    ))}
                    <p className="toggle-card-note">{t("settings.notifyOnHint")}</p>
                  </fieldset>
                  <fieldset className="toggle-card-part" disabled={!draft.notifications}>
                    <Toggle title={t("settings.notifyInFront")} hint={t("settings.notifyInFrontHint")} checked={draft.notifyInFront} onChange={(on) => change({ notifyInFront: on })} />
                  </fieldset>
                </div>
              </Field>
              <Field label={t("settings.delivery")} hint={t(`settings.deliveryHint.${draft.notifyDelivery.mode}`)}>
                <fieldset className="field-group" disabled={!draft.notifications}>
                  <DeliveryEditor value={draft.notifyDelivery} onChange={(notifyDelivery) => change({ notifyDelivery })} />
                </fieldset>
              </Field>
              <Field>
                <div className="toggle-card">
                  <Toggle title={t("settings.dockBadge")} hint={t("settings.dockBadgeHint")} checked={draft.dockBadge} onChange={(on) => change({ dockBadge: on })} />
                </div>
              </Field>
            </>
          )}

          {section === "look" && (
            <>
              <Field label={t("settings.theme")} hint={t("settings.themeHint")}>
                <Choice options={THEMES} value={theme} label={(id) => t(`settings.theme.${id}`)} onChange={(next) => change({ theme: next })} />
              </Field>
              <Field label={t("settings.group.lists")}>
                <div className="toggle-card">
                  <Toggle isNew={isNew("tabToButtons")} title={t("settings.tabToButtons")} hint={t("settings.tabToButtonsHint")} checked={draft.tabToButtons} onChange={(on) => change({ tabToButtons: on })} />
                </div>
              </Field>
              <AttributeList
                list={combineAttributes(draft.tableAttributes, draft.detailAttributes, attributes)}
                options={attributes}
                onChange={(list) => change(splitAttributes(list))}
              />
              <Field label={t("settings.recentComments")} hint={t("settings.recentCommentsHint")}>
                <Choice options={RECENT_COMMENTS} value={draft.recentComments} label={(n) => (n === 0 ? t("settings.recentComments.all") : String(n))} onChange={(recentComments) => change({ recentComments })} />
              </Field>
              <Field label={t("settings.botComments")} hint={t("settings.botCommentsHint")}>
                <Choice options={BOT_COMMENTS} value={draft.botComments} label={(id) => t(`settings.botComments.${id}`)} onChange={(botComments) => change({ botComments })} />
              </Field>
              <Field label={t("settings.openAt")} hint={t("settings.openAtHint")}>
                <Choice options={OPEN_AT} value={draft.openAt} label={(id) => t(`settings.openAt.${id}`)} onChange={(openAt) => change({ openAt })} />
              </Field>
              <Field label={t("settings.descriptionMode")} hint={t("settings.descriptionModeHint")}>
                <Choice options={DESCRIPTION_MODES} value={draft.descriptionMode} label={(id) => t(`settings.descriptionMode.${id}`)} onChange={(descriptionMode) => change({ descriptionMode })} />
              </Field>
            </>
          )}

          {section === "avatars" && (
            <>
              <Field label={t("settings.orbs")} hint={t("settings.orbsHint")}>
                <OrbShuffle looks={draft.orbLooks} onChange={(orbLooks) => change({ orbLooks })} />
              </Field>
            </>
          )}

          {section === "rules" && (
            <>
              <Field label={t("settings.reopen")} hint={t(`settings.reopen.${reopenOn}Hint`)}>
                <Choice options={REOPEN} value={reopenOn} label={(id) => t(`settings.reopen.${id}`)} onChange={(next) => change({ reopenOn: next })} />
              </Field>
              <Field label={t("settings.group.reviewed")}>
                <div className="toggle-card">
                  <Toggle title={t("settings.reviewOnCommits")} hint={t("settings.reviewOnCommitsHint")} checked={draft.reviewOnCommits} onChange={(on) => change({ reviewOnCommits: on })} />
                </div>
              </Field>
              <Field label={t("settings.movesUp")} hint={t("settings.movesUpHint")}>
                <div className="toggle-card">
                  {MOVES_UP.map((id) => (
                    <Toggle key={id} title={t(`settings.movesUp.${id}`)} hint={t(`settings.movesUp.${id}Hint`)} checked={draft.movesUp[id]} onChange={(on) => change({ movesUp: { ...draft.movesUp, [id]: on } })} />
                  ))}
                </div>
              </Field>
              {orgs.length > 0 && (
                <Field label={t("settings.directOnly")} hint={t("settings.directOnlyHint")}>
                  <OrgSelect orgs={orgs} memberOrgs={owners} value={repoOrg} filters={directOnlyFilters} onChange={setRepoOrg} off />
                  <RepoFilterEditor key={repoOrg} org={repoOrg} filter={directOnlyFilters[repoOrg] ?? { mode: "only", repos: [] }} onChange={(f) => setDirectOnly(repoOrg, f)} listOnly />
                </Field>
              )}
            </>
          )}

          {section === "boards" && (
            <div className="field">
              <div className="toggle-card">
                <Toggle title={t("settings.loadBoards")} hint={t("settings.loadBoardsHint")} checked={draft.loadBoards} onChange={(on) => change({ loadBoards: on })} />
                <fieldset className="toggle-card-part" disabled={!draft.loadBoards}>
                  <legend>{t("settings.boardsField")}</legend>
                  {boards.length > 0 ? (
                    boards.map((board) => <Toggle key={board.id} compact title={board.title} checked={!hiddenBoards.includes(board.id)} onChange={(on) => toggleBoard(board.id, on)} />)
                  ) : (
                    <p className="toggle-card-note">{t("settings.noBoards")}</p>
                  )}
                </fieldset>
              </div>
              {boards.length > 0 && <small>{t("settings.boardsHint")}</small>}
            </div>
          )}
          {section === "boards" && draft.loadBoards && mappable.length > 0 && (
            <div className="field">
              <span>{t("settings.statusMap")}</span>
              {mappable.map((board) => (
                <div key={board.id} className="status-map">
                  <strong>{board.title}</strong>
                  {board.values.map((value) => {
                    const guess = guessWorkStatus(value) ?? "todo";
                    const own = draft.statusMap[board.id]?.[value];
                    const current = own ?? guess;
                    return (
                      <div key={value} className="status-map-row">
                        <span className="status-map-value" title={value}>
                          {value}
                        </span>
                        <div className="status-map-choice" role="radiogroup" aria-label={value}>
                          {WORK_STATUSES.map((s) => (
                            <button
                              key={s}
                              role="radio"
                              aria-checked={current === s}
                              className={current === s ? (own ? "on" : "auto") : undefined}
                              title={current === s ? (own ? t("settings.statusMap.custom") : t("settings.statusMap.autoMark")) : undefined}
                              onClick={() => mapStatus(board.id, value, s === guess ? "auto" : s)}
                            >
                              {t(`work.${s}`)}
                            </button>
                          ))}
                        </div>
                        <button
                          className="heading-action"
                          hidden={!own}
                          onClick={() => mapStatus(board.id, value, "auto")}
                          title={t("settings.statusMap.reset")}
                          aria-label={t("settings.statusMap.reset")}
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
              <small>{t("settings.statusMapHint")}</small>
            </div>
          )}
        </div>

        {welcome && (
          <div className="dialog-actions">
            <button className="btn primary" onClick={start}>
              {t("settings.start")} <kbd>⌘↵</kbd>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/**
 * One setting: its label above, the control, and the hint below, so every section reads the same.
 * A field of switches leaves the label to the card's group, or out when the switch names itself.
 *
 * @example
 *   <Field label={t("settings.theme")} hint={t("settings.themeHint")}><Choice … /></Field>
 */
function Field({ label, hint, isNew = false, children }: { label?: string; hint?: string; isNew?: boolean; children: ReactNode }) {
  return (
    <div className="field">
      {label && (
        <span>
          {label}
          {isNew && <NewChip />}
        </span>
      )}
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}

/**
 * A few exclusive choices as a segmented control, the current one marked.
 *
 * @example
 *   <Choice options={THEMES} value={theme} label={(id) => t(`settings.theme.${id}`)} onChange={(theme) => change({ theme })} />
 */
function Choice<T extends string | number>({ options, value, label, onChange }: { options: readonly T[]; value: T; label: (option: T) => string; onChange: (option: T) => void }) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button key={option} className={value === option ? "on" : ""} onClick={() => onChange(option)}>
          {label(option)}
        </button>
      ))}
    </div>
  );
}

/**
 * One switch with its title and an optional hint, alone in a field or as a row of a `toggle-card`.
 * Compact rows are for short lists of plain choices, such as notification reasons or boards.
 *
 * @example
 *   <Toggle title={t("settings.tabToButtons")} hint={t("settings.tabToButtonsHint")} checked={draft.tabToButtons} onChange={(on) => change({ tabToButtons: on })} />
 */
function Toggle({ title, hint, checked, onChange, compact = false, isNew = false }: { title: string; hint?: string; checked: boolean; onChange: (on: boolean) => void; compact?: boolean; isNew?: boolean }) {
  return (
    <label className={`toggle-row${compact ? " compact" : ""}`}>
      <span>
        {compact ? title : (
          <strong>
            {title}
            {isNew && <NewChip />}
          </strong>
        )}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** The quiet mark of a setting that came with a recent release (see `NEW_SETTINGS`). */
function NewChip() {
  return <span className="new-chip">{t("settings.new")}</span>;
}
