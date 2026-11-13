import { useCallback, useState } from "react";
import { NEW_SETTINGS } from "./newSettings";

const KEY = "seen-settings";

/**
 * Which new settings (`NEW_SETTINGS`) the viewer has seen, remembered in localStorage as a
 * per-device convenience; lost, the "New" chips only show once more.
 *
 * @returns The seen keys, `markSeen(keys)` to add some, and `markAllSeen()` for a fresh install.
 *
 * @example
 *   const { seen, markSeen } = useSeenSettings();
 *   markSeen(["tabToButtons"]);
 */
export function useSeenSettings() {
  const [seen, setSeen] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
      return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  });

  const markSeen = useCallback((keys: readonly string[]) => {
    setSeen((current) => {
      const added = keys.filter((k) => !current.includes(k));
      if (added.length === 0) return current;
      const next = [...current, ...added];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Not persisting is acceptable; the chips then show once more at the next start.
      }
      return next;
    });
  }, []);

  const markAllSeen = useCallback(() => markSeen(NEW_SETTINGS.map((s) => s.key)), [markSeen]);

  return { seen, markSeen, markAllSeen };
}
