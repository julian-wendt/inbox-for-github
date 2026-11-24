/** The operating systems the app runs on: macOS, and Windows in the Windows edition, a fork that shares this code. Whatever differs between them branches on this. */
export type Platform = "mac" | "windows";

/**
 * The platform behind a web view's user agent: "windows" for WebView2
 * ("… (Windows NT 10.0; Win64; x64) …"), "mac" for everything else, so macOS stays the default.
 *
 * @example
 *   platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 … Edg/142.0"); // "windows"
 */
export function platformOf(userAgent: string): Platform {
  return userAgent.includes("Windows NT") ? "windows" : "mac";
}

/**
 * The platform this page runs on. A `platform=mac` or `platform=windows` in the address wins over
 * the web view's own answer, so either platform's behaviour can be shown from any machine.
 *
 * @param search  The address's query string; the page's own by default.
 *
 * @example
 *   detectPlatform("?lang=de&platform=windows"); // "windows"
 */
export function detectPlatform(search: string = window.location.search): Platform {
  const forced = new URLSearchParams(search).get("platform");
  return forced === "mac" || forced === "windows" ? forced : platformOf(navigator.userAgent);
}

let current: Platform | null = null;

/**
 * The platform every function here answers for, decided on first use: `detectPlatform` in a
 * window, "mac" without one (the unit tests, which run in Node on any machine).
 *
 * Read it inside functions and during render, never into a module-level constant: such a constant
 * would be fixed before a test can switch the platform with `setPlatform`.
 *
 * @example
 *   platform(); // "mac" in the macOS app
 */
export function platform(): Platform {
  current ??= typeof window === "undefined" ? "mac" : detectPlatform();
  return current;
}

/**
 * Switches the platform for every following call. For tests, which set it back to "mac" when done.
 *
 * @example
 *   setPlatform("windows");
 */
export function setPlatform(next: Platform): void {
  current = next;
}

/** Whether the app runs on Windows. */
export function isWindows(): boolean {
  return platform() === "windows";
}

/**
 * The two modifiers shortcuts are bound with, as held in a key or mouse event: `mod` is ⌘ on
 * macOS and Ctrl on Windows; `ctrl` is ⌃ on macOS and Alt on Windows, where Ctrl is `mod` already.
 * AltGr, which Windows reports as Ctrl and Alt together, types a character: it is neither of
 * the two, and `altGr` says it is held, since a key pressed with it must not act as a plain key
 * either (Ctrl+Alt+D is not D).
 *
 * @example
 *   modifiersOf(event).mod; // true for ⌘K on macOS and for Ctrl+K on Windows
 */
export function modifiersOf(e: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey">): { mod: boolean; ctrl: boolean; altGr: boolean } {
  if (!isWindows()) return { mod: e.metaKey, ctrl: e.ctrlKey, altGr: false };
  const altGr = e.ctrlKey && e.altKey;
  return { mod: e.ctrlKey && !altGr, ctrl: e.altKey && !altGr, altGr };
}
