/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The component side of docs/conventions/style-guide.md: icon sizes, strokes and motion. */
const ICON_SIZES = new Set(["12", "14", "16", "20"]);
const AVATAR_SIZES = new Set(["18", "20", "28", "34"]);
const STROKES = new Set(["1.75", "2.2"]);

const dir = new URL("./parts/", import.meta.url);
const parts = readdirSync(dir)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => ({ name, text: readFileSync(new URL(name, dir), "utf8") }));

/** Every match of `pattern` in the components, as "file value" for the first group. */
const found = (pattern: RegExp) => parts.flatMap(({ name, text }) => [...text.matchAll(pattern)].map((m) => ({ name, value: m[1] })));

describe("components", () => {
  it("reads the components it checks", () => {
    expect(parts.length).toBeGreaterThan(20);
  });

  it("size icons and avatars from their sets", () => {
    const icons = found(/<(?!Avatar\b)[A-Z]\w*\b[^>]*?\bsize=\{(\d+(?:\.\d+)?)\}/g);
    const avatars = found(/<Avatar\b[^>]*?\bsize=\{(\d+(?:\.\d+)?)\}/g);
    expect(icons.filter((i) => !ICON_SIZES.has(i.value)).map((i) => `${i.name} ${i.value}`)).toEqual([]);
    expect(avatars.filter((a) => !AVATAR_SIZES.has(a.value)).map((a) => `${a.name} ${a.value}`)).toEqual([]);
  });

  it("draw icons with the default stroke or one of the two others", () => {
    expect(found(/strokeWidth=\{(\d+(?:\.\d+)?)\}/g).filter((s) => !STROKES.has(s.value)).map((s) => `${s.name} ${s.value}`)).toEqual([]);
  });

  it("take every duration from motion.ts", () => {
    expect(parts.filter(({ text }) => /duration:\s*\d|ease:\s*\[/.test(text)).map((p) => p.name)).toEqual([]);
  });
});
