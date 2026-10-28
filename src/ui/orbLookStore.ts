import { useSyncExternalStore } from "react";

let looks: Record<string, number> = {};
const listeners = new Set<() => void>();

/**
 * Hands every login's orb look (`Settings.orbLooks`) to the avatars on screen. The app calls it
 * whenever the settings change; avatars of the logins concerned draw again.
 *
 * @example
 *   setOrbLooks({ sara: 412 });
 */
export function setOrbLooks(next: Record<string, number>) {
  if (next === looks) return;
  looks = next;
  listeners.forEach((listener) => listener());
}

/**
 * A login's orb look, or undefined while none is stored yet (the avatar then uses the login's
 * preferred look).
 *
 * @example
 *   const look = useOrbLook("sara");
 */
export function useOrbLook(login: string): number | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => looks[login],
  );
}
