import { describe, expect, it } from "vitest";
import { noteInput, recentInput } from "./inputTrail";

describe("inputTrail", () => {
  it("names the latest input for two seconds", () => {
    noteInput("click", 1000);
    noteInput("menu", 1100);
    expect(recentInput(1100)).toBe("menu");
    expect(recentInput(3100)).toBe("menu");
  });

  it("forgets an input after that", () => {
    noteInput("key:o", 1000);
    expect(recentInput(3101)).toBeNull();
  });
});
