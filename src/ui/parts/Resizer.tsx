import type { PointerEvent } from "react";
import { t } from "../i18n";

interface Props {
  label: string;
  /** "x" resizes the column to its left (the default), "y" the panel below, which grows upward. */
  axis?: "x" | "y";
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
}

/**
 * Drag handle on the right edge of a column, or with `axis="y"` on the top edge of a bottom panel.
 *
 * Dragging reports the new size: the start size plus the pointer's horizontal travel, or minus
 * its vertical travel, since dragging a top edge up enlarges the panel. A double click resets it.
 * Must sit inside a positioned element, since it is placed with `position: absolute` over its edge.
 *
 * @example
 *   <Resizer label="Sidebar" width={widths.sidebar} onResize={(w) => resize("sidebar", w)} onReset={() => reset("sidebar")} />
 */
export function Resizer({ label, axis = "x", width, onResize, onReset }: Props) {
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const handle = event.currentTarget;
    const origin = axis === "x" ? event.clientX : event.clientY;
    handle.setPointerCapture(event.pointerId);
    const classes = axis === "x" ? ["resizing"] : ["resizing", "rows"];
    document.documentElement.classList.add(...classes);

    const move = (e: globalThis.PointerEvent) => onResize(axis === "x" ? width + e.clientX - origin : width - (e.clientY - origin));
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      document.documentElement.classList.remove(...classes);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  return (
    <div
      className={`resizer${axis === "y" ? " row" : ""}`}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={t(axis === "x" ? "resizer.label" : "resizer.heightLabel", { pane: label })}
      aria-valuenow={width}
      title={t(axis === "x" ? "resizer.hint" : "resizer.heightHint")}
      onPointerDown={start}
      onDoubleClick={onReset}
    />
  );
}
