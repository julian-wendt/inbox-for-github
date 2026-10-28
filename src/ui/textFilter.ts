import type { Classified } from "../classify";
import type { Item } from "../model";

/**
 * Tells whether an item matches a free-text search over its title and number. The query splits
 * at spaces and every word must match: a word is found in the title (case-insensitive), or, when
 * it is digits, also at the start of the number, so "12" finds #12 and #120. A leading "#" ("#12")
 * restricts the word to the number. An empty query matches everything.
 *
 * @param item   The item to test.
 * @param query  What the viewer typed.
 *
 * @example
 *   matchesText({ title: "Fix login redirect", number: 42 }, "login 4"); // true
 *   matchesText({ title: "Fix login redirect", number: 42 }, "#login"); // false
 */
export function matchesText(item: Pick<Item, "title" | "number">, query: string): boolean {
  const title = item.title.toLowerCase();
  const number = String(item.number);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => {
      const numeric = word.startsWith("#");
      const bare = numeric ? word.slice(1) : word;
      if (numeric) return /^\d+$/.test(bare) && number.startsWith(bare);
      return title.includes(word) || (/^\d+$/.test(word) && number.startsWith(word));
    });
}

/** A piece of text, and whether the search matched it. */
export interface Span {
  text: string;
  hit: boolean;
}

/**
 * Splits a title at the places the query matched, for highlighting. Every plain word of the
 * query counts (case-insensitive); "#" words belong to the number and mark nothing here.
 *
 * @param title  The item's title.
 * @param query  What the viewer typed.
 *
 * @example
 *   titleSpans("Fix login redirect", "LOGIN"); // [{ text: "Fix ", hit: false }, { text: "login", hit: true }, { text: " redirect", hit: false }]
 */
export function titleSpans(title: string, query: string): Span[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== "" && !w.startsWith("#"));
  const lower = title.toLowerCase();
  const marked = new Array<boolean>(title.length).fill(false);
  for (const word of words) {
    for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + word.length)) marked.fill(true, at, at + word.length);
  }
  const spans: Span[] = [];
  for (let i = 0; i < title.length; i++) {
    const last = spans.at(-1);
    if (last && last.hit === marked[i]) last.text += title[i];
    else spans.push({ text: title[i], hit: marked[i] });
  }
  return spans;
}

/**
 * Splits a number's digits into the matched start and the rest, mirroring `matchesText`: the
 * longest digit word (with or without "#") that the number starts with.
 *
 * @example
 *   numberSpans(120, "#12"); // [{ text: "12", hit: true }, { text: "0", hit: false }]
 */
export function numberSpans(number: number, query: string): Span[] {
  const digits = String(number);
  const words = query.split(/\s+/).map((w) => w.replace(/^#/, "")).filter((w) => /^\d+$/.test(w) && digits.startsWith(w));
  const length = Math.max(0, ...words.map((w) => w.length));
  return length === 0 ? [{ text: digits, hit: false }] : [{ text: digits.slice(0, length), hit: true }, ...(length < digits.length ? [{ text: digits.slice(length), hit: false }] : [])];
}

/**
 * Narrows a table's groups to the entries matching the query. A group left empty drops out,
 * except "focus" (Today), which keeps its place.
 *
 * @param groups  The table's groups.
 * @param query   What the viewer typed; blank returns the groups untouched.
 *
 * @example
 *   filterGroups(plate, "login"); // [{ group: "focus", entries: [] }, { group: "todo", entries: [ … ] }]
 */
export function filterGroups<G extends string>(groups: { group: G; entries: Classified[] }[], query: string): { group: G; entries: Classified[] }[] {
  if (query.trim() === "") return groups;
  return groups.map((g) => ({ ...g, entries: g.entries.filter((c) => matchesText(c.item, query)) })).filter((g) => g.entries.length > 0);
}
