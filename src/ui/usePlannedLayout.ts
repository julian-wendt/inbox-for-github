import { useCallback, useState } from "react";

/** How Planned renders: a list with the detail beside it, or a table like Assigned to me. */
export type Layout = "list" | "table";

const KEY = "planned-layout";

/**
 * The layout of the Planned view, a list unless the viewer switched it; remembered in localStorage
 * as a per-device convenience, so a missing or unreadable store means the list.
 *
 * @example
 *   const [layout, setLayout] = usePlannedLayout(); // ["list", fn]
 */
export function usePlannedLayout(): [Layout, (layout: Layout) => void] {
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      return localStorage.getItem(KEY) === "table" ? "table" : "list";
    } catch {
      return "list";
    }
  });
  const set = useCallback((next: Layout) => {
    setLayout(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not persisting is acceptable; the layout still applies for this session.
    }
  }, []);
  return [layout, set];
}
