import type { Classified } from "../classify";

/** One filter of a view: its options, the one chosen, and whether an item passes an option. */
export interface Filter {
  options: readonly string[];
  chosen: string;
  passes: (entry: Classified, option: string) => boolean;
}

/** What the filters of a view hide of its unread items (see `hiddenUnread`). */
export interface Hidden {
  /** How many unread items the chosen options hide. */
  count: number;
  /** Per filter, the options that would bring some of them into view. */
  reveals: Record<string, ReadonlySet<string>>;
}

/**
 * Where the filters of a view hide unread items, so the controls can point to them.
 *
 * An item is hidden when it fails the chosen option of any filter. An option reveals it when the
 * item passes that option and the chosen option of every other filter, so picking it alone
 * brings the item into view. An item two filters hide counts, but no single option reveals it.
 *
 * @param unread   The unread items the view's count stands for, before its own filters.
 * @param filters  The view's filters by name.
 * @returns How many unread items are hidden, and per filter the options that reveal some.
 *
 * @example
 *   hiddenUnread(unread, { kind: { options: ["all", "issue", "pr"], chosen: "issue", passes: (c, k) => k === "all" || c.item.kind === k } });
 *   // { count: 1, reveals: { kind: Set { "all", "pr" } } }: one unread pull request
 */
export function hiddenUnread(unread: readonly Classified[], filters: Record<string, Filter>): Hidden {
  const named = Object.entries(filters);
  const passesOthers = (entry: Classified, skip?: string) => named.every(([name, f]) => name === skip || f.passes(entry, f.chosen));
  const hidden = unread.filter((entry) => !passesOthers(entry));
  const reveals = Object.fromEntries(
    named.map(([name, f]) => [name, new Set(f.options.filter((option) => option !== f.chosen && hidden.some((entry) => f.passes(entry, option) && passesOthers(entry, name))))]),
  );
  return { count: hidden.length, reveals };
}
