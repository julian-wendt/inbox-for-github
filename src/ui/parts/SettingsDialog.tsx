import { Bell, BellOff, Building2, CircleUserRound, FolderGit2, ListChecks, Palette, RotateCcw, Settings2, SquareKanban, X, type LucideIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Budget } from "../../github/client";
import { revealLog, type LogLevel } from "../../log";
import type { Org, Reopen } from "../../model";
import type { MovesUp } from "../assignments";
import type { RepoFilter } from "../../repoFilter";
import { RULES, ruleSwitches } from "../../rules";
import type { BotComments, Settings } from "../../store";
import { agoInSentence } from "../labels";
import { NOTIFY_REASONS, notifies } from "../attention";
import { t, type Lang, type MessageKey } from "../i18n";
import type { Theme } from "../theme";
import { useGutter } from "../useGutter";
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

type Section = "general" | "notify" | "orgs" | "repos" | "look" | "avatars" | "rules" | "boards" | "untracked";

const SECTIONS: { id: Section; icon: LucideIcon }[] = [
  { id: "general", icon: Settings2 },
  { id: "notify", icon: Bell },
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

const MAX_ITEMS = [100, 200, 500, 1000];
const CLOSED_DAYS = [0, 1, 7, 30];

/** Refresh intervals to choose from, in minutes; 0 is off. */
const REFRESH_MINUTES = [0, 1, 5, 15, 30, 60];

const LOG_LEVELS: LogLevel[] = ["off", "debug", "verbose"];

/** The choices offered; see `Reopen` for the one left out. */
const REOPEN = ["mention", "any-post"] as const satisfies Reopen[];
const MOVES_UP = ["events", "commits", "bots"] as const satisfies (keyof MovesUp)[];

/** The dictionary key of a rule's title or description; every rule id must have both. */
const ruleText = (id: string, part: "title" | "description") => t(`rule.${id}.${part}` as MessageKey);

interface Props {
  settings: Settings;
  /** True on first start: no close button, explanatory intro, an explicit start button. */
  welcome: boolean;
  /** Called with the settings after every change (and on the welcome's start button). */
  onSave: (settings: Settings) => void;
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
}

export function SettingsDialog({ settings, welcome, onSave, onClose, memberOrgs, me, usage, boards, attributes, statusCount, onResetStatuses }: Props) {
  const [active, setActive] = useState<Section>("general");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetCount, setResetCount] = useState<number | null>(null);
  const reset = async () => {
    setConfirmReset(false);
    setResetCount(await onResetStatuses());
  };
  const body = useRef<HTMLDivElement>(null);
  useGutter(() => body.current);
  const [draft, setDraft] = useState<Settings>({ ...settings, rules: ruleSwitches(settings.rules) });
  const { orgs, rules, theme, avatars, reopenOn, hiddenBoards, repoFilters, directOnly } = draft;
  const reopenShown = reopenOn === "mention-or-assigned-post" ? "mention" : reopenOn;
  const owners: Org[] = me && memberOrgs.length > 0 ? [{ login: me, name: t("orgs.personal"), avatarUrl: isDemo() ? avatarUrl(me) : `https://github.com/${me}.png` }, ...memberOrgs] : memberOrgs;
  const [chosenOrg, setRepoOrg] = useState<string | null>(null);
  const repoOrg = chosenOrg && orgs.includes(chosenOrg) ? chosenOrg : (orgs[0] ?? "");

  // Settings apply as they change; without any organization nothing is saved, or the welcome would reopen.
  const change = (patch: Partial<Settings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (!welcome && next.orgs.length > 0) onSave(next);
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
    if (orgs.length > 0) onSave({ ...draft, orgs: [...new Set(orgs)] });
  };

  useEffect(() => {
    if (welcome) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [welcome, onClose]);

  const section = welcome ? "orgs" : active;

  return (
    <div className="overlay" onMouseDown={welcome ? undefined : onClose}>
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
              <button className="icon-btn dialog-close" onClick={onClose} title={t("settings.closeHint")} aria-label={t("settings.close")}>
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
              <div className="field">
                <span>{t("settings.language")}</span>
                <div className="segmented">
                  {LANGUAGES.map((l) => (
                    <button key={l.id} className={draft.language === l.id ? "on" : ""} onClick={() => change({ language: l.id })}>
                      {l.title}
                    </button>
                  ))}
                </div>
                <small>{t("settings.languageHint")}</small>
              </div>
              <div className="field">
                <span>{t("settings.refresh")}</span>
                <div className="segmented">
                  {REFRESH_MINUTES.map((m) => (
                    <button key={m} className={draft.refreshMinutes === m ? "on" : ""} onClick={() => change({ refreshMinutes: m })}>
                      {m === 0 ? t("settings.refresh.off") : t("settings.refresh.minutes", { count: m })}
                    </button>
                  ))}
                </div>
                <small>{t("settings.refreshHint")}</small>
              </div>
              <div className="field">
                <span>{t("usage.title")}</span>
                <UsageMeter usage={usage} refreshMinutes={draft.refreshMinutes} />
                <small>{t("usage.hint")}</small>
              </div>
              <div className="field">
                <span>{t("settings.maxItems")}</span>
                <div className="segmented">
                  {MAX_ITEMS.map((n) => (
                    <button key={n} className={draft.maxItems === n ? "on" : ""} onClick={() => change({ maxItems: n })}>
                      {n}
                    </button>
                  ))}
                </div>
                <small>{t("settings.maxItemsHint")}</small>
              </div>
              <div className="field">
                <span>{t("settings.closedDays")}</span>
                <div className="segmented">
                  {CLOSED_DAYS.map((n) => (
                    <button key={n} className={draft.closedDays === n ? "on" : ""} onClick={() => change({ closedDays: n })}>
                      {n === 0 ? t("settings.closedDays.off") : n === 1 ? t("settings.closedDays.day") : t("settings.closedDays.days", { count: n })}
                    </button>
                  ))}
                </div>
                <small>{t("settings.closedDaysHint")}</small>
              </div>
              <div className="field">
                <span>{t("settings.logging")}</span>
                <div className="segmented">
                  {LOG_LEVELS.map((level) => (
                    <button key={level} className={draft.logging === level ? "on" : ""} onClick={() => change({ logging: level })}>
                      {t(`settings.logging.${level}`)}
                    </button>
                  ))}
                </div>
                <div className="reset-row">
                  <button className="btn" onClick={() => void revealLog()}>
                    {t("settings.logShow")}
                  </button>
                </div>
                <small>{t("settings.loggingHint")}</small>
              </div>
              <div className="field">
                <span>{t("settings.reset")}</span>
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
                <small>{resetCount === null ? t("settings.resetHint") : t(resetCount === 1 ? "settings.resetDoneOne" : "settings.resetDone", { count: resetCount })}</small>
              </div>
            </>
          )}

          {section === "notify" && (
            <>
              <div className="field">
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
              </div>
              <div className="field">
                <span>{t("settings.delivery")}</span>
                <fieldset className="field-group" disabled={!draft.notifications}>
                  <DeliveryEditor value={draft.notifyDelivery} onChange={(notifyDelivery) => change({ notifyDelivery })} />
                </fieldset>
                <small>{t(`settings.deliveryHint.${draft.notifyDelivery.mode}`)}</small>
              </div>
              <div className="field">
                <Toggle title={t("settings.dockBadge")} hint={t("settings.dockBadgeHint")} checked={draft.dockBadge} onChange={(on) => change({ dockBadge: on })} />
              </div>
            </>
          )}

          {section === "look" && (
            <>
              <div className="field">
                <span>{t("settings.theme")}</span>
                <div className="segmented">
                  {THEMES.map((id) => (
                    <button key={id} className={theme === id ? "on" : ""} onClick={() => change({ theme: id })}>
                      {t(`settings.theme.${id}`)}
                    </button>
                  ))}
                </div>
                <small>{t("settings.themeHint")}</small>
              </div>
              <div className="field">
                <span>{t("settings.group.lists")}</span>
                <div className="toggle-card">
                  <Toggle title={t("settings.groupByTime")} hint={t("settings.groupByTimeHint")} checked={draft.groupByTime} onChange={(on) => change({ groupByTime: on })} />
                  <Toggle title={t("settings.hoverActs")} hint={t("settings.hoverActsHint")} checked={draft.hoverActs} onChange={(on) => change({ hoverActs: on })} />
                </div>
              </div>
              <div className="field">
                <span>{t("settings.group.sidebar")}</span>
                <div className="toggle-card">
                  <Toggle title={t("settings.viewCounts")} hint={t("settings.viewCountsHint")} checked={draft.viewCounts} onChange={(on) => change({ viewCounts: on })} />
                  <Toggle title={t("settings.repoCounts")} hint={t("settings.repoCountsHint")} checked={draft.repoCounts} onChange={(on) => change({ repoCounts: on })} />
                  <Toggle title={t("settings.refreshInRepos")} hint={t("settings.refreshInReposHint")} checked={draft.refreshInRepos} onChange={(on) => change({ refreshInRepos: on })} />
                </div>
              </div>
              <AttributeList
                list={combineAttributes(draft.tableAttributes, draft.detailAttributes, attributes)}
                options={attributes}
                onChange={(list) => change(splitAttributes(list))}
              />
              <div className="field">
                <span>{t("settings.recentComments")}</span>
                <div className="segmented">
                  {RECENT_COMMENTS.map((n) => (
                    <button key={n} className={draft.recentComments === n ? "on" : ""} onClick={() => change({ recentComments: n })}>
                      {n === 0 ? t("settings.recentComments.all") : n}
                    </button>
                  ))}
                </div>
                <small>{t("settings.recentCommentsHint")}</small>
              </div>
              <div className="field">
                <span>{t("settings.botComments")}</span>
                <div className="segmented">
                  {BOT_COMMENTS.map((id) => (
                    <button key={id} className={draft.botComments === id ? "on" : ""} onClick={() => change({ botComments: id })}>
                      {t(`settings.botComments.${id}`)}
                    </button>
                  ))}
                </div>
                <small>{t("settings.botCommentsHint")}</small>
              </div>
              <div className="field">
                <span>{t("settings.openAt")}</span>
                <div className="segmented">
                  {(["top", "relevant", "latest"] as const).map((id) => (
                    <button key={id} className={draft.openAt === id ? "on" : ""} onClick={() => change({ openAt: id })}>
                      {t(`settings.openAt.${id}`)}
                    </button>
                  ))}
                </div>
                <small>{t("settings.openAtHint")}</small>
              </div>
              <div className="field">
                <span>{t("settings.descriptionMode")}</span>
                <div className="segmented">
                  {(["collapsed", "expandable", "full"] as const).map((id) => (
                    <button key={id} className={draft.descriptionMode === id ? "on" : ""} onClick={() => change({ descriptionMode: id })}>
                      {t(`settings.descriptionMode.${id}`)}
                    </button>
                  ))}
                </div>
                <small>{t("settings.descriptionModeHint")}</small>
              </div>
              <div className="field">
                <Toggle title={t("settings.stickyReply")} hint={t("settings.stickyReplyHint")} checked={draft.stickyReply} onChange={(on) => change({ stickyReply: on })} />
              </div>
            </>
          )}

          {section === "avatars" && (
            <>
              <div className="toggle-card">
                <Toggle title={t("settings.avatars")} hint={t("settings.avatarsHint")} checked={avatars} onChange={(on) => change({ avatars: on })} />
              </div>
              <div className="field">
                <span>{t("settings.orbs")}</span>
                <OrbShuffle looks={draft.orbLooks} onChange={(orbLooks) => change({ orbLooks })} />
                <small>{t("settings.orbsHint")}</small>
              </div>
            </>
          )}

          {section === "rules" && (
            <>
              <div className="field">
                <span>{t("settings.reopen")}</span>
                <div className="segmented">
                  {REOPEN.map((id) => (
                    <button key={id} className={reopenShown === id ? "on" : ""} onClick={() => change({ reopenOn: id })}>
                      {t(`settings.reopen.${id}`)}
                    </button>
                  ))}
                </div>
                <small>{t(`settings.reopen.${reopenShown}Hint`)}</small>
                <div className="toggle-card">
                  <Toggle title={t("settings.reviewOnCommits")} hint={t("settings.reviewOnCommitsHint")} checked={draft.reviewOnCommits} onChange={(on) => change({ reviewOnCommits: on })} />
                </div>
              </div>

              <div className="field">
                <span>{t("settings.movesUp")}</span>
                <small>{t("settings.movesUpHint")}</small>
                <div className="toggle-card">
                  {MOVES_UP.map((id) => (
                    <Toggle key={id} title={t(`settings.movesUp.${id}`)} hint={t(`settings.movesUp.${id}Hint`)} checked={draft.movesUp[id]} onChange={(on) => change({ movesUp: { ...draft.movesUp, [id]: on } })} />
                  ))}
                </div>
              </div>

              <div className="field">
                <span>{t("settings.automation")}</span>
                <div className="toggle-card">
                  {RULES.map((rule) => (
                    <Toggle key={rule.id} title={ruleText(rule.id, "title")} hint={ruleText(rule.id, "description")} checked={rules[rule.id]} onChange={(on) => change({ rules: { ...rules, [rule.id]: on } })} />
                  ))}
                </div>
              </div>

              {orgs.length > 0 && (
                <div className="field">
                  <span>{t("settings.directOnly")}</span>
                  <small>{t("settings.directOnlyHint")}</small>
                  <OrgSelect orgs={orgs} memberOrgs={owners} value={repoOrg} filters={directOnlyFilters} onChange={setRepoOrg} off />
                  <RepoFilterEditor key={repoOrg} org={repoOrg} filter={directOnlyFilters[repoOrg] ?? { mode: "only", repos: [] }} onChange={(f) => setDirectOnly(repoOrg, f)} listOnly />
                </div>
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
 * One switch with its title and an optional hint, alone in a field or as a row of a `toggle-card`.
 * Compact rows are for short lists of plain choices, such as notification reasons or boards.
 *
 * @example
 *   <Toggle title={t("settings.avatars")} hint={t("settings.avatarsHint")} checked={avatars} onChange={(on) => change({ avatars: on })} />
 */
function Toggle({ title, hint, checked, onChange, compact = false }: { title: string; hint?: string; checked: boolean; onChange: (on: boolean) => void; compact?: boolean }) {
  return (
    <label className={`toggle-row${compact ? " compact" : ""}`}>
      <span>
        {compact ? title : <strong>{title}</strong>}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
