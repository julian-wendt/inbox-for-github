/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";

/** One declaration with where it stands: its rule's selectors, and whether an at-rule wraps it. */
export interface Declaration {
  at: string;
  selectors: string[];
  conditional: boolean;
  property: string;
  value: string;
}

/**
 * The app's style sheets, read from disk for the style tests: Vitest blanks CSS imports.
 * `lines` serves the line-based checks, `declarations` the ones that need a rule's selector.
 *
 * Assumes plain CSS without nesting. `@media` and `@container` blocks count as `conditional`;
 * `@keyframes` and `@property` blocks are left out, they hold no element's style.
 *
 * @example
 *   const radius = sheets.flatMap((s) => s.declarations).filter((d) => d.selectors.includes(".btn") && d.property === "border-radius");
 */
export const sheets = readdirSync(new URL(".", import.meta.url))
  .filter((name) => name.endsWith(".css"))
  .map((name) => {
    const text = readFileSync(new URL(name, import.meta.url), "utf8");
    return { name, lines: text.split("\n"), declarations: declarations(name, text) };
  });

function declarations(name: string, text: string): Declaration[] {
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const lineAt = (index: number) => bare.slice(0, index).split("\n").length;
  const found: Declaration[] = [];
  const blocks: { selectors: string[] | null; conditional: boolean }[] = [];
  let start = 0;
  for (let i = 0; i < bare.length; i++) {
    const char = bare[i];
    if (char !== "{" && char !== "}" && char !== ";") continue;
    const chunk = bare.slice(start, i);
    const inside = blocks.at(-1);
    if (char === "{") {
      const prelude = chunk.trim();
      const conditional = !!inside?.conditional || /^@(media|container|supports)/.test(prelude);
      const skipped = /^@(keyframes|property)/.test(prelude) || inside?.selectors === null;
      const selectors = skipped ? null : prelude.startsWith("@") ? [] : prelude.split(",").map((s) => s.trim().replace(/\s+/g, " "));
      blocks.push({ selectors, conditional });
    } else if (inside?.selectors?.length && chunk.includes(":")) {
      const colon = chunk.indexOf(":");
      const offset = start + chunk.length - chunk.trimStart().length;
      found.push({ at: `${name}:${lineAt(offset)}`, selectors: inside.selectors, conditional: inside.conditional, property: chunk.slice(0, colon).trim(), value: chunk.slice(colon + 1).trim() });
    }
    if (char === "}") blocks.pop();
    start = i + 1;
  }
  return found;
}
