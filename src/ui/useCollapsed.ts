import { useCallback, useState } from "react";

/**
 * Which bars of a table are collapsed, remembered in localStorage as a per-device convenience;
 * when storage is unavailable or holds garbage, `initial` applies.
 *
 * @param key      The localStorage key.
 * @param initial  Bars collapsed until the viewer changes it.
 * @param added    Bars of `initial` that came after devices stored a choice: each starts collapsed
 *                 there once, recorded under `<key>:defaults`.
 * @returns The collapsed set, `toggle(bar)` and `setAll(bars, collapsed)` for several at once.
 *
 * @example
 *   const bars = useCollapsed("assigned-collapsed", ["later", "inbox:later"], ["inbox:later"]);
 *   bars.toggle("todo");
 */
export function useCollapsed(key: string, initial: string[], added: string[] = []) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const restored = restoreCollapsed(localStorage.getItem(key), localStorage.getItem(`${key}:defaults`), initial, added);
      localStorage.setItem(key, JSON.stringify(restored.collapsed));
      localStorage.setItem(`${key}:defaults`, JSON.stringify(restored.applied));
      return new Set(restored.collapsed);
    } catch {
      return new Set(initial);
    }
  });

  const toggle = useCallback(
    (bar: string) => {
      setCollapsed((current) => {
        const next = new Set(current);
        if (!next.delete(bar)) next.add(bar);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          // Not persisting is acceptable; the state still applies for this session.
        }
        return next;
      });
    },
    [key],
  );

  const setAll = useCallback(
    (keys: string[], fold: boolean) => {
      setCollapsed((current) => {
        const next = new Set(current);
        for (const k of keys) {
          if (fold) next.add(k);
          else next.delete(k);
        }
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          // Not persisting is acceptable; the state still applies for this session.
        }
        return next;
      });
    },
    [key],
  );

  return { collapsed, toggle, setAll };
}

/**
 * The collapsed bars from what a device stored: its choice plus each bar of `added` it has not
 * collapsed once yet, or `initial` without a choice; `applied` is the new record of those bars.
 *
 * @param stored   The stored choice as JSON, null when there is none.
 * @param applied  The stored record of added bars collapsed already, as JSON.
 *
 * @example
 *   restoreCollapsed('["todo"]', null, ["later"], ["inbox:later"]); // { collapsed: ["todo", "inbox:later"], applied: ["inbox:later"] }
 */
export function restoreCollapsed(stored: string | null, applied: string | null, initial: string[], added: string[]): { collapsed: string[]; applied: string[] } {
  const choice = strings(stored);
  const done = strings(applied) ?? [];
  const collapsed = choice ? [...new Set([...choice, ...added.filter((bar) => !done.includes(bar))])] : initial;
  return { collapsed, applied: [...new Set([...done, ...added])] };
}

/** A stored JSON array of strings, or null when there is none or it holds something else. */
function strings(json: string | null): string[] | null {
  try {
    const value = JSON.parse(json ?? "null") as unknown;
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}
