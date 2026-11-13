import { describe, expect, it, vi } from "vitest";
import type { RawItem } from "./fetch";

vi.mock("./client", async (importOriginal) => ({ ...(await importOriginal<typeof import("./client")>()), graphql: vi.fn() }));

function raw(n: number): RawItem {
  return {
    __typename: "Issue",
    id: `I_${n}`,
    number: n,
    title: `Issue ${n}`,
    url: `https://github.com/octo-org/app/issues/${n}`,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-05T00:00:00Z",
    body: "",
    author: { login: "alice" },
    repository: { nameWithOwner: "octo-org/app" },
    labels: { nodes: [] },
    assignees: { nodes: [] },
    comments: { nodes: [] },
  };
}

/**
 * A fresh `fetch.ts` over a GitHub whose searches each have `total` hits, and which answers a
 * page of up to `fits` hits and times out on a larger one, or fails every page with `failure`.
 * Fresh, because the page size `fetch.ts` learned lasts as long as the module.
 */
async function github({ total, fits, failure }: { total: number; fits: number; failure?: Error }) {
  vi.resetModules();
  const client = await import("./client");
  const { fetchItems } = await import("./fetch");
  let asked: { q: string; first: number }[] = [];
  const answer = (_token: string, _query: string, variables: Record<string, unknown> = {}) => {
    const first = variables.first as number;
    asked.push({ q: variables.q as string, first });
    if (failure) return Promise.reject(failure);
    if (first > fits) return Promise.reject(new client.TimeoutError());
    const start = Number(variables.after ?? 0);
    const end = Math.min(total, start + first);
    return Promise.resolve({ search: { issueCount: total, pageInfo: { hasNextPage: end < total, endCursor: String(end) }, nodes: Array.from({ length: end - start }, (_, i) => raw(start + i)) } });
  };
  vi.mocked(client.graphql).mockImplementation(answer);
  return {
    fetchItems,
    TimeoutError: client.TimeoutError,
    /** The page sizes asked of the search with `text` in it, in order; `forget` starts the list anew. */
    sizes: (text: string) => asked.filter((a) => a.q.includes(text)).map((a) => a.first),
    forget: () => (asked = []),
  };
}

describe("search pages GitHub times out", () => {
  it("asks such a page again at half the size, until one fits, and carries on from there", async () => {
    const { fetchItems, sizes } = await github({ total: 30, fits: 20 });
    const items = await fetchItems("t", ["octo-org"], { boards: false, limit: 50 });
    expect(items).toHaveLength(30);
    expect(sizes("involves:@me")).toEqual([50, 25, 13, 13, 13]);
    expect(sizes("review-requested:@me")).toEqual([50, 25, 13, 13, 13]);
  });

  it("starts the next delta at the size that worked, without the wait", async () => {
    const { fetchItems, sizes, forget } = await github({ total: 30, fits: 20 });
    await fetchItems("t", ["octo-org"], { boards: false, limit: 50 });
    forget();
    await fetchItems("t", ["octo-org"], { boards: false, limit: 50, since: new Date("2026-10-04T00:00:00Z") });
    expect(sizes("involves:@me")).toEqual([13, 13, 13]);
  });

  it("tries the full size again on the next full fetch", async () => {
    const { fetchItems, sizes, forget } = await github({ total: 30, fits: 20 });
    await fetchItems("t", ["octo-org"], { boards: false, limit: 50 });
    forget();
    await fetchItems("t", ["octo-org"], { boards: false, limit: 50 });
    expect(sizes("involves:@me")).toEqual([50, 25, 13, 13, 13]);
  });

  it("still reads up to the limit in the smaller pages", async () => {
    const { fetchItems, sizes } = await github({ total: 100, fits: 20 });
    const items = await fetchItems("t", ["octo-org"], { boards: false, limit: 50 });
    expect(sizes("involves:@me")).toEqual([50, 25, 13, 13, 13, 13]);
    expect(items).toHaveLength(52);
  });

  it("still reports a search cut short when its pages were asked again smaller", async () => {
    const { fetchItems } = await github({ total: 100, fits: 20 });
    const cut: string[] = [];
    await fetchItems("t", ["octo-org"], { boards: false, limit: 50, onCut: (q) => cut.push(q) });
    expect(cut).toHaveLength(2);
  });

  it("fails with the timeout once the smallest page gets no answer either", async () => {
    const { fetchItems, sizes, TimeoutError } = await github({ total: 30, fits: 0 });
    await expect(fetchItems("t", ["octo-org"], { boards: false, pageSize: 20 })).rejects.toBeInstanceOf(TimeoutError);
    expect(sizes("involves:@me")).toEqual([20, 10, 5]);
  });

  it("asks no second time when the request failed for another reason, such as no network", async () => {
    const { fetchItems, sizes } = await github({ total: 30, fits: 50, failure: new TypeError("Failed to fetch") });
    await expect(fetchItems("t", ["octo-org"], { boards: false })).rejects.toThrow("Failed to fetch");
    expect(sizes("involves:@me")).toEqual([50]);
  });
});
