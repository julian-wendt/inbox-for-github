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
