import { X } from "lucide-react";
import { t } from "../i18n";

/**
 * In a list or table header while several items are marked: how many, and a click (or Escape)
 * clears the marks. Nothing while none are.
 *
 * @example
 *   <MarkedChip count={marked.length} onClear={clearMarks} />
 */
export function MarkedChip({ count, onClear }: { count: number; onClear: () => void }) {
  if (count === 0) return null;
  return (
    <button className="chip marked-chip" onClick={onClear} title={`${t("marks.clear")} (Esc)`}>
      {t("marks.count", { count })}
      <X size={12} aria-hidden />
    </button>
  );
}
