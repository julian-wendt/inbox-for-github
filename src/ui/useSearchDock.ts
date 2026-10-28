import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";

const SLIDE_MS = 160;
const SLIDE_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * Slides a docked search bar in and out. The layout changes at once and only a transform
 * moves the bar and what sits below it, so nothing is measured per frame. The container starts
 * shifted up by the bar's height, behind the header, and glides down; closing runs the same
 * the other way, and the bar leaves the layout only when the slide is done.
 *
 * Put the returned `body` around the bar (a `.search-dock`) and the content below it, render the
 * bar while `shown` is true, and switch off any layout animation of the content while `moving`
 * is true, or it animates the shift a second time.
 *
 * @param open  Whether the search is open.
 * @returns     `body`: the container to move; `shown`: the bar is in the layout (also while it
 *              slides out); `moving`: a slide is running.
 *
 * @example
 *   const { body, shown, moving } = useSearchDock(search !== null);
 *   // <div className="dock-body" ref={body}>{shown && <SearchField … />}{content}</div>
 */
export function useSearchDock(open: boolean): { body: RefObject<HTMLDivElement | null>; shown: boolean; moving: boolean } {
  const body = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [moving, setMoving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setShown(true);
      setMoving(true);
    }
  }
  useLayoutEffect(() => {
    const dock = body.current?.querySelector<HTMLElement>(".search-dock");
    if (!body.current || !dock) return;
    const hidden = `translateY(-${dock.offsetHeight}px)`;
    const slide = body.current.animate([{ transform: open ? hidden : "none" }, { transform: open ? "none" : hidden }], { duration: SLIDE_MS, easing: SLIDE_EASE, fill: "forwards" });
    slide.onfinish = () => {
      if (!open) flushSync(() => setShown(false));
      slide.cancel();
      setMoving(false);
    };
    return () => slide.cancel();
  }, [open, shown]);
  return { body, shown, moving };
}
