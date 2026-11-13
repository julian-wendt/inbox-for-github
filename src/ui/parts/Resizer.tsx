import type { PointerEvent } from "react";
import { t } from "../i18n";

interface Props {
  label: string;
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
}

/**
 * Drag handle on the right edge of a column.
 *
 * Dragging reports the new size: the start size plus the pointer's horizontal travel. A double
 * click resets it.
 * Must sit inside a positioned element, since it is placed with `position: absolute` over its edge.
 *
 * @example
 *   <Resizer label="Sidebar" width={widths.sidebar} onResize={(w) => resize("sidebar", w)} onReset={() => reset("sidebar")} />
 */
export function Resizer({ label, width, onResize, onReset }: Props) {
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const handle = event.currentTarget;
    const origin = event.clientX;
    handle.setPointerCapture(event.pointerId);
    document.documentElement.classList.add("resizing");

    const move = (e: globalThis.PointerEvent) => onResize(width + e.clientX - origin);
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      document.documentElement.classList.remove("resizing");
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("resizer.label", { pane: label })}
      aria-valuenow={width}
      title={t("resizer.hint")}
      onPointerDown={start}
      onDoubleClick={onReset}
    />
  );
}
