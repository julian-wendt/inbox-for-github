/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("motion", () => {
  it("takes every duration from motion.ts", () => {
    const dir = new URL("./parts/", import.meta.url);
    const own = readdirSync(dir)
      .filter((name) => name.endsWith(".tsx"))
      .filter((name) => /duration:\s*\d|ease:\s*\[/.test(readFileSync(new URL(name, dir), "utf8")));
    expect(own).toEqual([]);
  });
});
