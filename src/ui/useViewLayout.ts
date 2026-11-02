import { useCallback, useState } from "react";

/** How Planned or Follow-up renders: a list with the detail beside it, or a table like Assigned to me. */
export type Layout = "list" | "table";

/**
 * The layout of the Planned or the Follow-up view, a list unless the viewer switched it;
 * remembered per view in localStorage as a per-device convenience, so a missing or unreadable
 * store means the list.
 *
 * @param view  The view whose layout it is; each keeps its own.
 *
 * @example
 *   const [layout, setLayout] = useViewLayout("snoozed"); // ["list", fn]
 */
export function useViewLayout(view: "planned" | "snoozed"): [Layout, (layout: Layout) => void] {
  const key = `${view}-layout`;
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      return localStorage.getItem(key) === "table" ? "table" : "list";
    } catch {
      return "list";
    }
  });
  const set = useCallback(
    (next: Layout) => {
      setLayout(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Not persisting is acceptable; the layout still applies for this session.
      }
    },
    [key],
  );
  return [layout, set];
}
