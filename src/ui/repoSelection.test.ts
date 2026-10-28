import { describe, expect, it } from "vitest";
import { pickRepo } from "./repoSelection";

describe("pickRepo", () => {
  it("picks one repo with a plain click and clears it with a second", () => {
    expect(pickRepo([], "o/a", false)).toEqual(["o/a"]);
    expect(pickRepo(["o/a", "o/b"], "o/c", false)).toEqual(["o/c"]);
    expect(pickRepo(["o/a"], "o/a", false)).toEqual([]);
  });

  it("adds and removes repos with ⌘-click", () => {
    expect(pickRepo(["o/a"], "o/b", true)).toEqual(["o/a", "o/b"]);
    expect(pickRepo(["o/a", "o/b"], "o/a", true)).toEqual(["o/b"]);
  });
});
