/**
 * Whether a key press is the key a menu entry shows: a letter, or "⌃" and a letter for Control.
 * Plain letters need Control, ⌘ and ⌥ to be up, so ⌃A does not trigger an entry labelled "A" and ⌘R
 * does not trigger "R".
 *
 * @example
 *   keyMatches("⌃A", event); // true while Control and A are down
 */
export function keyMatches(keys: string, e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): boolean {
  const control = keys.startsWith("⌃");
  return e.ctrlKey === control && !e.metaKey && !e.altKey && keys.slice(control ? 1 : 0).toLowerCase() === e.key.toLowerCase();
}
