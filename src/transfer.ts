import type { Item } from "./model";
import type { Settings } from "./store";

/**
 * Moves the entries of a map keyed by item id from each old id to its new one, for an issue
 * that was transferred (see `findTransfers`). An entry the new id already has wins, since the
 * viewer made it later, on the transferred copy.
 *
 * @param map    Item id → value, e.g. the stored statuses or notes.
 * @param moves  Old node id → new node id.
 * @returns A new map; `map` stays as it was.
 *
 * @example
 *   movedKeys(new Map([["I_old", "done"]]), new Map([["I_old", "I_new"]])); // Map { "I_new" => "done" }
 */
export function movedKeys<T>(map: ReadonlyMap<string, T>, moves: ReadonlyMap<string, string>): Map<string, T> {
  const next = new Map(map);
  for (const [from, to] of moves) {
    const value = next.get(from);
    if (value === undefined) continue;
    next.delete(from);
    if (!next.has(to)) next.set(to, value);
  }
  return next;
}

/**
 * Like `movedKeys` for lists per item, such as the status log: the old id's entries come first,
 * followed by those the new id already has, so the history stays in order.
 *
 * @example
 *   movedLists(new Map([["I_old", [a]], ["I_new", [b]]]), new Map([["I_old", "I_new"]])); // Map { "I_new" => [a, b] }
 */
export function movedLists<T>(map: ReadonlyMap<string, T[]>, moves: ReadonlyMap<string, string>): Map<string, T[]> {
  const next = new Map(map);
  for (const [from, to] of moves) {
    const old = next.get(from);
    if (!old) continue;
    next.delete(from);
    next.set(to, [...old, ...(next.get(to) ?? [])]);
  }
  return next;
}

/**
 * Carries the settings that name items by id over to the new ids of transferred issues: Today
 * (`focus`, `pinnedOn`), Plan (`planned`, `plannedAt`), untracked items and the notifications
 * waiting for their summary. An untracked entry also takes the new repository, number, title and
 * link from `items`, so the settings list it where it is now.
 *
 * @param settings  The current settings.
 * @param moves     Old node id → new node id.
 * @param items     The fetched items, holding the new ids.
 * @returns The settings to save; the same object when no move touches them.
 *
 * @example
 *   movedSettings(settings, new Map([["I_old", "I_new"]]), fetched).focus; // ["I_new"] where it was ["I_old"]
 */
export function movedSettings(settings: Settings, moves: ReadonlyMap<string, string>, items: Item[]): Settings {
  const named = [...settings.focus, ...settings.planned.map((p) => p.id), ...Object.keys(settings.pinnedOn), ...Object.keys(settings.plannedAt), ...settings.untracked.map((u) => u.id), ...settings.notifyCollected];
  if (!named.some((id) => moves.has(id))) return settings;
  const to = (id: string) => moves.get(id) ?? id;
  const ids = (list: string[]) => [...new Set(list.map(to))];
  const record = (from: Record<string, string>) => Object.fromEntries(movedKeys(new Map(Object.entries(from)), moves));
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    ...settings,
    focus: ids(settings.focus),
    notifyCollected: ids(settings.notifyCollected),
    planned: firstPerId(settings.planned.map((p) => ({ ...p, id: to(p.id) }))),
    pinnedOn: record(settings.pinnedOn),
    plannedAt: record(settings.plannedAt),
    untracked: firstPerId(
      settings.untracked.map((u) => {
        const item = byId.get(to(u.id));
        return item && moves.has(u.id) ? { ...u, id: item.id, repo: item.repo, number: item.number, title: item.title, url: item.url } : u;
      }),
    ),
  };
}

function firstPerId<T extends { id: string }>(list: T[]): T[] {
  return list.filter((entry, i) => list.findIndex((other) => other.id === entry.id) === i);
}
