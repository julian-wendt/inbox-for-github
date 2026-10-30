import { Circle, CircleCheck, RotateCw, type LucideIcon } from "lucide-react";
import type { Status } from "../../model";

const ICONS: Record<Status, LucideIcon> = { open: Circle, snoozed: RotateCw, done: CircleCheck };

/**
 * A status as an icon in its color: a gray ring for open, a purple circular arrow for a follow-up
 * (it comes back), a green check for done. Shape and color both tell the states apart, so neither alone carries it.
 *
 * @example
 *   <StatusIcon status="snoozed" size={13} />
 */
export function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  const Icon = ICONS[status];
  return <Icon size={size} strokeWidth={2.2} color={`var(--st-${status})`} aria-hidden style={{ flex: "none" }} />;
}
