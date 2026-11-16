/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sheets } from "./sheets";

/**
 * Holds the style guide's catalog to the CSS: for every block named by a selector, the first
 * value of its Height, Padding, Gap, Type, Color and Corner cells must be what its own rule sets.
 * A cell that names a part ("title `m`/600"), another block ("as dialog") or a variant in
 * parentheses is the reader's; only the leading value is checked. "a / b" pairs with the row's
 * selectors in order, "—" means the block sets no padding or gap.
 */
const guide = readFileSync(new URL("../../../docs/conventions/style-guide.md", import.meta.url), "utf8");
const catalog = guide.slice(guide.indexOf("## Catalog"), guide.indexOf("\n## ", guide.indexOf("## Catalog") + 1));

interface Row {
  selectors: string[];
  cells: Record<string, string>;
}

function rows(): Row[] {
  const found: Row[] = [];
  let head: string[] = [];
  for (const line of catalog.split("\n")) {
    if (!line.startsWith("|")) {
      head = [];
      continue;
    }
    const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
    if (!head.length) head = cells;
    else if (!/^-+$/.test(cells[0])) {
      const selectors = [...cells[0].matchAll(/`([.[][^`]*|kbd)`/g)].map((m) => m[1]);
      found.push({ selectors, cells: Object.fromEntries(head.map((name, i) => [name, cells[i]])) });
    }
  }
  return found;
}

/** The leading value of a cell for its row's n-th selector: before a comma or a parenthesis, and of "a / b" the n-th. */
function lead(cell = "", n: number): string {
  const first = cell.split(/, | \(/)[0].trim();
  const choices = first.split(" / ");
  return (choices[n] ?? choices[0]).trim();
}

const PX = (n: string) => (n === "0" ? "0" : `${n}px`);

/** What a leading value expects of the CSS, as property → value; null when the cell is prose. */
function expected(column: string, value: string): Record<string, string | null> | null {
  if (value === "" || value === "—") return value === "—" && ["Padding", "Gap"].includes(column) ? { [column.toLowerCase()]: null } : null;
  const token = /^`(--[\w-]+)`( min)?$/.exec(value);
  switch (column) {
    case "Height": {
      const box = /^(\d+) × (\d+)$/.exec(value);
      if (box) return { height: PX(box[1]), width: PX(box[2]) };
      const n = /^(\d+)( min)?$/.exec(value);
      if (n) return { [n[2] ? "min-height" : "height"]: PX(n[1]) };
      return token ? { [token[2] ? "min-height" : "height"]: `var(${token[1]})` } : null;
    }
    case "Padding":
    case "Gap": {
      const property = column.toLowerCase();
      if (/^\d+$/.test(value)) return { [property]: PX(value) };
      const code = /^`([^`]+)`$/.exec(value);
      return code ? { [property]: code[1] } : null;
    }
    case "Type": {
      const type = /^`(xs|s|m|l|xl|2xl)`(?:\/(\d{3}))?$/.exec(value);
      if (!type) return null;
      return { "font-size": `var(--fs-${type[1]})`, ...(type[2] ? { "font-weight": type[2] } : {}) };
    }
    case "Color":
      return token && !token[2] ? { color: `var(${token[1]})` } : null;
    case "Corner": {
      if (value === "full") return { "border-radius": "999px|50%" };
      const corner = /^`([sml])`$/.exec(value) ?? /^`([sml]) − (\d)px`$/.exec(value);
      if (!corner) return null;
      return { "border-radius": corner[2] ? `calc(var(--radius-${corner[1]}) - ${corner[2]}px)` : `var(--radius-${corner[1]})` };
    }
  }
  return null;
}

const order = [...sheets].sort((a, b) => Number(a.name === "base.css") - Number(b.name === "base.css"));
const body = { "font-size": "var(--fs-m)", "font-weight": "450", color: "var(--text)" } as Record<string, string | undefined>;

/** A layout token's own value, so a catalog's 30 matches `var(--control-h)`. */
const tokens = new Map(sheets.find((sheet) => sheet.name === "tokens.css")!.declarations.filter((d) => d.selectors.includes(":root")).map((d) => [`var(${d.property})`, d.value]));

/** The size or weight inside a `font` shorthand like `500 var(--fs-xs)/1 var(--font)`. */
function fromFont(value: string, property: string): string | undefined {
  return property === "font-size" ? /var\(--fs-[\w]+\)/.exec(value)?.[0] : /^\d{3}(?=\s)/.exec(value)?.[0];
}

/**
 * The value a block gets for a property, outside media and container queries: what its own rules
 * set last (base.css loads last), else what a variant like `.btn.primary` takes from `.btn`, else
 * for text what the body passes down.
 */
function actual(selector: string, property: string): string | undefined {
  const own = order
    .flatMap((sheet) => sheet.declarations)
    .filter((d) => !d.conditional && [property, ...(property.startsWith("font-") ? ["font"] : [])].includes(d.property) && d.selectors.includes(selector))
    .map((d) => (d.property === "font" ? fromFont(d.value, property) : d.value))
    .at(-1);
  const base = /^(\.[\w-]+)\.[\w-]+$/.exec(selector)?.[1] ?? /^\S+ (\S+)$/.exec(selector)?.[1];
  return own ?? (base ? actual(base, property) : body[property]);
}

/** Every value the catalog states for a block it names by selector, with what the CSS gives it. */
const checks = rows().flatMap((row) =>
  row.selectors.flatMap((selector, n) =>
    Object.keys(row.cells).flatMap((column) =>
      Object.entries(expected(column, lead(row.cells[column], n)) ?? {}).map(([property, want]) => {
        const own = actual(selector, property);
        const got = own === "inherit" ? body[property] : want && !want.startsWith("var(") && own ? (tokens.get(own) ?? own) : own;
        return { selector, property, want, got };
      }),
    ),
  ),
);

describe("style guide catalog", () => {
  it("states checkable values for most of its blocks", () => {
    expect(new Set(checks.map((c) => c.selector)).size).toBeGreaterThanOrEqual(61);
    expect(checks.length).toBeGreaterThanOrEqual(267);
  });

  it("matches the CSS for every block it names by selector", () => {
    const matches = ({ want, got }: (typeof checks)[number]) =>
      want === null ? got === undefined || got === "0" : new RegExp(`^(${want.replace(/[()$.*+?[\]\\]/g, "\\$&")})$`).test(got ?? "");
    expect(checks.filter((c) => !matches(c)).map((c) => `${c.selector} ${c.property}: catalog ${c.want ?? "none"}, CSS ${c.got ?? "none"}`)).toEqual([]);
  });
});
