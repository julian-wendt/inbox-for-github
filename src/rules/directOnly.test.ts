import { describe, expect, it } from "vitest";
import type { Item } from "../model";
import { covers, directOnly, setCovered } from "./directOnly";

const scopes = { "octo-org": ["docs"] };

function pull(overrides: Partial<Item> = {}): Item {
  return {
    repo: "octo-org/docs",
    reasons: ["review", "involved"],
    reviewRequests: [{ reviewer: "team:docs", at: "2026-10-01T00:00:00Z" }],
    ...overrides,
  } as Item;
}

describe("directOnly", () => {
  it("drops the review reason when only a team was asked", () => {
    expect(directOnly(pull(), "me", scopes).reasons).toEqual(["involved"]);
  });

  it("keeps it when a request names the viewer", () => {
    const item = pull({ reviewRequests: [{ reviewer: "team:docs", at: "a" }, { reviewer: "Me", at: "b" }] });
    expect(directOnly(item, "me", scopes)).toBe(item);
  });

  it("leaves repos outside the scope alone", () => {
    const item = pull({ repo: "octo-org/app" });
    expect(directOnly(item, "me", scopes)).toBe(item);
  });

  it("leaves organizations without an entry alone", () => {
    const item = pull({ repo: "other/docs" });
    expect(directOnly(item, "me", scopes)).toBe(item);
  });

  it("changes nothing without a scope", () => {
    const item = pull();
    expect(directOnly(item, "me", {})).toBe(item);
  });
});

describe("setCovered", () => {
  it("starts an entry for an organization without one", () => {
    expect(setCovered("octo-org/docs", {}, true)).toEqual({ "octo-org": ["docs"] });
  });

  it("matches names case-insensitively and keeps the organization's spelling", () => {
    expect(covers("OCTO-org/Docs", scopes)).toBe(true);
    expect(setCovered("Octo-Org/app", scopes, true)).toEqual({ "octo-org": ["docs", "app"] });
  });

  it("removes a repo and the organization's entry once it is empty", () => {
    expect(setCovered("octo-org/docs", scopes, false)).toEqual({});
    expect(setCovered("octo-org/app", { "octo-org": ["docs", "app"] }, false)).toEqual({ "octo-org": ["docs"] });
  });

  it("returns the same object when the state already matches", () => {
    expect(setCovered("octo-org/docs", scopes, true)).toBe(scopes);
  });
});
