import { Search, X } from "lucide-react";
import { useEffect, type RefObject } from "react";
import { t } from "../i18n";

/**
 * The search bar ⌘F opens in a view: a text field with the match count and a close button,
 * focused on appearing. It is docked under the header at the width of the rows and pushes
 * them down (`useSearchDock` slides it in and out). Escape and the
 * button close it, which also ends the search; ↓ and Enter leave the field so the arrow keys
 * move through the list again.
 *
 * @param value     The typed text.
 * @param onChange  Called with the new text, or null to close the bar.
 * @param count     How many items match, printed once something is typed.
 * @param inputRef  The input, so ⌘F can focus it again.
 *
 * @example
 *   {shown && <SearchField value={search ?? ""} onChange={setSearch} count={matches} inputRef={searchRef} />}
 */
export function SearchField({ value, onChange, count, inputRef }: { value: string; onChange: (search: string | null) => void; count: number; inputRef: RefObject<HTMLInputElement | null> }) {
  useEffect(() => inputRef.current?.focus(), [inputRef]);
  const bar = (
    <div className="search-bar" role="search">
      <Search size={16} aria-hidden />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onChange(null);
          } else if (e.key === "ArrowDown" || e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        placeholder={t("search.placeholder")}
        aria-label={t("search.label")}
        spellCheck={false}
      />
      {value.trim() !== "" && <span className="search-count">{count === 0 ? t("search.none") : count === 1 ? t("search.one") : t("search.many", { count })}</span>}
      <button className="search-close" onClick={() => onChange(null)} title={t("search.close")} aria-label={t("search.close")}>
        <X size={15} />
      </button>
    </div>
  );
  return <div className="search-dock">{bar}</div>;
}
