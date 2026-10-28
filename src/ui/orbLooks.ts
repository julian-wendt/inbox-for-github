import { LOOKS, preferredLook } from "./orb";

/** Stepping by a number coprime to `LOOKS` visits every look and lands far from the last one. */
const STRIDE = 7919;

/**
 * The first look at or after `start`, stepping through all looks, that nobody holds. When every
 * look is taken, the one at `start` is shared.
 *
 * @example
 *   freeLook(10, new Set([10, 11])); // 7929 % LOOKS, the next free one
 */
export function freeLook(start: number, taken: ReadonlySet<number>): number {
  let look = start % LOOKS;
  for (let tries = 0; tries < LOOKS; tries++) {
    if (!taken.has(look)) return look;
    look = (look + STRIDE) % LOOKS;
  }
  return start % LOOKS;
}

/**
 * Gives every login without a look one that no other login has. A login's own preferred look is
 * kept whenever it is free, so orbs stay as they were; the rest step to the next free look.
 *
 * @param logins   Everyone whose avatar shows an orb.
 * @param current  Login → look, as stored.
 * @returns        `current` itself when nobody is missing, so callers can tell nothing changed.
 *
 * @example
 *   assignLooks(["anna", "ben"], { anna: 12 }); // { anna: 12, ben: <a look other than 12> }
 */
export function assignLooks(logins: readonly string[], current: Record<string, number>): Record<string, number> {
  const missing = logins.filter((login) => current[login] === undefined);
  if (missing.length === 0) return current;
  const next = { ...current };
  const taken = new Set(Object.values(next));
  for (const login of [...missing].sort()) {
    const look = freeLook(preferredLook(login), taken);
    next[login] = look;
    taken.add(look);
  }
  return next;
}

function heldByOthers(login: string, current: Record<string, number>): Set<number> {
  return new Set(Object.entries(current).flatMap(([name, look]) => (name === login ? [] : [look])));
}

/**
 * Draws a new look for a login: any look that nobody else holds and that differs from its own.
 *
 * @param random  A number in [0, 1); `Math.random` unless a test passes its own.
 *
 * @example
 *   shuffleLook("anna", { anna: 12, ben: 40 }); // { anna: <not 12, not 40>, ben: 40 }
 */
export function shuffleLook(login: string, current: Record<string, number>, random: () => number = Math.random): Record<string, number> {
  const taken = heldByOthers(login, current);
  const choices = Array.from({ length: LOOKS }, (_, look) => look).filter((look) => look !== current[login] && !taken.has(look));
  if (choices.length === 0) return current;
  return { ...current, [login]: choices[Math.floor(random() * choices.length)] };
}

/**
 * Takes a login back to its first look, or to the next free one if someone else holds it now.
 *
 * @example
 *   resetLook("anna", { anna: 900, ben: 40 }); // { anna: preferredLook("anna"), ben: 40 }
 */
export function resetLook(login: string, current: Record<string, number>): Record<string, number> {
  return { ...current, [login]: freeLook(preferredLook(login), heldByOthers(login, current)) };
}
