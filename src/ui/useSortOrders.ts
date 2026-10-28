import { useCallback, useState } from "react";
import type { View } from "./labels";

export type SortOrder = "newest" | "oldest";

const KEY = "sort-orders";

/**
 * The sort direction of each view, newest first unless the viewer flipped it; remembered in
 * localStorage as a per-device convenience, so a missing or unreadable store means newest first.
 *
 * @returns The order of a view and `flip(bucket)`.
 *
 * @example
 *   const sort = useSortOrders();
 *   sort.of("done"); // "newest"
 *   sort.flip("done");
 */
export function useSortOrders() {
  const [orders, setOrders] = useState<Partial<Record<View, SortOrder>>>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<View, SortOrder>>;
    } catch {
      return {};
    }
  });

  const flip = useCallback((bucket: View) => {
    setOrders((current) => {
      const next = { ...current, [bucket]: current[bucket] === "oldest" ? "newest" : "oldest" } as Partial<Record<View, SortOrder>>;
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Not persisting is acceptable; the order still applies for this session.
      }
      return next;
    });
  }, []);

  const of = useCallback((bucket: View): SortOrder => (orders[bucket] === "oldest" ? "oldest" : "newest"), [orders]);

  return { of, flip };
}
