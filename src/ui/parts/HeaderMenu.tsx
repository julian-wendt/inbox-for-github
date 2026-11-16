import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";
import { ContextMenu, type MenuEntry } from "./ContextMenu";

/**
 * A button in a list or table header that opens a menu below it, like a select: the sprint
 * filter, the table's properties. Shows `label` next to `icon` when given, else the icon alone.
 *
 * @param title     The button's tooltip and accessible name.
 * @param disabled  Greyed out instead of hidden when there is nothing to choose, so the header keeps its layout.
 * @param entries  The menu (see `ContextMenu`); checked entries mark the current choice.
 * @param hiding    The current choice hides unread items: the button carries the unread dot and says so.
 *
 * @example
 *   <HeaderMenu icon={<IterationCw size={13} />} label="Sprint 12" title="Sprint" entries={choices} />
 */
export function HeaderMenu({ icon, label, title, entries, disabled = false, hiding = false }: { icon: ReactNode; label?: string; title: string; entries: MenuEntry[]; disabled?: boolean; hiding?: boolean }) {
  const [at, setAt] = useState<DOMRect | null>(null);
  const name = [label ? `${title}: ${label}` : title, ...(hiding ? [t("hiddenUnread.elsewhere")] : [])].join(" · ");
  return (
    <>
      <button
        className="chip-btn header-select"
        aria-haspopup="menu"
        disabled={disabled}
        aria-expanded={at !== null}
        title={hiding ? name : title}
        aria-label={name}
        onClick={(e) => setAt(e.currentTarget.getBoundingClientRect())}
      >
        {icon}
        {label && <span>{label}</span>}
        {hiding && <i className="fresh-dot" aria-hidden />}
        <ChevronDown size={12} aria-hidden />
      </button>
      {/* On the body, outside the header's stacking context, so the pane resizers cannot show through the menu. */}
      {at && createPortal(<ContextMenu x={at.left} y={at.bottom + 4} entries={entries} onClose={() => setAt(null)} />, document.body)}
    </>
  );
}
