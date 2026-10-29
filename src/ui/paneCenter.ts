/**
 * The middle of the pane that shows the selected item, for menus opened by a key: the detail
 * pop-up when open, else the detail pane, else the table, else the window.
 *
 * @example
 *   const { x, y } = paneCenter(); // <ContextMenu x={x} y={y} centered … />
 */
export function paneCenter(): { x: number; y: number } {
  const pane = document.querySelector(".item-popup .detail") ?? document.querySelector(".shell > .detail") ?? document.querySelector(".assigned");
  const box = pane?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/**
 * Where a menu opened by a key (P, F) goes: just below the item's row in the list or table, so it
 * opens next to what it acts on. While the item's pop-up covers the rows, or the row is scrolled
 * out of view, it is the middle of the pane instead (see `paneCenter`), centered there.
 *
 * @param id  The item's id, as its row carries it in `data-id`.
 *
 * @example
 *   setMenu({ entries, ...keyMenuAt(c.item.id) });
 */
export function keyMenuAt(id: string): { x: number; y: number; centered: boolean } {
  const row = document.querySelector(".item-popup") ? null : document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  const box = row?.getBoundingClientRect();
  if (box && box.bottom > 0 && box.top < window.innerHeight) return { x: box.left + 12, y: box.bottom + 4, centered: false };
  return { ...paneCenter(), centered: true };
}
