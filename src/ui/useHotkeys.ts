import { useEffect, useLayoutEffect, useRef } from "react";
import { noteInput } from "./inputTrail";

/**
 * Key → handler. Keys use `KeyboardEvent.key`, prefixed with "mod+" for ⌘ or "ctrl+" for ⌃,
 * e.g. "mod+k", "ctrl+a", "e", "ArrowDown".
 */
export type Hotkeys = Record<string, (event: KeyboardEvent) => void>;

/** ⌘ shortcuts a text field owns while focused. */
const FIELD_KEYS = new Set(["mod+z", "mod+y"]);

/**
 * Binds window-wide shortcuts. Plain keys and "ctrl+" keys are ignored while focus is in a text
 * field, so typing never triggers actions (⌃A, ⌃O and the like edit text there); "mod+"
 * shortcuts and Escape always fire, except ⌘Z and ⌘Y, which a text field keeps for undoing and redoing its typing.
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
      // Shift counts with ⌘ and with letters (⇧A); "?" and other shifted symbols arrive as themselves.
      const shift = event.shiftKey && (event.metaKey || /^[a-z]$/i.test(event.key)) ? "shift+" : "";
      const key = `${event.metaKey ? "mod+" : ""}${event.ctrlKey ? "ctrl+" : ""}${shift}${event.key.length === 1 ? event.key.toLowerCase() : event.key}`;
      const handler = current.current[key];
      if (!handler) return;
      if ((!event.metaKey || FIELD_KEYS.has(key)) && key !== "Escape" && isTyping(event.target)) return;
      event.preventDefault();
      noteInput(`key:${key}`);
      handler(event);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}
