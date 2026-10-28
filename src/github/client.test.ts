import { afterEach, describe, expect, it, vi } from "vitest";
import { graphql, lastBudget, missingScopes, pointsSpent, RateLimitError } from "./client";

describe("missingScopes", () => {
  it("lists the required scopes a token lacks", () => {
    expect(missingScopes(["repo", "read:org", "project", "gist"])).toEqual([]);
    expect(missingScopes(["repo"])).toEqual(["read:org", "project"]);
  });

  it("accepts broader scopes and unknown scope sets", () => {
    expect(missingScopes(["repo", "admin:org", "project"])).toEqual([]);
    expect(missingScopes(null)).toEqual([]);
  });
});

function respond(status: number, body: unknown, headers: Record<string, string>) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status, headers }))));
}

describe("graphql rate limits", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("records the budget from every response's headers", async () => {
    respond(200, { data: { ok: true } }, { "x-ratelimit-resource": "graphql", "x-ratelimit-remaining": "4908", "x-ratelimit-reset": "1792713930" });
    await graphql("t", "{ ok }");
    expect(lastBudget()).toEqual({ remaining: 4908, limit: 5000, resetAt: new Date(1792713930 * 1000) });
  });

  it("counts the points between responses of one window", async () => {
    const headers = (remaining: number) => ({ "x-ratelimit-resource": "graphql", "x-ratelimit-remaining": String(remaining), "x-ratelimit-reset": "1792713930" });
    respond(200, { data: {} }, headers(4900));
    await graphql("t", "{ ok }");
    const before = pointsSpent();
    respond(200, { data: {} }, headers(4882));
    await graphql("t", "{ ok }");
    expect(pointsSpent() - before).toBe(18);
  });

  it("waits until the hourly reset when the budget is used up", async () => {
    respond(200, { errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }] }, { "x-ratelimit-resource": "graphql", "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1792713930" });
    await expect(graphql("t", "{ ok }")).rejects.toEqual(new RateLimitError(new Date(1792713930 * 1000)));
  });

  it("follows retry-after for secondary limits", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    respond(403, { message: "You have exceeded a secondary rate limit" }, { "retry-after": "60" });
    const error = (await graphql("t", "{ ok }").catch((e: unknown) => e)) as RateLimitError;
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.until.getTime()).toBe(1_000_000 + 60_000);
    vi.restoreAllMocks();
  });

  it("leaves other errors as they are", async () => {
    respond(200, { errors: [{ message: "Could not resolve to a node" }] }, {});
    await expect(graphql("t", "{ ok }")).rejects.not.toBeInstanceOf(RateLimitError);
  });
});
