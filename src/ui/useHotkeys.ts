import { useEffect, useLayoutEffect, useRef } from "react";
import { noteInput } from "./inputTrail";
import { modifiersOf } from "./platform";

/**
 * Key → handler. Keys use `KeyboardEvent.key`, prefixed with "mod+" for ⌘ or "ctrl+" for ⌃,
 * e.g. "mod+k", "ctrl+a", "e", "ArrowDown". On Windows "mod+" is Ctrl and "ctrl+" is Alt
 * (`modifiersOf`); the bindings are written once for both.
 */
export type Hotkeys = Record<string, (event: KeyboardEvent) => void>;

/** ⌘ shortcuts a text field owns while focused. */
const FIELD_KEYS = new Set(["mod+z", "mod+y"]);

/** Plain keys whose binding fires inside a text field too. */
const ANYWHERE_KEYS = new Set(["Escape", "Tab"]);

/**
 * The name a key press is bound under: "mod+shift+r", "ctrl+a", "ArrowDown", "?". Shift counts
 * with "mod" and with letters (⇧A); "?" and other shifted symbols arrive as themselves. A key
 * pressed with AltGr on Windows gets "altgr+" in front, which no binding has, so it triggers nothing.
 *
 * @example
 *   hotkeyOf(event); // "mod+k" for ⌘K on macOS and for Ctrl+K on Windows
 */
export function hotkeyOf(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): string {
  const { mod, ctrl, altGr } = modifiersOf(event);
  const shift = event.shiftKey && (mod || /^[a-z]$/i.test(event.key)) ? "shift+" : "";
  return `${altGr ? "altgr+" : ""}${mod ? "mod+" : ""}${ctrl ? "ctrl+" : ""}${shift}${event.key.length === 1 ? event.key.toLowerCase() : event.key}`;
}

/**
 * Binds window-wide shortcuts. Plain keys and "ctrl+" keys are ignored while focus is in a text
 * field, so typing never triggers actions (⌃A, ⌃E and the like edit text there); "mod+"
 * shortcuts, Escape and Tab always fire, except ⌘Z and ⌘Y, which a text field keeps for undoing and redoing its typing.
 * Enter and Space stay with a button or link Tab moved the focus to (with the "tabToButtons"
 * setting on), so it can be pressed; after a click they are shortcuts again.
 *
 * @param hotkeys  The bindings; may change on every render without rebinding the listener.
 * @param enabled  False suspends all bindings, e.g. while a dialog owns the keyboard.
 *
 * @example
 *   useHotkeys({ ArrowDown: next, "ctrl+a": assignMe, "mod+k": openPalette });
 */
export function useHotkeys(hotkeys: Hotkeys, enabled = true): void {
  const current = useRef(hotkeys);
  useLayoutEffect(() => {
    current.current = hotkeys;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const key = hotkeyOf(event);
      const handler = current.current[key];
      if (!handler) return;
      if ((!modifiersOf(event).mod || FIELD_KEYS.has(key)) && !ANYWHERE_KEYS.has(key) && isTyping(event.target)) return;
      if ((key === "Enter" || key === " ") && isKeyFocusedControl(event.target)) return;
      event.preventDefault();
      noteInput(`key:${key}`);
      handler(event);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** A button or link that got the focus from Tab; `main.tsx` keeps `data-focus` on the root. */
function isKeyFocusedControl(target: EventTarget | null): boolean {
  return document.documentElement.dataset.focus === "keys" && target instanceof HTMLElement && target.matches("button, a[href], summary");
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}
