import { describe, expect, it } from "vitest";
import { repoVisible } from "./repoFilter";

describe("repoVisible", () => {
  it("shows every repo of organizations without a filter", () => {
    expect(repoVisible("octo-org/app", {})).toBe(true);
    expect(repoVisible("octo-org/app", { other: { mode: "only", repos: [] } })).toBe(true);
  });

  it("hides the listed repos in all-except mode", () => {
    const filters = { "Octo-Org": { mode: "all-except" as const, repos: ["Docs"] } };
    expect(repoVisible("octo-org/docs", filters)).toBe(false);
    expect(repoVisible("octo-org/app", filters)).toBe(true);
  });

  it("shows only the listed repos in only mode", () => {
    const filters = { "octo-org": { mode: "only" as const, repos: ["app"] } };
    expect(repoVisible("octo-org/app", filters)).toBe(true);
    expect(repoVisible("octo-org/new-repo", filters)).toBe(false);
  });
});
