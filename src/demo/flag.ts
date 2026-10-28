const KEY = "demo-mode";

/**
 * Whether the app runs on synthetic data: started with `VITE_DEMO=1`, or switched on from the
 * settings (⌥-click on the version), which is remembered in this window's local storage.
 *
 * @example
 *   if (isDemo()) installDemo();
 */
export function isDemo(): boolean {
  if (import.meta.env.VITE_DEMO === "1") return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether the demo can be switched from inside the app; started with `VITE_DEMO=1` it stays on. */
export function canSwitchDemo(): boolean {
  return import.meta.env.VITE_DEMO !== "1";
}

/** Remembers the demo switch for the next start; storage that is not available leaves it off. */
export function rememberDemo(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the switch simply does not stick.
  }
}
