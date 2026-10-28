/**
 * The repo filter after a click in the sidebar, with the macOS convention for lists: a plain
 * click picks only that repo (or clears the filter when it was the only one picked), ⌘-click
 * adds or removes it. An empty list means all repos.
 *
 * @example
 *   pickRepo([], "o/a", false);        // ["o/a"]
 *   pickRepo(["o/a"], "o/b", true);    // ["o/a", "o/b"]
 *   pickRepo(["o/a"], "o/a", false);   // []
 */
export function pickRepo(selected: string[], repo: string, add: boolean): string[] {
  if (add) return selected.includes(repo) ? selected.filter((r) => r !== repo) : [...selected, repo];
  return selected.length === 1 && selected[0] === repo ? [] : [repo];
}
