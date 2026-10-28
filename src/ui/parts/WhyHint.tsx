import { Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import type { Explanation } from "../explain";
import { t } from "../i18n";

/**
 * Light-bulb button for the detail header that reveals, on click, why the item sits where it is
 * and what moves it on; a click outside or Escape closes it. The overview lies over the content
 * instead of pushing it down.
 *
 * @example
 *   <WhyHint why={explain(entry, reopenOn)} />
 */
export function WhyHint({ why }: { why: Explanation }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Capture phase and stopped, so Esc closes this first and not also the selection behind it.
    const close = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [open]);

  return (
    <span className="bulb">
      <button className="chip-btn" aria-expanded={open} aria-label={t("detail.why")} title={t("detail.why")} onClick={() => setOpen(!open)}>
        <Lightbulb size={14} />
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onMouseDown={() => setOpen(false)} />
          <div className="popover" role="dialog" aria-label={t("detail.why")}>
            <strong>{why.title}</strong>
            {why.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
