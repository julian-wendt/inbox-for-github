import { describe, expect, it } from "vitest";
import { LOOKS, preferredLook } from "./orb";
import { assignLooks, freeLook, resetLook, shuffleLook } from "./orbLooks";

const people = Array.from({ length: 300 }, (_, i) => `person${i}`);

describe("freeLook", () => {
  it("keeps a free start and steps past taken looks", () => {
    expect(freeLook(10, new Set())).toBe(10);
    const next = freeLook(10, new Set([10]));
    expect(next).not.toBe(10);
    expect(next).toBeLessThan(LOOKS);
  });

  it("finds the last free look among almost all taken", () => {
    const taken = new Set(Array.from({ length: LOOKS }, (_, look) => look));
    taken.delete(777);
    expect(freeLook(3, taken)).toBe(777);
  });

  it("shares the start look when none is left", () => {
    expect(freeLook(5, new Set(Array.from({ length: LOOKS }, (_, look) => look)))).toBe(5);
  });
});

describe("assignLooks", () => {
  it("gives everyone a look of their own", () => {
    const looks = assignLooks(people, {});
    expect(Object.keys(looks)).toHaveLength(people.length);
    expect(new Set(Object.values(looks)).size).toBe(people.length);
  });

  it("keeps stored looks and returns the same object when nobody is missing", () => {
    const current = { anna: 12 };
    expect(assignLooks(["anna"], current)).toBe(current);
    expect(assignLooks(["anna", "ben"], current).anna).toBe(12);
  });

  it("gives a login its preferred look when that one is free", () => {
    expect(assignLooks(["sara"], {}).sara).toBe(preferredLook("sara"));
  });

  it("carries over an earlier shuffle by its seed", () => {
    expect(assignLooks(["sara"], {}, { sara: 2 }).sara).toBe(preferredLook("sara", 2));
  });

  it("moves a login off a look somebody holds", () => {
    const held = preferredLook("sara");
    const looks = assignLooks(["sara"], { anna: held });
    expect(looks.sara).not.toBe(held);
  });
});

describe("shuffleLook", () => {
  it("draws a look that is neither the login's own nor anyone else's", () => {
    const current = assignLooks(people, {});
    for (const random of [0, 0.3, 0.999]) {
      const next = shuffleLook("person0", current, () => random);
      expect(next.person0).not.toBe(current.person0);
      expect(Object.values(current).filter((look) => look === next.person0)).toHaveLength(0);
      expect({ ...next, person0: 0 }).toEqual({ ...current, person0: 0 });
    }
  });
});

describe("resetLook", () => {
  it("returns to the preferred look, or to a free one if it is held", () => {
    expect(resetLook("sara", { sara: 5 }).sara).toBe(preferredLook("sara"));
    expect(resetLook("sara", { sara: 5, anna: preferredLook("sara") }).sara).not.toBe(preferredLook("sara"));
  });
});
