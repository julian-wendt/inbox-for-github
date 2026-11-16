/** Where a menu opens: at a point, or hanging from the box of the control that opened it. */
export interface MenuAt {
  /** A point in viewport pixels: the pointer, or with `centered` the menu's middle. */
  x?: number;
  y?: number;
  /** The opening control's box: the menu hangs `gap` below it, or above when there is no room. */
  anchor?: { left: number; right: number; top: number; bottom: number };
  /** With `anchor`: right edges line up, for controls at the right end of a bar. */
  end?: boolean;
  /** Centers the menu on x, y. */
  centered?: boolean;
  /** Centers the menu on x, or on the anchor's width. */
  centerX?: boolean;
}

/**
 * The top left corner of a menu of the given size, kept `margin` inside the window.
 *
 * An anchored menu lines up with one edge of its control and opens `gap` below it; when it
 * would leave the window it lines up with the other edge, and opens above when only that fits.
 * A menu at a point opens there, or centered on it, and is pushed back inside the window.
 *
 * @param size    The menu's measured width and height.
 * @param at      Where it opens (see `MenuAt`).
 * @param view    The window's inner width and height.
 * @param gap     `--pop-gap` in px; `margin` is `--window-margin`.
 *
 * @example
 *   menuPosition({ width: 260, height: 120 }, { anchor: button.getBoundingClientRect(), end: true }, { width: innerWidth, height: innerHeight }, 6, 8);
 */
export function menuPosition(size: { width: number; height: number }, at: MenuAt, view: { width: number; height: number }, gap: number, margin: number): { x: number; y: number } {
  const fitsX = (x: number) => x >= margin && x + size.width <= view.width - margin;
  const clamp = (value: number, room: number) => Math.max(margin, Math.min(value, room - margin));
  const { anchor } = at;
  if (!anchor) {
    const x = at.centerX || at.centered ? (at.x ?? 0) - size.width / 2 : (at.x ?? 0);
    const y = at.centered ? (at.y ?? 0) - size.height / 2 : (at.y ?? 0);
    return { x: clamp(x, view.width - size.width), y: clamp(y, view.height - size.height) };
  }
  const [first, other] = at.end ? [anchor.right - size.width, anchor.left] : [anchor.left, anchor.right - size.width];
  const x = at.centerX ? (anchor.left + anchor.right - size.width) / 2 : fitsX(first) || !fitsX(other) ? first : other;
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - size.height;
  const y = below + size.height <= view.height - margin || above < margin ? below : above;
  return { x: clamp(x, view.width - size.width), y: clamp(y, view.height - size.height) };
}
