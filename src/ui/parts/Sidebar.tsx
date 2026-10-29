import type { MouseEvent } from "react";
import type { Budget, Scope } from "../../github/client";
import { CalendarDays, CircleCheck, CircleHelp, Eraser, Inbox, RefreshCw, Search, Settings2, SquarePen, UserCheck, type LucideIcon } from "lucide-react";
import { dateLocale, t } from "../i18n";
import { ago, type VIEWS, type View } from "../labels";
import { Avatar } from "./Avatar";
import { ScopeNotice } from "./ScopeNotice";
import { UsageRing } from "./UsageMeter";

const ICONS: Record<View, LucideIcon> = {
  inbox: Inbox,
  assigned: UserCheck,
  authored: SquarePen,
  planned: CalendarDays,
  done: CircleCheck,
};

interface Props {
  bucket: View;
  /** The views to offer, in order (see `VIEWS`). */
  views: typeof VIEWS;
  counts: Record<View, number>;
  /** Unread items in the views that know the notion; a view with some prints its name and count bold. */
  unread: Partial<Record<View, number>>;
  repos: [repo: string, count: number][];
  /** Show the counts next to the views, and next to the repos. */
  viewCounts: boolean;
  repoCounts: boolean;
  /** Repos the list is narrowed to; empty for all. */
  repoFilter: string[];
  me: string | null;
  myName: string | null;
  myAvatar: string | null;
  missingScopes: Scope[];
  loading: boolean;
  fetchedAt: Date | null;
  usage: { budget: Budget | null; lastCost: number | null };
  refreshMinutes: number;
  /** Automatic refreshes wait until then because GitHub's hourly budget is low. */
  pausedUntil: Date | null;
  /** The last refresh failed; `fetchedAt` then dates the data still shown. */
  error: string | null;
  onBucket: (bucket: View) => void;
  /** Right click on a view. */
  onViewMenu: (view: View, e: MouseEvent) => void;
  /** A repo clicked (`add` with ⌘ held), or null to show all repos. */
  onRepo: (repo: string | null, add: boolean) => void;
  /** Whether a repo shows only what is addressed to the viewer; it gets a marker. */
  isDirectOnly: (repo: string) => boolean;
  /** Right click on a repo. */
  onRepoMenu: (repo: string, e: MouseEvent) => void;
  onSearch: () => void;
  onRefresh: () => void;
  /** Stops the running refresh. */
  onStop: () => void;
  onSettings: () => void;
  onRules: () => void;
}

export function Sidebar(props: Props) {
  const { bucket, counts, repos, viewCounts, repoCounts, repoFilter, me, myName, myAvatar, loading, fetchedAt, error, pausedUntil } = props;
  const since = fetchedAt && ago(fetchedAt.toISOString());
  // Once a repo is picked, the dots turn into checkboxes and a click adds or removes a repo.
  const picking = repoFilter.length > 0;
  return (
    <nav className="sidebar">
      <div className="sidebar-top" data-tauri-drag-region>
        {loading ? (
          <button className="icon-btn stoppable" onClick={props.onStop} title={t("sidebar.stop")} aria-label={t("sidebar.stop")}>
            <RefreshCw size={14} className="spin" />
            <span className="stop-mark" aria-hidden />
          </button>
        ) : (
          <button className="icon-btn" onClick={props.onRefresh} title={t("sidebar.refresh")}>
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      <button className="search-pill" onClick={props.onSearch}>
        <Search size={14} /> <span>{t("sidebar.search")}</span> <kbd>⌘K</kbd>
      </button>

      <ul className="nav views">
        {props.views.map((b) => {
          const Icon = ICONS[b.id];
          const key = props.views.indexOf(b) + 1;
          const hasUnread = (props.unread[b.id] ?? 0) > 0;
          return (
            <li key={b.id}>
              <button className={`nav-item${bucket === b.id ? " on" : ""}${hasUnread ? " unread" : ""}`} onClick={() => props.onBucket(b.id)} onContextMenu={(e) => props.onViewMenu(b.id, e)} title={`${b.title} (${key})`}>
                <Icon size={15} strokeWidth={1.8} />
                <span>{b.title}</span>
                {viewCounts && counts[b.id] > 0 && <span className="nav-count">{counts[b.id]}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {repos.length > 0 && (
        <>
          <h3 className="nav-heading">
            <span>{t("sidebar.repos")}</span>
            {/* Hidden, not removed, so the heading keeps its height when a repo is picked. */}
            <button className="heading-action" onClick={() => props.onRepo(null, false)} title={t("sidebar.allRepos")} aria-label={t("sidebar.allRepos")} hidden={repoFilter.length === 0}>
              <Eraser size={12} strokeWidth={2.2} />
            </button>
          </h3>
          <ul className="nav repos">
            {repos.map(([name, count]) => (
              <li key={name}>
                <button
                  className={`nav-item${repoFilter.includes(name) ? " on" : ""}`}
                  onClick={(e) => props.onRepo(name, e.metaKey || picking)}
                  onContextMenu={(e) => props.onRepoMenu(name, e)}
                  title={`${name} · ${t(picking ? "sidebar.repoHintPicking" : "sidebar.repoHint")}${props.isDirectOnly(name) ? ` · ${t("sidebar.directOnly")}` : ""}`}
                  aria-pressed={repoFilter.includes(name)}
                >
                  {picking ? (
                    <span className={`repo-check${repoFilter.includes(name) ? " on" : ""}`}>
                      {repoFilter.includes(name) && (
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                          <path d="M3.2 6.3 5.1 8.2 8.8 4" />
                        </svg>
                      )}
                    </span>
                  ) : (
                    <span className="repo-dot" />
                  )}
                  <span className="repo-label">
                    <span className="repo-name">{name.split("/")[1]}</span>
                    {props.isDirectOnly(name) && <UserCheck className="repo-direct" size={12} aria-hidden />}
                  </span>
                  {repoCounts && <span className="nav-count">{count}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ScopeNotice missing={props.missingScopes} />
      <footer className="sidebar-foot">
        {me && <Avatar login={me} src={myAvatar ?? undefined} size={20} />}
        <span className="foot-text">
          <strong title={me ?? undefined}>{myName ?? me ?? "…"}</strong>
          {loading ? (
            <small>{t("sidebar.refreshing")}</small>
          ) : pausedUntil ? (
            <small className="offline" title={t("sidebar.pausedHint")}>
              {t("sidebar.paused", { time: pausedUntil.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" }) })}
            </small>
          ) : error && since ? (
            <small className="offline" title={error}>
              {t("sidebar.offline", { ago: since })}
            </small>
          ) : (
            <small>{since ? t("sidebar.updated", { ago: since }) : t("sidebar.notLoaded")}</small>
          )}
        </span>
        <UsageRing usage={props.usage} refreshMinutes={props.refreshMinutes} onClick={props.onSettings} />
        <button className="icon-btn" onClick={props.onSettings} title={t("sidebar.settings")}>
          <Settings2 size={15} />
        </button>
        <button className="icon-btn" onClick={props.onRules} title={t("sidebar.rules")}>
          <CircleHelp size={15} />
        </button>
      </footer>
    </nav>
  );
}
