import { describe, expect, it } from "vitest";

/** The style guide's value sets (docs/conventions/style-guide.md); a value outside them fails. */
const FONT_SIZES = new Set(["11px", "11.5px", "12px", "12.5px", "13px", "13.5px", "14px", "15px", "17px", "18px", "20px", "0.85em"]);
const FONT_WEIGHTS = new Set(["450", "500", "600", "700"]);
const RADIUS = /^(0|50%|999px|var\(--radius-[sml]\)|calc\(var\(--radius-[sml]\) - [12]px\)|[0-3](\.5)?px)$/;
const HEX_ALLOWED = new Set(["#fff", "#000"]);

const files = import.meta.glob<string>("./*.css", { query: "?raw", import: "default", eager: true });
const sheets = Object.entries(files).map(([path, text]) => ({ name: path.slice(2), lines: text.split("\n") }));

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
  it("uses only the font sizes of the type scale", () => {
    const shorthand = declared("font").map((d) => ({ at: d.at, value: /(\d+(\.\d+)?(px|em))/.exec(d.value)?.[1] ?? "inherit" }));
    expect(outside((v) => FONT_SIZES.has(v) || v === "inherit", [...declared("font-size"), ...shorthand])).toEqual([]);
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

  it("keeps hex colors in tokens.css", () => {
    const hex = sheets
      .filter((sheet) => sheet.name !== "tokens.css")
      .flatMap((sheet) => sheet.lines.flatMap((line, i) => (line.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((value) => ({ at: `${sheet.name}:${i + 1}`, value }))));
    expect(outside((v) => HEX_ALLOWED.has(v), hex)).toEqual([]);
  });
});
