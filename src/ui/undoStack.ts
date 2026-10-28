/** One change the viewer made, with what takes it back and what does it again. */
export interface Step {
  /** What the toast and the history say, e.g. "#5 → Done". */
  text: string;
  undo: () => void;
  redo: () => void;
}

/** The steps that can be taken back (`done`, oldest first) and those that were (`undone`, the next to redo last). */
export interface History {
  done: Step[];
  undone: Step[];
}

/** How many steps the history keeps; older ones fall off. */
export const HISTORY_LIMIT = 50;

export const EMPTY_HISTORY: History = { done: [], undone: [] };

/**
 * Adds a new change. Whatever had been taken back can no longer be redone, as in any editor.
 *
 * @example
 *   history = record(history, { text: "#5 → Done", undo, redo });
 */
export function record(history: History, step: Step, limit = HISTORY_LIMIT): History {
  return { done: [...history.done, step].slice(-limit), undone: [] };
}

/**
 * Takes back the newest `count` steps.
 *
 * @returns The new history and the steps to run `undo` on, newest first.
 *
 * @example
 *   const { history: next, steps } = takeBack(history, 2); // steps[0] is the newest change
 */
export function takeBack(history: History, count = 1): { history: History; steps: Step[] } {
  const steps = history.done.slice(-count).reverse();
  return { history: { done: history.done.slice(0, history.done.length - steps.length), undone: [...history.undone, ...steps] }, steps };
}

/**
 * Does the next `count` taken-back steps again, oldest first, as they happened.
 *
 * @returns The new history and the steps to run `redo` on, in that order.
 */
export function doAgain(history: History, count = 1): { history: History; steps: Step[] } {
  const steps = history.undone.slice(-count).reverse();
  return { history: { done: [...history.done, ...steps], undone: history.undone.slice(0, history.undone.length - steps.length) }, steps };
}

/**
 * The texts of the history for a list, nearest first: what ⌘Z would take back next, then before
 * it; and what ⌘Y would do next, then after it.
 *
 * @example
 *   texts(history); // { undo: ["#5 → Done", "#3 → Follow-up Mon 09:00"], redo: [] }
 */
export function texts(history: History): { undo: string[]; redo: string[] } {
  return { undo: history.done.map((s) => s.text).reverse(), redo: history.undone.map((s) => s.text).reverse() };
}
