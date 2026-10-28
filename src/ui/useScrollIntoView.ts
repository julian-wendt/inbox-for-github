import { useEffect, useRef, type RefObject } from "react";

/**
 * A ref for a row that scrolls into view when it becomes selected, and only then. A ref callback
 * written inline runs again on every render, which would pull the list back to the selection
 * whenever anything above re-rendered.
 *
 * @param selected  Whether the row is the selected one.
 * @returns The ref to put on the row's element.
 *
 * @example
 *   const ref = useScrollIntoView<HTMLLIElement>(selected);
 *   return <li ref={ref} />;
 */
export function useScrollIntoView<T extends HTMLElement>(selected: boolean): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return ref;
}

/**
 * Scrolls the group bar named `bar` into view when it becomes the selected one. The bar carries
 * `data-bar` with its name and sits inside `container`. For bars drawn in a loop, where a hook per
 * bar is not possible.
 *
 * @param container  The element holding the bars.
 * @param bar        The selected bar's name, or null.
 *
 * @example
 *   useScrollToBar(list, selectedGroup); // <button data-bar={group} />
 */
export function useScrollToBar(container: RefObject<HTMLElement | null>, bar: string | null): void {
  useEffect(() => {
    if (bar) container.current?.querySelector(`[data-bar="${CSS.escape(bar)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [container, bar]);
}
