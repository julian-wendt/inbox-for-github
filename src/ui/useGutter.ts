import { useLayoutEffect } from "react";

/**
 * Measures how wide a scroll area's scrollbar is and writes it as `--gutter` (in px) on `target`,
 * so CSS can take that much off the padding on the right: content keeps the same room on both
 * sides, and a header above can line up with it. WebKit ignores `scrollbar-gutter`, and overlay
 * scrollbars measure 0. Remeasures when the area resizes or is replaced.
 *
 * @param scroller  The element that scrolls; a function, as it may change between renders (a list
 *                  and its empty state).
 * @param target    Where to set the variable, e.g. the pane around header and list; the scroller
 *                  itself when left out.
 *
 * @example
 *   useGutter(() => scroll.current, () => section.current);
 *   // .assigned-scroll { padding-right: max(0px, calc(12px - var(--gutter, 0px))); }
 */
export function useGutter(scroller: () => HTMLElement | null, target?: () => HTMLElement | null): void {
  useLayoutEffect(() => {
    const el = scroller();
    const on = target?.() ?? el;
    if (!el || !on) return;
    const sync = () => on.style.setProperty("--gutter", `${el.offsetWidth - el.clientWidth}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  });
}
