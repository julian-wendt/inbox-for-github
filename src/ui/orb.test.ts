import { describe, expect, it } from "vitest";
import { LETTER_ZONE, LOOKS, MIN_INITIAL_CONTRAST, PALETTES, accentReach, arrange, contrastRatio, grounds, initialColor, lookParts, orbStyle, preferredLook, rimPoint, toRgb } from "./orb";

describe("PALETTES", () => {
  it("lets the initial keep its contrast on every color and on every blend of two", () => {
    for (const palette of PALETTES) {
      const ink = toRgb(initialColor(palette));
      for (const ground of grounds(palette)) expect(contrastRatio(ink, ground), palette.join()).toBeGreaterThanOrEqual(MIN_INITIAL_CONTRAST);
    }
  });
});

describe("initialColor", () => {
  it("is white on dark palettes and dark on light ones", () => {
    expect(initialColor(["#7d5dc4", "#b04ebf", "#4c46b0"])).toBe("#ffffff");
    expect(initialColor(["#f2cc4a", "#f0a04b", "#c9d85a"])).toBe("#1c1c24");
  });
});

describe("accents", () => {
  it("never reach into the zone of the initial, at any angle", () => {
    for (let degrees = 0; degrees < 360; degrees++) expect(accentReach(degrees), `${degrees}°`).toBeLessThanOrEqual(0.5 - LETTER_ZONE);
  });

  it("sit on the rim and give about half of the logins an orb without one", () => {
    expect(rimPoint(0)).toEqual({ x: 1, y: 0.5 });
    const logins = Array.from({ length: 200 }, (_, i) => `user${i}`);
    const plain = logins.filter((login) => orbStyle(login)["--ca"] === "transparent").length;
    expect(plain).toBeGreaterThan(60);
    expect(plain).toBeLessThan(140);
  });
});

describe("arrange", () => {
  it("keeps the order of distinct colors", () => {
    expect(arrange(["#7d5dc4", "#b04ebf", "#4c46b0"])).toEqual(["#7d5dc4", "#b04ebf", "#4c46b0"]);
  });

  it("makes the lightest of alike colors the ground", () => {
    expect(arrange(["#4b8e68", "#347a7a", "#39634e"])).toEqual(["#347a7a", "#39634e", "#4b8e68"]);
  });
});

describe("looks", () => {
  it("number palette × slots and take apart into palette, accent and angle", () => {
    expect(LOOKS).toBe(PALETTES.length * 33);
    expect(lookParts(0)).toEqual({ palette: 0, accent: null, degrees: 0 });
    expect(lookParts(33 + 1)).toEqual({ palette: 1, accent: 0, degrees: 0 });
    expect(lookParts(33 + 1 + 4)).toEqual({ palette: 1, accent: 0, degrees: 45 });
  });

  it("are preferred deterministically, below LOOKS, and differ by seed", () => {
    expect(preferredLook("sara")).toBe(preferredLook("sara"));
    for (const login of ["anna", "ben", "sara"]) expect(preferredLook(login)).toBeLessThan(LOOKS);
    expect(new Set([0, 1, 2, 3, 4, 5].map((seed) => preferredLook("sara", seed))).size).toBeGreaterThan(4);
  });
});

describe("orbStyle", () => {
  it("is the same for the same login and look, and differs between logins", () => {
    expect(orbStyle("sara")).toEqual(orbStyle("sara"));
    expect(orbStyle("sara", preferredLook("sara"))).toEqual(orbStyle("sara"));
    expect(new Set(["anna", "ben", "carla", "david", "emma", "felix", "greta"].map((l) => orbStyle(l)["--c3"])).size).toBeGreaterThan(3);
  });

  it("draws another orb for another look", () => {
    const styles = [0, 40, 80, 120, 160, 200].map((look) => JSON.stringify(orbStyle("sara", look)));
    expect(new Set(styles).size).toBe(styles.length);
  });
});
