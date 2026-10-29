import { Check, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { noteInput } from "../inputTrail";
import { keyMatches } from "../keyMatch";

/** One entry of a context menu; `items` makes it open a submenu instead of running. */
export interface MenuEntry {
  label: string;
  /** A short second line for entries whose label does not say everything. */
  hint?: string;
  icon?: ReactNode;
  /** Shortcut shown on the right; pressing it while the menu is open runs the entry. */
  keys?: string;
  checked?: boolean;
  onSelect?: () => void;
  items?: MenuEntry[];
  /** Draws a separator above the entry. */
  divided?: boolean;
  /** The menu stays open after the entry ran, for switches the viewer flips several of. */
  keepOpen?: boolean;
  /** Shown greyed and skipped, for an entry that always has its place but nothing to do now. */
  disabled?: boolean;
}

/**
 * A right-click menu at the pointer, kept inside the window. It takes the keyboard while open:
 * ↑/↓ move, Enter or → runs or opens a submenu, ← closes the submenu, Escape closes, and an
 * entry's shortcut runs it. A click outside, scrolling or resizing closes it.
 *
 * @param x, y      Where the pointer was, in viewport pixels; with `centered`, the menu's middle.
 * @param entries   The menu, top to bottom.
 * @param onClose   Called when the menu should go away, also after an entry ran.
 * @param centered  Centers the menu on x, y, for menus a key opens in a pane (see `paneCenter`).
 * @param fit       Grows the menu so every hint stays on one line, for the menus a key opens.
 *
 * @example
 *   <ContextMenu x={e.clientX} y={e.clientY} entries={[{ label: "Done", keys: "D", onSelect: done }]} onClose={close} />
 */
export function ContextMenu({ x, y, entries, onClose, centered = false, fit = false }: { x: number; y: number; entries: MenuEntry[]; onClose: () => void; centered?: boolean; fit?: boolean }) {
  const [active, setActive] = useState(0);
  const [sub, setSub] = useState<number | null>(null);
  const [subActive, setSubActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    const left = centered ? x - box.width / 2 : x;
    const top = centered ? y - box.height / 2 : y;
    setPos({ x: Math.max(8, Math.min(left, window.innerWidth - box.width - 8)), y: Math.max(8, Math.min(top, window.innerHeight - box.height - 8)) });
  }, [x, y, centered]);

  const run = (entry: MenuEntry) => {
    if (entry.disabled) return;
    noteInput("menu");
    if (!entry.keepOpen) onClose();
    entry.onSelect?.();
  };

  const latest = useRef({ active, sub, subActive, entries, run, onClose });
  useLayoutEffect(() => {
    latest.current = { active, sub, subActive, entries, run, onClose };
  });

  useEffect(() => {
    // Capture phase, so the app's own shortcuts do not fire behind the open menu.
    const onKey = (e: KeyboardEvent) => {
      const { active, sub, subActive, entries, run, onClose } = latest.current;
      e.preventDefault();
      e.stopPropagation();
      const list = sub === null ? entries : entries[sub].items!;
      const index = sub === null ? active : subActive;
      const move = sub === null ? setActive : setSubActive;
      if (e.key === "Escape") return onClose();
      if (e.key === "ArrowDown") return move(step(list, index, 1));
      if (e.key === "ArrowUp") return move(step(list, index, -1));
      if (e.key === "ArrowLeft" && sub !== null) return setSub(null);
      if (e.key === "Enter" || e.key === "ArrowRight" || e.key === " ") {
        const entry = list[index];
        if (entry.items) {
          setSub(index);
          setSubActive(0);
        } else if (e.key !== "ArrowRight") run(entry);
        return;
      }
      const byKey = list.find((entry) => entry.keys && keyMatches(entry.keys, e));
      if (!byKey) return;
      if (byKey.items && sub === null) {
        setActive(list.indexOf(byKey));
        setSub(list.indexOf(byKey));
        setSubActive(0);
      } else run(byKey);
    };
    const close = () => latest.current.onClose();
    const onPointer = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node)) return;
      swallowClick(e);
      close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("blur", close);
    };
  }, []);

  return (
    <div ref={root} className={`context-menu${fit ? " fit" : ""}`} role="menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {entries.map((entry, i) => (
        <div key={entry.label} className="menu-slot">
          {entry.divided && <hr />}
          <MenuRow
            entry={entry}
            slot={hasSlot(entries)}
            active={i === active && sub === null}
            open={sub === i}
            onHover={() => {
              setActive(i);
              setSub(entry.items ? i : null);
              setSubActive(0);
            }}
            onSelect={() => (entry.items ? setSub(i) : run(entry))}
          />
          {sub === i && entry.items && (
            <div className="context-menu submenu" role="menu">
              {entry.items.map((child, j) => (
                <div key={child.label} className="menu-slot">
                  {child.divided && <hr />}
                  <MenuRow entry={child} slot={hasSlot(entry.items!)} active={j === subActive} open={false} onHover={() => setSubActive(j)} onSelect={() => run(child)} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Keeps the press that closes the menu from also acting on what lies under the pointer, such as
 * opening a row: its mouse down and click are dropped before they reach the page.
 */
function swallowClick(press: PointerEvent) {
  press.preventDefault();
  press.stopPropagation();
  const drop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const done = () => {
    window.removeEventListener("mousedown", drop, true);
    window.removeEventListener("click", drop, true);
    window.removeEventListener("click", done, true);
  };
  window.addEventListener("mousedown", drop, true);
  window.addEventListener("click", drop, true);
  window.addEventListener("click", done, true);
  // A press that never turns into a click (a drag, a right click) must not eat a later one.
  window.setTimeout(done, 600);
}

/** The next entry from `index` in direction `by` that is not disabled, wrapping around. */
function step(list: MenuEntry[], index: number, by: 1 | -1): number {
  for (let n = 1; n <= list.length; n++) {
    const next = (((index + by * n) % list.length) + list.length) % list.length;
    if (!list[next].disabled) return next;
  }
  return index;
}

/** Rows of a menu share a column for check marks and icons once any of them has one, so labels align. */
function hasSlot(entries: MenuEntry[]): boolean {
  return entries.some((e) => e.checked !== undefined || e.icon !== undefined);
}

function MenuRow(props: { entry: MenuEntry; slot: boolean; active: boolean; open: boolean; onHover: () => void; onSelect: () => void }) {
  const { entry, slot, active, open } = props;
  return (
    <button
      role="menuitem"
      aria-haspopup={entry.items ? "menu" : undefined}
      aria-expanded={entry.items ? open : undefined}
      className={`menu-row${active || open ? " active" : ""}`}
      disabled={entry.disabled}
      onPointerEnter={entry.disabled ? undefined : props.onHover}
      onClick={props.onSelect}
    >
      {slot && <span className="menu-icon">{entry.checked ? <Check size={14} /> : entry.icon}</span>}
      <span className="menu-label">
        {entry.label}
        {entry.hint && <small className="menu-hint">{entry.hint}</small>}
      </span>
      {entry.keys && <kbd>{entry.keys}</kbd>}
      {entry.items && <ChevronRight size={14} className="menu-more" />}
    </button>
  );
}
