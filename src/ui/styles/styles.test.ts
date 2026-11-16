/// <reference types="node" />
// Vitest blanks CSS imports, so the sheets are read from disk.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The style guide's value sets (docs/conventions/style-guide.md); a value outside them fails. */
const FONT_SIZE = /^(var\(--fs-(xs|s|m|l|xl|2xl)\)|inherit|0\.85em)$/;
const FONT_WEIGHTS = new Set(["450", "500", "600", "700"]);
const RADIUS = /^(0|50%|999px|var\(--radius-[sml]\)|calc\(var\(--radius-[sml]\) - [12]px\)|[0-3](\.5)?px)$/;
const HEX_ALLOWED = new Set(["#fff", "#000"]);
const SPACES = new Set([0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48]);
const LINE_HEIGHTS = /^(1|1\.3|1\.5|1\.6|\d+px)$/;
const Z_LAYERS = new Set(["1", "2", "5", "25", "26", "30", "35", "40"]);
const OPACITIES = new Set(["0", "0.5", "1"]);
const LETTER_SPACINGS = new Set(["0.04em", "-0.012em", "normal", "0"]);

const dir = new URL(".", import.meta.url);
const sheets = readdirSync(dir)
  .filter((name) => name.endsWith(".css"))
  .map((name) => ({ name, lines: readFileSync(new URL(name, dir), "utf8").split("\n") }));

/** Every `property: value` of the given property in all sheets, as "file:line value". */
function declared(property: string): { at: string; value: string }[] {
  const pattern = new RegExp(`^\\s*${property}:\\s*([^;]+);`);
  return sheets.flatMap((sheet) =>
    sheet.lines.flatMap((line, i) => {
      const match = pattern.exec(line);
      return match ? [{ at: `${sheet.name}:${i + 1}`, value: match[1].trim() }] : [];
    }),
  );
}

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
    const spacing = /^\s*((gap|row-gap|column-gap|padding|margin)(-[a-z-]+)?|inset):\s*([^;]+);/;
    const off = sheets.flatMap((sheet) =>
      sheet.lines.flatMap((line, i) => {
        const value = spacing.exec(line)?.[4] ?? "";
        const bad = [...value.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => Math.abs(Number(m[1]))).filter((n) => !SPACES.has(n));
        return bad.length ? [`${sheet.name}:${i + 1} ${value}`] : [];
      }),
    );
    expect(off).toEqual([]);
  });

  it("moves with the duration tokens on the app's curve", () => {
    const parts = declared("transition").flatMap((d) => d.value.split(/,\s*(?![^(]*\))/).map((part) => ({ at: d.at, value: part })));
    expect(outside((v) => /\svar\(--dur-(fade|move|slow)\) var\(--ease\)$/.test(v), parts)).toEqual([]);
  });

  it("uses the shadow tokens", () => {
    expect(outside((v) => v === "none" || !/rgb|hsl|#/.test(v), declared("box-shadow"))).toEqual([]);
  });

  it("keeps line heights, layers, opacities and letter spacing to their sets", () => {
    expect(outside((v) => LINE_HEIGHTS.test(v), declared("line-height"))).toEqual([]);
    expect(outside((v) => Z_LAYERS.has(v), declared("z-index"))).toEqual([]);
    expect(outside((v) => OPACITIES.has(v), declared("opacity"))).toEqual([]);
    expect(outside((v) => LETTER_SPACINGS.has(v), declared("letter-spacing"))).toEqual([]);
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
