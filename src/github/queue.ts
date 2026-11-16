let tail: Promise<void> = Promise.resolve();

/**
 * Runs writes to GitHub one after another, in the order they were asked for, while the app
 * already shows their outcome. A failed write does not hold up the ones behind it; the caller
 * handles its own failure.
 *
 * @param write  The request, e.g. `() => assignSelf(token, id)`.
 * @returns The write's outcome once it has run: its answer, or its failure.
 *
 * @example
 *   queueWrite(() => assignSelf(token, item.id)).then(show, putBack);
 */
export function queueWrite<T>(write: () => Promise<T>): Promise<T> {
  const run = tail.then(write);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
