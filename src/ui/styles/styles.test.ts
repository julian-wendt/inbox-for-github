import { describe, expect, it } from "vitest";
import { sheets } from "./sheets";

/** The style guide's value sets (docs/conventions/style-guide.md); a value outside them fails. */
const FONT_SIZE = /^(var\(--fs-(xs|s|m|l|xl|2xl)\)|inherit|0\.85em)$/;
const FONT_WEIGHTS = new Set(["450", "500", "600", "700"]);
const RADIUS = /^(0|50%|999px|var\(--radius-[sml]\)|calc\(var\(--radius-[sml]\) - [12]px\)|[0-3](\.5)?px)$/;
const HEX_ALLOWED = new Set(["#fff", "#000"]);
const SPACES = new Set([0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48]);
const SIZES = new Set([0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 60, 64]);
const BORDER_WIDTHS = new Set(["1px", "1.5px", "3px"]);
const LINE_HEIGHTS = /^(1|1\.3|1\.5|1\.6|16px|18px|24px)$/;
const Z_LAYERS = new Set(["1", "2", "5", "25", "26", "30", "35", "40"]);
const OPACITIES = new Set(["0", "0.5", "1"]);
const LETTER_SPACINGS = new Set(["0.04em", "-0.012em", "normal", "0"]);

const all = sheets.flatMap((sheet) => sheet.declarations);
const outsideTokens = sheets.filter((sheet) => sheet.name !== "tokens.css").flatMap((sheet) => sheet.declarations);

/** Every declaration of the properties `property` matches, in all sheets. */
const declared = (property: string | RegExp) => all.filter((d) => (typeof property === "string" ? d.property === property : property.test(d.property)));

/** The declarations among `found` with a px number outside `allowed`, as "file:line value". */
const offScale = (allowed: Set<number>, found: { at: string; value: string }[]) =>
  found.filter((d) => [...d.value.matchAll(/(-?\d+(?:\.\d+)?)px/g)].some((m) => !allowed.has(Math.abs(Number(m[1]))))).map((d) => `${d.at} ${d.value}`);

const outside = (allowed: (value: string) => boolean, found: { at: string; value: string }[]) =>
  found.filter((d) => !allowed(d.value)).map((d) => `${d.at} ${d.value}`);

describe("style guide", () => {
  it("reads the sheets it checks", () => {
    expect(sheets.map((sheet) => sheet.name)).toEqual(expect.arrayContaining(["base.css", "shell.css", "tokens.css"]));
  });

  it("sizes text with the type scale's tokens", () => {
    const shorthand = declared("font").map((d) => ({ at: d.at, value: /var\(--fs-[a-z0-9]+\)|^inherit$/.exec(d.value)?.[0] ?? d.value }));
    expect(outside((v) => FONT_SIZE.test(v), [...declared("font-size"), ...shorthand])).toEqual([]);
  });

  it("uses only the four font weights", () => {
    const shorthand = declared("font").flatMap((d) => {
      const weight = /^(\d{3})\s/.exec(d.value)?.[1];
      return weight ? [{ at: d.at, value: weight }] : [];
    });
    expect(outside((v) => FONT_WEIGHTS.has(v), [...declared("font-weight"), ...shorthand])).toEqual([]);
  });

  it("rounds corners with the radius tokens, full rounding or a drawn mark's few pixels", () => {
    const corners = ["border-radius", "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius"];
    expect(outside((v) => RADIUS.test(v), corners.flatMap((p) => declared(p)))).toEqual([]);
  });

  it("spaces with the spacing scale", () => {
    expect(offScale(SPACES, declared(/^((gap|row-gap|column-gap|padding|margin)(-[a-z-]+)?|inset)$/))).toEqual([]);
  });

  it("sizes and places boxes with the size steps, and anything above 64px with a layout token", () => {
    const sizing = /^((min-|max-)?(width|height)|top|left|right|bottom|inset|translate|transform|flex-basis|grid-template-columns)$/;
    expect(offScale(SIZES, declared(sizing))).toEqual([]);
  });

  it("keeps custom properties with a px value in tokens.css", () => {
    expect(outsideTokens.filter((d) => d.property.startsWith("--") && /\d+px/.test(d.value)).map((d) => d.at)).toEqual([]);
  });

  it("draws borders 1px, or 1.5px for a drawn check and 3px for an edge", () => {
    const widths = declared(/^border(-(top|right|bottom|left))?(-width)?$/).flatMap((d) => {
      const width = /^(\d+(?:\.\d+)?px)/.exec(d.value)?.[1];
      return width ? [{ at: d.at, value: width }] : [];
    });
    expect(outside((v) => BORDER_WIDTHS.has(v), widths)).toEqual([]);
  });

  it("moves with the duration tokens on the app's curve", () => {
    const parts = declared("transition").flatMap((d) => d.value.split(/,\s*(?![^(]*\))/).map((part) => ({ at: d.at, value: part })));
    expect(outside((v) => /\svar\(--dur-(fade|move|slow)\) var\(--ease\)$/.test(v), parts)).toEqual([]);
  });

  it("uses the shadow tokens", () => {
    expect(outside((v) => v === "none" || !/rgb|hsl|#/.test(v), declared("box-shadow"))).toEqual([]);
  });

  it("keeps line heights, layers, opacities and letter spacing to their sets", () => {
    const shorthand = declared("font").flatMap((d) => {
      const height = /\/\s*([\d.]+(?:px)?)/.exec(d.value)?.[1];
      return height ? [{ at: d.at, value: height }] : [];
    });
    expect(outside((v) => LINE_HEIGHTS.test(v), [...declared("line-height"), ...shorthand])).toEqual([]);
    expect(outside((v) => Z_LAYERS.has(v), declared("z-index"))).toEqual([]);
    expect(outside((v) => OPACITIES.has(v), declared("opacity"))).toEqual([]);
    expect(outside((v) => LETTER_SPACINGS.has(v), declared("letter-spacing"))).toEqual([]);
  });

  it("mixes colors with the tint tokens, apart from the avatar placeholder's drawing", () => {
    const mixes = outsideTokens
      .filter((d) => !d.selectors.includes(".avatar-placeholder"))
      .flatMap((d) => [...d.value.matchAll(/color-mix\(([^()]|\([^()]*\))*\)/g)].flatMap((mix) => (mix[0].match(/(?<!\* )\b\d+(\.\d+)?%/g) ?? []).map((share) => `${d.at} ${share}`)));
    expect(mixes).toEqual([]);
  });

  it("keeps fractions of the window in tokens.css", () => {
    const fractions = sheets
      .filter((sheet) => sheet.name !== "tokens.css")
      .flatMap((sheet) => sheet.lines.flatMap((line, i) => (line.match(/\b(?!100[a-z])\d+(\.\d+)?[dsl]?v(h|w|min|max)\b/g) ?? []).map((value) => `${sheet.name}:${i + 1} ${value}`)));
    expect(fractions).toEqual([]);
  });

  it("hangs pop-ups --pop-gap from their control", () => {
    const placed = all.filter((d) => /^(top|right|bottom|left)$/.test(d.property) && d.value.startsWith("calc(100% +"));
    expect(placed.filter((d) => !d.value.includes("var(--pop-gap)")).map((d) => `${d.at} ${d.value}`)).toEqual([]);
  });

  it("keeps rgb() and hsl() colors in tokens.css", () => {
    const raw = sheets
      .filter((sheet) => sheet.name !== "tokens.css")
      .flatMap((sheet) => sheet.lines.flatMap((line, i) => (/\b(rgba?|hsla?)\(/.test(line) ? [`${sheet.name}:${i + 1}`] : [])));
    expect(raw).toEqual([]);
  });

  it("keeps hex colors in tokens.css", () => {
    const hex = sheets
      .filter((sheet) => sheet.name !== "tokens.css")
      .flatMap((sheet) => sheet.lines.flatMap((line, i) => (line.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((value) => ({ at: `${sheet.name}:${i + 1}`, value }))));
    expect(outside((v) => HEX_ALLOWED.has(v), hex)).toEqual([]);
  });
});
