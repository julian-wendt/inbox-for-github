import { useRef } from "react";
import { padSegment, stepSegment, typeSegment, type Segment } from "../segments";

/** One part of a `SegmentField`: what it is called, what it holds and its range. */
export interface FieldPart {
  label: string;
  value: number;
  segment: Segment;
}

/**
 * A date or time field of our own, in fixed parts such as DD.MM.YYYY or HH:MM, since WebKit's
 * date and time inputs follow the system language's format (see docs/reference/local-development.md).
 * ↑/↓ step the focused part (⇧ by 10), ←/→ move between the parts, digits type a part and move
 * on once it is complete, Backspace sets it to its lowest value. Enter submits the surrounding
 * form; Tab moves on as usual.
 *
 * @param parts      The parts in display order.
 * @param separator  Shown between the parts, e.g. "." or ":".
 * @param label      The field's accessible name.
 * @param onChange   Called with the part's index and its new value on every change.
 * @param autoFocus  Focuses the first part on mount.
 *
 * @example
 *   <SegmentField
 *     label={t("snooze.time")}
 *     separator=":"
 *     parts={[{ label: t("snooze.hour"), value: 9, segment: HOURS }, { label: t("snooze.minute"), value: 0, segment: MINUTES }]}
 *     onChange={(i, v) => setPart(i, v)}
 *   />
 */
export function SegmentField({ parts, separator, label, onChange, autoFocus = false }: { parts: FieldPart[]; separator: string; label: string; onChange: (index: number, value: number) => void; autoFocus?: boolean }) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const typed = useRef("");
  const focus = (index: number) => inputs.current[Math.min(parts.length - 1, Math.max(0, index))]?.focus();

  const onKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { value, segment } = parts[index];
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      onChange(index, stepSegment(value, segment, (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1)));
      typed.current = "";
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      focus(index + (e.key === "ArrowLeft" ? -1 : 1));
    } else if (/^[0-9]$/.test(e.key)) {
      const next = typeSegment(typed.current, e.key, segment);
      onChange(index, next.value);
      typed.current = next.typed;
      if (next.done) focus(index + 1);
    } else if (e.key === "Enter") {
      e.currentTarget.form?.requestSubmit();
    } else if (e.key === "Backspace" || e.key === "Delete") {
      onChange(index, segment.min);
      typed.current = "";
    } else if (e.key.length !== 1 || e.metaKey) {
      return;
    }
    e.preventDefault();
  };

  return (
    <div className="segment-field" role="group" aria-label={label} onMouseDown={(e) => e.target === e.currentTarget && (e.preventDefault(), focus(0))}>
      {parts.map((part, index) => (
        <span key={part.label} className="segment-slot">
          {index > 0 && <span aria-hidden>{separator}</span>}
          <input
            ref={(node) => {
              inputs.current[index] = node;
            }}
            className="segment-part"
            style={{ width: `${part.segment.length + 0.4}ch` }}
            role="spinbutton"
            aria-label={part.label}
            aria-valuemin={part.segment.min}
            aria-valuemax={part.segment.max}
            aria-valuenow={part.value}
            value={padSegment(part.value, part.segment)}
            readOnly
            autoFocus={autoFocus && index === 0}
            onFocus={() => (typed.current = "")}
            onKeyDown={onKeyDown(index)}
          />
        </span>
      ))}
    </div>
  );
}
