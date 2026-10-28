let tail: Promise<void> = Promise.resolve();

/**
 * Runs writes to GitHub one after another, in the order they were asked for, while the app
 * already shows their outcome. A failed write does not hold up the ones behind it; the caller
 * handles its own failure.
 *
 * @param write  The request, e.g. `() => assignSelf(token, id).then(apply)`.
 * @returns When this write has run, with its outcome.
 *
 * @example
 *   void queueWrite(() => assignSelf(token, item.id).then(show, putBack));
 */
export function queueWrite(write: () => Promise<void>): Promise<void> {
  const run = tail.then(write);
  tail = run.catch(() => undefined);
  return run;
}
