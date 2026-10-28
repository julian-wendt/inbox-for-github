import { useSyncExternalStore } from "react";

export type Kind = "photo" | "default";

const KEY = "avatar-kinds";
const kinds: Record<string, Kind> = readKinds();
let orbs = findOrbLogins();
const listeners = new Set<() => void>();

/**
 * What a login's avatar turned out to be, once decided: a real picture, or one of GitHub's
 * generated identicons (`default`, which the app shows as an orb). Kept per login on this Mac.
 *
 * @example
 *   kindOf("sara"); // "default", or undefined while not decided
 */
export function kindOf(login: string): Kind | undefined {
  return kinds[login];
}

/** Remembers what a login's avatar is, so the image is checked once. */
export function remember(login: string, kind: Kind) {
  kinds[login] = kind;
  orbs = findOrbLogins();
  listeners.forEach((listener) => listener());
  try {
    localStorage.setItem(KEY, JSON.stringify(kinds));
  } catch {
    // Not remembering is fine: the image is checked again next time.
  }
}

/**
 * The logins seen so far whose avatar is a generated identicon, so they show an orb. A new array
 * each time the list changes, so it can sit in a dependency list.
 *
 * @example
 *   const logins = useOrbLogins();
 */
export function useOrbLogins(): string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => orbs,
  );
}

function findOrbLogins(): string[] {
  return Object.entries(kinds).flatMap(([login, kind]) => (kind === "default" ? [login] : []));
}

function readKinds(): Record<string, Kind> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Kind>;
  } catch {
    return {};
  }
}
