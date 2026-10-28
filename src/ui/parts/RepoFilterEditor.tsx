import { useEffect, useState } from "react";
import { ghToken } from "../../github/token";
import { fetchOrgRepos } from "../../github/fetch";
import type { RepoFilter } from "../../repoFilter";
import { t } from "../i18n";

type Mode = "all" | RepoFilter["mode"];

const MODES: Mode[] = ["all", "all-except", "only"];

/**
 * Edits which repos of one organization count: all, all except the switched-off ones (new repos
 * show up), or only the switched-on ones (new repos stay hidden). Loads the organization's repos
 * when it mounts.
 *
 * @param org       The organization login.
 * @param filter    Its current filter; undefined means all repos.
 * @param onChange  Called with the new filter, or undefined for all repos.
 * @param listOnly  Hides the mode choice and edits only the "only" list, for settings that pick repos without exceptions.
 *
 * @example
 *   <RepoFilterEditor org="octo-org" filter={filters["octo-org"]} onChange={(f) => setFilter("octo-org", f)} />
 */
export function RepoFilterEditor({ org, filter, onChange, listOnly = false }: { org: string; filter?: RepoFilter; onChange: (filter?: RepoFilter) => void; listOnly?: boolean }) {
  const [repos, setRepos] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const mode: Mode = listOnly ? "only" : (filter?.mode ?? "all");

  useEffect(() => {
    let live = true;
    ghToken()
      .then((token) => fetchOrgRepos(token, org))
      .then((names) => live && setRepos(names))
      .catch((e: unknown) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [org]);

  const listed = (name: string) => filter?.repos.some((r) => r.toLowerCase() === name.toLowerCase()) ?? false;
  const visible = (name: string) => (mode === "only" ? listed(name) : !listed(name));
  const setVisible = (name: string, show: boolean) => {
    if (!filter) return;
    const list = filter.mode === "only" ? show : !show;
    const others = filter.repos.filter((r) => r.toLowerCase() !== name.toLowerCase());
    onChange({ ...filter, repos: list ? [...others, name] : others });
  };
  const shown = (repos ?? []).filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="repo-filter">
      <div className="repo-filter-bar">
        {!listOnly && (
          <div className="radios" role="radiogroup" aria-label={t("repos.mode")}>
            {MODES.map((m) => (
              <label key={m} className="radio">
                <input
                  type="radio"
                  name={`repo-mode-${org}`}
                  checked={mode === m}
                  onChange={() => onChange(m === "all" ? undefined : { mode: m, repos: [] })}
                />
                {t(`repos.mode.${m}`)}
              </label>
            ))}
          </div>
        )}
        <input
          className="repo-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("repos.search")}
          spellCheck={false}
          hidden={mode === "all"}
        />
      </div>
      {mode !== "all" && (
        <>
          {error && <small className="repo-error">{error}</small>}
          {!repos && !error && <small>{t("repos.loading")}</small>}
          <ul className="repo-list">
            {shown.map((name) => (
              <li key={name}>
                <label>
                  <span>{name}</span>
                  <input type="checkbox" className="switch" checked={visible(name)} onChange={(e) => setVisible(name, e.target.checked)} />
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
