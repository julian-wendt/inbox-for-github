/**
 * Several items marked at once, for acting on all of them: ⌘-click toggles one, ⇧-click and
 * ⇧↑/⇧↓ take a range from the selected item. Group bars ("bar:…") are never marked.
 */
export type Marks = ReadonlySet<string>;

const isItem = (id: string) => !id.startsWith("bar:");

/** Adds the id, or removes it when it is marked already. */
export function toggleMark(marks: Marks, id: string): Set<string> {
  const next = new Set(marks);
  if (next.has(id)) next.delete(id);
  else if (isItem(id)) next.add(id);
  return next;
}

/**
 * The marks plus every item from `from` to `to` in list order, both included. Without `from`
 * (nothing selected yet) only `to` is added.
 *
 * @example
 *   markRange(new Set(), ["a", "bar:x", "b", "c"], "a", "c"); // Set { "a", "b", "c" }
 */
export function markRange(marks: Marks, ids: string[], from: string | null, to: string): Set<string> {
  const next = new Set(marks);
  const start = from ? ids.indexOf(from) : -1;
  const end = ids.indexOf(to);
  if (end < 0) return next;
  const [low, high] = start < 0 ? [end, end] : [Math.min(start, end), Math.max(start, end)];
  for (const id of ids.slice(low, high + 1)) if (isItem(id)) next.add(id);
  return next;
}

/** The marks still in the list, in list order; marks of items that left it drop out. */
export function markedIn(marks: Marks, ids: string[]): string[] {
  return ids.filter((id) => marks.has(id));
}
