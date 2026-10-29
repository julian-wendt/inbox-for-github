import type { Item } from "../model";

/** A full fetch at least this often; deltas miss changes that do not touch `updatedAt`, such as board status. */
export const FULL_EVERY_MS = 60 * 60_000;

/** Deltas start this much before the last fetch, so items GitHub's search indexes late are not missed. */
export const DELTA_OVERLAP_MS = 5 * 60_000;

/**
 * Merges a delta fetch into the items shown so far: every item in `changed` replaces its old
 * version (with the reasons the delta found), new ones are added, and the rest stays as it was.
 * Closed items drop out once they are older than `closedDays`, as a full fetch would leave them out.
 *
 * Items that stopped matching every search without changing (rare, e.g. a review request
 * withdrawn) stay until the next full fetch; see `FULL_EVERY_MS`.
 *
 * @param previous    The items shown before the delta.
 * @param changed     Items updated since the last fetch.
 * @param closedDays  The "closedDays" setting; 0 drops every closed item.
 * @param now         The current time, for the closed window.
 * @returns The merged items.
 *
 * @example
 *   mergeDelta(items, fresh, 7); // items with the fresh versions swapped in
 */
export function mergeDelta(previous: Item[], changed: Item[], closedDays: number, now = Date.now()): Item[] {
  const byId = new Map(previous.map((item) => [item.id, item]));
  for (const item of changed) byId.set(item.id, item);
  return withinClosedWindow([...byId.values()], closedDays, now);
}

/**
 * Finds the cached copies of issues that were transferred to another repository, where GitHub
 * gave them a new node id. A fetched issue that names `transferredFrom` matches the one cached
 * item in that repository with the same `createdAt` and title, as the transfer keeps both; a
 * cached item the fetch still returns under its own id is no stale copy and never matches.
 *
 * @param previous  The items cached before the fetch.
 * @param fetched   The items the fetch returned, full or delta.
 * @returns Old node id → new node id, for each transfer found; empty when there is none.
 *
 * @example
 *   findTransfers(cached, fresh); // Map { "I_old" => "I_new" } after octo-org/docs#42 moved to octo-org/portal#7
 */
export function findTransfers(previous: Item[], fetched: Item[]): Map<string, string> {
  const fetchedIds = new Set(fetched.map((item) => item.id));
  const moves = new Map<string, string>();
  for (const fresh of fetched) {
    if (!fresh.transferredFrom) continue;
    const candidates = previous.filter((old) => old.kind === "issue" && !fetchedIds.has(old.id) && old.repo === fresh.transferredFrom && old.createdAt === fresh.createdAt && old.title === fresh.title);
    if (candidates.length === 1) moves.set(candidates[0].id, fresh.id);
  }
  return moves;
}

/**
 * The cached issues that may be where items GitHub no longer resolves were transferred to: same
 * `createdAt` and title, in another repository. Loading them by id (cheap) shows whether they name
 * the old repository in `transferredFrom`, which a cache from before transfers were read lacks.
 *
 * @param cached  The cached items.
 * @param gone    Node ids GitHub answered with `NOT_FOUND`.
 * @returns The candidates' node ids; empty when none could be one.
 *
 * @example
 *   transferCandidates(items, ["I_old"]); // ["I_new"], the cached copy in octo-org/portal
 */
export function transferCandidates(cached: Item[], gone: string[]): string[] {
  const old = cached.filter((item) => item.kind === "issue" && gone.includes(item.id));
  return cached.filter((item) => item.kind === "issue" && !gone.includes(item.id) && old.some((o) => o.repo !== item.repo && o.createdAt === item.createdAt && o.title === item.title)).map((item) => item.id);
}

/**
 * Puts items loaded by id into the cached ones: each replaces its cached version, keeping the
 * reasons only a search knows ("review", "involved"), and the old copies of transferred issues
 * (`moves`) go. Items not cached are not added.
 *
 * @param cached  The cached items.
 * @param fresh   Items just loaded by node id (`fetchItem`, `fetchItemsById`).
 * @param moves   Old node id → new node id, from `findTransfers`.
 * @returns The cached items with the fresh versions swapped in.
 *
 * @example
 *   mergeReloaded(items, [fresh], new Map()); // items with `fresh` in place of its old version
 */
export function mergeReloaded(cached: Item[], fresh: Item[], moves: ReadonlyMap<string, string> = new Map()): Item[] {
  const byId = new Map(fresh.map((item) => [item.id, item]));
  return cached.flatMap((old) => {
    if (moves.has(old.id)) return [];
    const item = byId.get(old.id);
    return [item ? { ...item, reasons: [...old.reasons.filter((r) => r === "review" || r === "involved"), ...item.reasons] } : old];
  });
}

/**
 * Leaves out closed items older than `closedDays`; 0 leaves out every closed item. Open items stay.
 *
 * @example
 *   withinClosedWindow(items, 7); // open items and those closed in the last 7 days
 */
export function withinClosedWindow(items: Item[], closedDays: number, now = Date.now()): Item[] {
  const cutoff = now - closedDays * 86_400_000;
  return items.filter((item) => !item.closed || (closedDays > 0 && Date.parse(item.closed.at) >= cutoff));
}

/** What a cached fetch holds: closed items this many days back, board data, and the item limit used. */
export interface Coverage {
  closedDays: number;
  boards: boolean;
  maxItems: number;
}

/**
 * The cache's `scope`: who and which organizations it is for (`key`), and what it covers. Kept
 * apart so narrowing a setting filters the cache instead of making it look like another scope.
 *
 * @example
 *   encodeScope('[["octo-org"],"octocat"]', { closedDays: 7, boards: true, maxItems: 200 });
 */
export function encodeScope(key: string, coverage: Coverage): string {
  return JSON.stringify({ key, coverage });
}

/** Reads `encodeScope`'s value; null for anything else, such as a cache from before coverage was kept. */
export function decodeScope(scope: string | undefined): { key: string; coverage: Coverage } | null {
  try {
    const parsed = JSON.parse(scope ?? "") as { key?: unknown; coverage?: Partial<Coverage> };
    const c = parsed.coverage;
    if (typeof parsed.key !== "string" || typeof c?.closedDays !== "number" || typeof c.boards !== "boolean" || typeof c.maxItems !== "number") return null;
    return { key: parsed.key, coverage: { closedDays: c.closedDays, boards: c.boards, maxItems: c.maxItems } };
  } catch {
    return null;
  }
}

/**
 * Whether the cache holds enough for these settings: as many closed days and items or more.
 * Boards are not part of it; switching them on loads only the boards (see `withBoards`).
 */
export function covers(have: Coverage, want: Coverage): boolean {
  return have.closedDays >= want.closedDays && have.maxItems >= want.maxItems;
}

/**
 * Whether all the cache lacks for these settings is older closed items: the closed window grew
 * while the item limit did not. A refresh then searches only the added days (`closedBefore` in
 * `fetchItems`) instead of fetching everything; a higher limit has no such shortcut.
 *
 * @example
 *   widensClosed({ closedDays: 7, boards: true, maxItems: 200 }, { closedDays: 30, boards: true, maxItems: 200 }); // true
 */
export function widensClosed(have: Coverage, want: Coverage): boolean {
  return have.closedDays < want.closedDays && have.maxItems >= want.maxItems;
}

/**
 * Whether the next refresh may be a delta: there is an earlier fetch for the same settings
 * (`scope`), and its last full fetch is recent enough.
 *
 * @example
 *   canDelta({ scope: "a", fullAt: new Date() }, "a"); // true
 */
export function canDelta(last: { scope?: string; fullAt?: Date } | null, scope: string, now = Date.now()): boolean {
  return !!last?.fullAt && last.scope === scope && now - last.fullAt.getTime() < FULL_EVERY_MS;
}
