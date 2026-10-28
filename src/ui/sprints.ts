import type { Item } from "../model";

/** The tables' sprint filter: every item, items on no sprint, or one sprint by name. */
export type SprintFilter = "all" | "none" | `sprint:${string}`;

/** The sprints an item is planned in, from the boards that are switched on. */
export function sprintsOf(item: Pick<Item, "boards">, hiddenBoards: string[] = []): string[] {
  return [...new Set(item.boards.filter((b) => !hiddenBoards.includes(b.id) && b.sprint).map((b) => b.sprint!))];
}

/**
 * Every sprint of the given items for the filter's choices, earliest first by the numbers in their
 * names ("Sprint 9" before "Sprint 12", "2026-11" before "2026-12"), so the list reads like a
 * calendar and the latest sprint stands last.
 *
 * @example
 *   sprintChoices(items); // ["Sprint 11", "Sprint 12"]
 */
export function sprintChoices(items: Pick<Item, "boards">[], hiddenBoards: string[] = []): string[] {
  const names = new Set(items.flatMap((i) => sprintsOf(i, hiddenBoards)));
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Whether an item passes the sprint filter. A filter naming a sprint no longer among `choices`
 * lets everything through, so a finished sprint cannot leave the table empty.
 *
 * @example
 *   matchesSprint(item, "sprint:Sprint 12", ["Sprint 12"]); // true when the item is planned in it
 */
export function matchesSprint(item: Pick<Item, "boards">, filter: SprintFilter, choices: string[], hiddenBoards: string[] = []): boolean {
  if (filter === "all") return true;
  const sprints = sprintsOf(item, hiddenBoards);
  if (filter === "none") return sprints.length === 0;
  const name = filter.slice("sprint:".length);
  return !choices.includes(name) || sprints.includes(name);
}
