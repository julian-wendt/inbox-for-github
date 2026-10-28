import { useCallback, useState } from "react";

/**
 * Which bars of a table are collapsed, remembered in localStorage as a per-device convenience;
 * when storage is unavailable or holds garbage, `initial` applies.
 *
 * @param key      The localStorage key.
 * @param initial  Bars collapsed until the viewer changes it.
 * @returns The collapsed set, `toggle(bar)` and `setAll(bars, collapsed)` for several at once.
 *
 * @example
 *   const bars = useCollapsed("assigned-collapsed", ["later"]);
 *   bars.toggle("todo");
 */
export function useCollapsed(key: string, initial: string[]) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
      return new Set(Array.isArray(stored) ? stored.filter((x): x is string => typeof x === "string") : initial);
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
