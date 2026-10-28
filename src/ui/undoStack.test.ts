import { describe, expect, it } from "vitest";
import { EMPTY_HISTORY, doAgain, record, takeBack, texts, type Step } from "./undoStack";

const step = (text: string): Step => ({ text, undo: () => undefined, redo: () => undefined });
const recorded = (...names: string[]) => names.reduce((history, name) => record(history, step(name)), EMPTY_HISTORY);

describe("the undo history", () => {
  it("takes back the newest change first, one at a time, and goes on back through the chain", () => {
    let history = recorded("a", "b", "c");

    const first = takeBack(history);
    history = first.history;
    const second = takeBack(history);

    expect(first.steps.map((s) => s.text)).toEqual(["c"]);
    expect(second.steps.map((s) => s.text)).toEqual(["b"]);
    expect(texts(second.history)).toEqual({ undo: ["a"], redo: ["b", "c"] });
  });

  it("does the taken-back changes again in the order they happened", () => {
    const back = takeBack(recorded("a", "b", "c"), 3).history;

    const again = doAgain(back, 2);

    expect(again.steps.map((s) => s.text)).toEqual(["a", "b"]);
    expect(texts(again.history)).toEqual({ undo: ["b", "a"], redo: ["c"] });
  });

  it("takes several back at once for a pick from the history, newest first", () => {
    const { steps, history } = takeBack(recorded("a", "b", "c", "d"), 3);

    expect(steps.map((s) => s.text)).toEqual(["d", "c", "b"]);
    expect(texts(history)).toEqual({ undo: ["a"], redo: ["b", "c", "d"] });
  });

  it("forgets what could be redone once something new happens", () => {
    const back = takeBack(recorded("a", "b"), 1).history;

    const next = record(back, step("c"));

    expect(texts(next)).toEqual({ undo: ["c", "a"], redo: [] });
  });

  it("does nothing on an empty history and never takes back more than there is", () => {
    expect(takeBack(EMPTY_HISTORY).steps).toEqual([]);
    expect(doAgain(EMPTY_HISTORY).steps).toEqual([]);
    expect(takeBack(recorded("a"), 5).steps.map((s) => s.text)).toEqual(["a"]);
    expect(doAgain(takeBack(recorded("a"), 1).history, 5).steps.map((s) => s.text)).toEqual(["a"]);
  });

  it("keeps the newest fifty", () => {
    const names = Array.from({ length: 60 }, (_, i) => `s${i}`);

    const { done } = recorded(...names);

    expect(done).toHaveLength(50);
    expect(done[0].text).toBe("s10");
    expect(done.at(-1)?.text).toBe("s59");
  });
});
