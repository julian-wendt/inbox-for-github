import { isWindows, modifiersOf } from "./platform";

/**
 * Whether a key press is the key a menu entry shows: a letter, or "⌃" and a letter for Control
 * (Alt on Windows, see `modifiersOf`). Plain letters need Control, ⌘ and ⌥ to be up, so ⌃A does
 * not trigger an entry labelled "A" and ⌘R does not trigger "R"; a key pressed with AltGr on
 * Windows matches nothing.
 *
 * @example
 *   keyMatches("⌃A", event); // true while Control and A are down
 */
export function keyMatches(keys: string, e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): boolean {
  const control = keys.startsWith("⌃");
  const { mod, ctrl, altGr } = modifiersOf(e);
  // ⌥ is a modifier of its own on macOS only: on Windows Alt is `ctrl` already.
  const option = !isWindows() && e.altKey;
  return ctrl === control && !mod && !option && !altGr && keys.slice(control ? 1 : 0).toLowerCase() === e.key.toLowerCase();
}
