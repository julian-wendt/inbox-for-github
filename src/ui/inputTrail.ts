/** How long an input counts as the cause of a status change that follows it. */
const WINDOW_MS = 2000;

let last: { label: string; at: number } | null = null;

/**
 * Notes the viewer's latest input, so a status change it causes can log where it came from
 * (`status_log.source`). Called by the key handler, the context menu, the palette and on every
 * pointer press; the latest call wins, so a click that runs a menu entry reads as "menu".
 *
 * @param label  What the input was: "key:o", "key:ctrl+a", "menu", "palette" or "click".
 * @param now    The time of the input in ms, for tests.
 *
 * @example
 *   noteInput(`key:${key}`);
 */
export function noteInput(label: string, now = Date.now()): void {
  last = { label, at: now };
}

/**
 * The input noted within the last two seconds, or null when there was none, as for changes the
 * app makes by itself.
 *
 * @example
 *   recentInput(); // "key:o"
 */
export function recentInput(now = Date.now()): string | null {
  return last && now - last.at <= WINDOW_MS ? last.label : null;
}
