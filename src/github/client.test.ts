import { afterEach, describe, expect, it, vi } from "vitest";
import { graphql, lastBudget, missingScopes, pointsSpent, RateLimitError, TimeoutError } from "./client";

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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it("counts only the growth of each window when GitHub answers from two in turn", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const headers = (remaining: number, reset: number) => ({ "x-ratelimit-resource": "graphql", "x-ratelimit-remaining": String(remaining), "x-ratelimit-reset": String(reset) });
    respond(200, { data: {} }, headers(4900, 1_800_000_600));
    await graphql("t", "{ ok }");
    const before = pointsSpent();
    for (const [remaining, reset] of [[3000, 1_800_001_200], [4880, 1_800_000_600], [2990, 1_800_001_200]]) {
      respond(200, { data: {} }, headers(remaining, reset));
      await graphql("t", "{ ok }");
    }
    expect(pointsSpent() - before).toBe(30);
  });

  it("counts what a new hour used so far once the old one has reset", async () => {
    const headers = (remaining: number, reset: number) => ({ "x-ratelimit-resource": "graphql", "x-ratelimit-remaining": String(remaining), "x-ratelimit-reset": String(reset) });
    vi.spyOn(Date, "now").mockReturnValue(1_900_000_000_000);
    respond(200, { data: {} }, headers(4900, 1_900_000_600));
    await graphql("t", "{ ok }");
    const before = pointsSpent();
    vi.spyOn(Date, "now").mockReturnValue(1_900_000_700_000);
    respond(200, { data: {} }, headers(4990, 1_900_004_200));
    await graphql("t", "{ ok }");
    expect(pointsSpent() - before).toBe(10);
  });

  it("reports the window with less left while two run", async () => {
    const headers = (remaining: number, reset: number) => ({ "x-ratelimit-resource": "graphql", "x-ratelimit-remaining": String(remaining), "x-ratelimit-reset": String(reset) });
    vi.spyOn(Date, "now").mockReturnValue(2_200_000_000_000);
    for (const [remaining, reset] of [[3000, 2_200_000_660], [4880, 2_200_000_600]]) {
      respond(200, { data: {} }, headers(remaining, reset));
      await graphql("t", "{ ok }");
    }
    expect(lastBudget()).toEqual({ remaining: 3000, limit: 5000, resetAt: new Date(2_200_000_660 * 1000) });
  });

  it("takes no second window for a new hour when the local clock runs ahead", async () => {
    const headers = (remaining: number, reset: number) => ({ "x-ratelimit-resource": "graphql", "x-ratelimit-remaining": String(remaining), "x-ratelimit-reset": String(reset) });
    vi.spyOn(Date, "now").mockReturnValue(2_000_000_300_000);
    respond(200, { data: {} }, headers(4900, 2_000_000_000));
    await graphql("t", "{ ok }");
    const before = pointsSpent();
    for (const [remaining, reset] of [[3000, 2_000_000_060], [4880, 2_000_000_000], [2990, 2_000_000_060]]) {
      respond(200, { data: {} }, headers(remaining, reset));
      await graphql("t", "{ ok }");
    }
    expect(pointsSpent() - before).toBe(30);
  });

  it("skips a response without a remaining count", async () => {
    const reset = { "x-ratelimit-resource": "graphql", "x-ratelimit-reset": "2100000000" };
    respond(200, { data: {} }, { ...reset, "x-ratelimit-remaining": "4900" });
    await graphql("t", "{ ok }");
    respond(200, { data: {} }, reset);
    await graphql("t", "{ ok }");
    const before = pointsSpent();
    respond(200, { data: {} }, { ...reset, "x-ratelimit-remaining": "4890" });
    await graphql("t", "{ ok }");
    expect(pointsSpent() - before).toBe(10);
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

  it("returns the data for ids that no longer resolve only when asked to", async () => {
    const gone = { data: { node: null }, errors: [{ type: "NOT_FOUND", message: "Could not resolve to a node with the global id of 'I_old'" }] };
    respond(200, gone, {});
    await expect(graphql("t", "{ node }", {}, undefined, { allowNotFound: true })).resolves.toEqual({ node: null });
    respond(200, gone, {});
    await expect(graphql("t", "{ node }")).rejects.toThrow("Could not resolve");
    respond(200, { data: { node: null }, errors: [...gone.errors, { type: "FORBIDDEN", message: "Resource not accessible" }] }, {});
    await expect(graphql("t", "{ node }", {}, undefined, { allowNotFound: true })).rejects.toThrow("Resource not accessible");
  });
});

describe("graphql timeouts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The request starts at 0 and fails or answers `ms` later. */
  const after = (ms: number) => vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(ms);
  const unreachable = () => vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));

  it("takes a fetch that fails after GitHub's ten seconds as its timeout, which the web view cannot read", async () => {
    unreachable();
    after(10_500);
    await expect(graphql("t", "{ ok }")).rejects.toBeInstanceOf(TimeoutError);
  });

  it("leaves a fetch that fails at once as it is: no network", async () => {
    unreachable();
    after(40);
    const error = await graphql("t", "{ ok }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(TimeoutError);
  });

  it("leaves a fetch that fails long after the ten seconds as it is: a Mac that slept, a network lost", async () => {
    unreachable();
    after(60_000);
    const error = await graphql("t", "{ ok }").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(TimeoutError);
  });

  it("leaves a stopped request as it is, however late", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new DOMException("signal is aborted without reason", "AbortError"))));
    after(10_500);
    await expect(graphql("t", "{ ok }")).rejects.toThrow("aborted");
  });

  it("takes a late 502 as the timeout where its status can be read, and an early one as an error", async () => {
    respond(502, "<html>502 Bad Gateway</html>", {});
    after(10_500);
    await expect(graphql("t", "{ ok }")).rejects.toBeInstanceOf(TimeoutError);
    vi.restoreAllMocks();
    respond(502, "<html>502 Bad Gateway</html>", {});
    after(40);
    await expect(graphql("t", "{ ok }")).rejects.toThrow("GitHub API 502");
  });
});
