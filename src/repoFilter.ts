/** Per organization: show all repos except the listed ones, or only the listed ones. */
export interface RepoFilter {
  mode: "all-except" | "only";
  /** Repo names without the owner, e.g. "app". */
  repos: string[];
}

/**
 * Tells whether an item's repo passes the viewer's repo filters. Organizations without a filter
 * show every repo; names compare case-insensitively.
 *
 * @param repo     The item's "owner/name".
 * @param filters  Organization login → its filter, from the settings.
 *
 * @example
 *   repoVisible("octo-org/app", { "octo-org": { mode: "only", repos: ["app"] } }); // true
 *   repoVisible("octo-org/docs", { "octo-org": { mode: "only", repos: ["app"] } }); // false
 */
export function repoVisible(repo: string, filters: Record<string, RepoFilter>): boolean {
  const [owner, name] = repo.toLowerCase().split("/");
  const entry = Object.entries(filters).find(([org]) => org.toLowerCase() === owner)?.[1];
  if (!entry) return true;
  const listed = entry.repos.some((r) => r.toLowerCase() === name);
  return entry.mode === "only" ? listed : !listed;
}
