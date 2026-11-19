import { log } from "../log";

const ENDPOINT = "https://api.github.com/graphql";

/** GitHub refused because a rate limit is used up; `until` is when it allows queries again. */
export class RateLimitError extends Error {
  constructor(readonly until: Date) {
    super(`GitHub rate limit reached until ${until.toISOString()}`);
  }
}

/**
 * GitHub dropped the request after its ten seconds (see "Timeouts" in
 * `docs/reference/github-api.md`); asking for less at once may get an answer.
 */
export class TimeoutError extends Error {
  constructor() {
    super("GitHub gave no answer within its ten seconds");
  }
}

/** GitHub's timeout fails 10.5 to 11 s after sending; a missing network at once, a sleeping Mac much later. */
const GAVE_UP_MS = 9_000;
const GAVE_UP_UNTIL_MS = 20_000;

let latestBudget: Budget | null = null;
let spent = 0;
/** Reset time (ms) → the lowest `remaining` seen in that window; GitHub can answer from two windows in turn. */
const windows = new Map<number, number>();
const HOUR_MS = 3_600_000;

/**
 * GraphQL points this app has used since it started, as far as the headers show: per hourly
 * window, the drop in `remaining` between its responses, and on a new hour what that hour used
 * so far. A second window GitHub answers from while the first still runs counts only its drops,
 * since what it used before is not this app's.
 * Compare two readings to get the cost of what ran in between.
 */
export function pointsSpent(): number {
  return spent;
}

/**
 * The GraphQL budget as the responses' `x-ratelimit-*` headers show it; free. While GitHub
 * answers from two windows that both still run, the one with less left, so the usage ring does
 * not jump between them and the pause at a low budget comes sooner rather than later.
 */
export function lastBudget(now = Date.now()): Budget | null {
  const running = [...windows].filter(([at]) => at > now);
  if (!latestBudget || running.length < 2) return latestBudget;
  const [at, remaining] = running.reduce((tightest, next) => (next[1] < tightest[1] ? next : tightest));
  return { remaining, limit: latestBudget.limit, resetAt: new Date(at) };
}

function noteHeaders(headers: Headers): void {
  const remaining = Number(headers.get("x-ratelimit-remaining") ?? NaN);
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (headers.get("x-ratelimit-resource") !== "graphql" || !reset || !Number.isFinite(remaining)) return;
  const limit = Number(headers.get("x-ratelimit-limit")) || 5000;
  const resetAt = new Date(reset * 1000);
  const lowest = windows.get(resetAt.getTime());
  // GitHub's own times, not the local clock: a window opened after the others ended resets an hour after them.
  const newHour = [...windows.keys()].every((at) => resetAt.getTime() >= at + HOUR_MS);
  if (lowest !== undefined) spent += Math.max(0, lowest - remaining);
  else if (latestBudget && newHour) spent += limit - remaining;
  windows.set(resetAt.getTime(), Math.min(lowest ?? remaining, remaining));
  for (const at of windows.keys()) if (resetAt.getTime() >= at + HOUR_MS) windows.delete(at);
  latestBudget = { remaining, limit, resetAt };
}

/**
 * When to retry after a refusal: `retry-after` seconds for secondary limits, else the reset of
 * the used-up hourly budget, else one minute. Null when the response is no rate-limit refusal.
 */
function refusedUntil(response: Response, messages: string[], now = Date.now()): Date | null {
  const limited = response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") || messages.some((m) => /rate limit/i.test(m));
  if (!limited) return null;
  const retryAfter = Number(response.headers.get("retry-after"));
  if (retryAfter) return new Date(now + retryAfter * 1000);
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  return reset ? new Date(reset * 1000) : new Date(now + 60_000);
}

/**
 * Runs a GraphQL query against the GitHub API.
 *
 * @param token  A GitHub token with the `REQUIRED_SCOPES`, e.g. from `gh auth token`.
 * @param query  The GraphQL document.
 * @param variables  Values for the document's variables.
 * @param signal     Aborts the request, e.g. when the viewer stops a refresh.
 * @param options.allowNotFound  Returns `data` when every error is GitHub's `NOT_FOUND`, which
 *                   answers a node id that no longer resolves with `null` in its place.
 * @returns The `data` member of the response.
 * Every response updates `lastBudget()` from its rate-limit headers.
 *
 * @throws RateLimitError when GitHub refuses for a rate limit, with the time it allows queries again.
 * @throws TimeoutError when GitHub dropped the request after its ten seconds.
 * @throws Error with GitHub's messages when the HTTP call fails or the response carries `errors`.
 *
 * @example
 *   const { viewer } = await graphql<{ viewer: { login: string } }>(token, "{ viewer { login } }");
 */
export async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
  signal?: AbortSignal,
  { allowNotFound = false }: { allowNotFound?: boolean } = {},
): Promise<T> {
  const started = Date.now();
  const report = (outcome: Record<string, unknown>) => logRequest(query, variables, started, outcome);
  const gaveUp = (ms = Date.now() - started) => ms >= GAVE_UP_MS && ms < GAVE_UP_UNTIL_MS;
  const response = await fetch(ENDPOINT, {
    signal,
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  }).catch((e: unknown) => {
    report({ failed: String(e) });
    // The web view cannot read the timeout's 502, which comes without CORS headers: its fetch just fails.
    throw e instanceof TypeError && gaveUp() ? new TimeoutError() : e;
  });
  noteHeaders(response.headers);
  const rate = { remaining: response.headers.get("x-ratelimit-remaining"), used: response.headers.get("x-ratelimit-used"), resource: response.headers.get("x-ratelimit-resource"), reset: response.headers.get("x-ratelimit-reset") };
  if (!response.ok) {
    const text = await response.text();
    const until = refusedUntil(response, [text]);
    report({ status: response.status, ...rate, retryAfter: response.headers.get("retry-after"), refused: until?.toISOString() });
    if (!until && (response.status === 502 || response.status === 504) && gaveUp()) throw new TimeoutError();
    throw until ? new RateLimitError(until) : new Error(`GitHub API ${response.status}: ${text}`);
  }
  let body = "";
  let payload: { data?: T; errors?: { message: string; type?: string }[] };
  try {
    body = await response.text();
    payload = JSON.parse(body) as typeof payload;
  } catch (e) {
    report({ status: response.status, ...rate, bytes: body.length, failed: String(e) });
    // The timeout also comes as a 200 whose body no parser takes (github-api.md, "Timeouts").
    throw gaveUp() ? new TimeoutError() : e;
  }
  if (payload.errors?.length && !(allowNotFound && payload.errors.every((e) => e.type === "NOT_FOUND"))) {
    const messages = payload.errors.map((e) => (e.type === "RATE_LIMITED" ? `rate limit: ${e.message}` : e.message));
    const until = refusedUntil(response, messages);
    report({ status: response.status, ...rate, errors: messages.length, refused: until?.toISOString() });
    throw until ? new RateLimitError(until) : new Error(messages.join("; "));
  }
  report({ status: response.status, ...rate });
  return payload.data as T;
}

/** The operation's name: its declared one, else the mutation field or the first field of the selection. */
function operationName(query: string): string {
  return query.match(/^\s*(?:query|mutation)\s+(\w+)/)?.[1] ?? query.match(/(\w+)\s*\(\s*input:/)?.[1] ?? query.match(/\{\s*(\w+)/)?.[1] ?? "unknown";
}

/** Writes are logged at debug with their result; every request at verbose, with its variables but never a `body`. */
function logRequest(query: string, variables: Record<string, unknown>, started: number, outcome: Record<string, unknown>): void {
  const op = operationName(query);
  const ms = Date.now() - started;
  if (/^\s*mutation\b/.test(query)) log.debug("github write", { op, id: variables.id ?? variables.subjectId, ms, ...outcome });
  const safe = Object.fromEntries(Object.entries(variables).filter(([key]) => key !== "body"));
  log.verbose("graphql", { op, variables: JSON.stringify(safe), ms, ...outcome });
}

/** Scopes the app needs: `repo` to read private repos and post comments, `read:org` for organizations, `project` for boards. */
export const REQUIRED_SCOPES = ["repo", "read:org", "project"] as const;
export type Scope = (typeof REQUIRED_SCOPES)[number];

/** Broader scopes that include a required one. */
const COVERED_BY: Record<Scope, string[]> = {
  repo: [],
  "read:org": ["write:org", "admin:org"],
  project: [],
};

/**
 * Reads the classic OAuth scopes of a token from GitHub's `X-OAuth-Scopes` header.
 *
 * @returns The scopes, or null when GitHub sends none, as for fine-grained tokens, whose
 *          permissions cannot be read this way.
 *
 * @example
 *   await tokenScopes(token); // ["gist", "project", "read:org", "repo"]
 */
export async function tokenScopes(token: string): Promise<string[] | null> {
  const response = await fetch("https://api.github.com/", { headers: { Authorization: `bearer ${token}` } });
  const header = response.headers.get("X-OAuth-Scopes");
  if (header === null) return null;
  return header.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * The required scopes a token lacks. Unknown scopes (null) count as complete, since nothing can
 * be said about them.
 *
 * @example
 *   missingScopes(["repo", "admin:org"]); // ["project"]
 */
export function missingScopes(scopes: string[] | null): Scope[] {
  if (!scopes) return [];
  return REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope) && !COVERED_BY[scope].some((s) => scopes.includes(s)));
}

/** The token's GraphQL budget: 5000 points per hour, counted from the first query of that hour. */
export interface Budget {
  /** GraphQL points left in the current hour. */
  remaining: number;
  /** Points per hour, 5000 for a personal token. */
  limit: number;
  /** When the hourly budget is full again. */
  resetAt: Date;
}
