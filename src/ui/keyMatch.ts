/**
 * Whether a key press is the key a menu entry shows: a letter, or "⌃" and a letter for Control.
 * Plain letters need Control to be up, so ⌃A does not trigger an entry labelled "A".
 *
 * @example
 *   keyMatches("⌃A", event); // true while Control and A are down
 */
export function keyMatches(keys: string, e: Pick<KeyboardEvent, "key" | "ctrlKey">): boolean {
  const control = keys.startsWith("⌃");
  return e.ctrlKey === control && keys.slice(control ? 1 : 0).toLowerCase() === e.key.toLowerCase();
}
