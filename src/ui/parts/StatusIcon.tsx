import type { Status } from "../../model";

/** A plain status ring; only its color tells the states apart (gray open, blue snoozed, green done). */
export function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden style={{ flex: "none" }}>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke={`var(--st-${status})`} strokeWidth="1.5" />
    </svg>
  );
}
