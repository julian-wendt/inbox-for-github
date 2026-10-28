import { useCallback, useState } from "react";

/**
 * One resizable size in CSS pixels, clamped to bounds and remembered in localStorage across
 * restarts; like `useColumnWidths`, a per-device convenience that falls back to `initial` when
 * storage is unavailable or holds garbage.
 *
 * @param key     The localStorage key.
 * @param bounds  Initial, smallest and largest size.
 * @returns The size, `resize(size)` to set it (clamped and persisted) and `reset()`.
 *
 * @example
 *   const reply = useStoredSize("reply-height", { initial: 96, min: 64, max: 480 });
 *   reply.resize(200);
 */
export function useStoredSize(key: string, bounds: { initial: number; min: number; max: number }) {
  const clamp = (size: number) => Math.round(Math.min(bounds.max, Math.max(bounds.min, size)));
  const [size, setSize] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(key));
      return stored ? clamp(stored) : bounds.initial;
    } catch {
      return bounds.initial;
    }
  });

  const resize = useCallback(
    (next: number) => {
      const value = Math.round(Math.min(bounds.max, Math.max(bounds.min, next)));
      setSize(value);
      try {
        localStorage.setItem(key, String(value));
      } catch {
        // Not persisting is acceptable; the size still applies for this session.
      }
    },
    [key, bounds.min, bounds.max],
  );
  const reset = useCallback(() => resize(bounds.initial), [resize, bounds.initial]);

  return { size, resize, reset };
}
