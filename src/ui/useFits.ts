import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Whether an element's content fits its box without being cut, kept up to date as the box
 * resizes. Meant for an element whose box does not follow its content (`flex: 1 1 0` with
 * `min-width: 0`), so hiding the content with `visibility` changes nothing that is measured.
 * The content is read once per mount; give the component a `key` when it changes.
 *
 * @returns A ref for the element, and whether its content fits; true until measured.
 *
 * @example
 *   const [crumb, fits] = useFits<HTMLSpanElement>();
 *   <span ref={crumb} className={fits ? "crumb" : "crumb hidden"}>octo-org/app / #7</span>
 */
export function useFits<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setFits(el.scrollWidth <= el.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  return [ref, fits];
}
