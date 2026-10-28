import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { t } from "../i18n";
import type { SortOrder } from "../useSortOrders";

/**
 * Flips a list between newest and oldest first, by the time each row shows on its right; for the
 * follow-up list, whose rows show when they return, between soonest and latest first.
 *
 * @example
 *   <SortButton order={sort.of(bucket)} onFlip={() => sort.flip(bucket)} />
 *   <SortButton order={sort.of("snoozed")} onFlip={flip} by="return" />
 */
export function SortButton({ order, onFlip, by }: { order: SortOrder; onFlip: () => void; by?: "return" }) {
  const label = t(by === "return" ? (order === "newest" ? "sort.soonest" : "sort.latest") : order === "newest" ? "sort.newest" : "sort.oldest");
  return (
    <button className="chip-btn" onClick={onFlip} title={label} aria-label={label}>
      {order === "newest" ? <ArrowDownWideNarrow size={15} /> : <ArrowUpNarrowWide size={15} />}
    </button>
  );
}
