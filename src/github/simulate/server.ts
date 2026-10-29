import { addressedText } from "../../timeline";
import { avatarUrl, type GitHubSimulator } from "./world";

const GRAPHQL = "https://api.github.com/graphql";
const ROOT = "https://api.github.com/";

type Variables = Record<string, unknown>;
type GraphQLError = { type?: string; message: string };
type Answer = { data: unknown; cost: number; errors?: GraphQLError[] };

/** One GraphQL operation: how to recognize it in the query text, and what the world answers. */
interface Operation {
  name: string;
  matches: RegExp;
  answer: (world: GitHubSimulator, vars: Variables) => Answer;
}

const viewerId = (login: string) => `U_${login}`;

const OPERATIONS: Operation[] = [
  { name: "viewerId", matches: /\bviewer\s*\{\s*id\s*\}/, answer: (w) => ({ data: { viewer: { id: viewerId(w.viewer) } }, cost: 1 }) },
  {
    name: "viewer",
    matches: /\bviewer\s*\{\s*login/,
    answer: (w) => ({
      data: { viewer: { login: w.viewer, name: w.viewerName, avatarUrl: avatarUrl(w.viewer), organizations: { nodes: w.orgs.filter((login) => login !== w.viewer).map((login) => ({ login, name: login, avatarUrl: avatarUrl(login) })) } } },
      cost: 1,
    }),
  },
  { name: "repos", matches: /\brepositoryOwner\(/, answer: (w, v) => repos(w, String(v.org)) },
  { name: "reviewIds", matches: /\bsearch\(type: ISSUE, query: \$q, first: 100/, answer: (w, v) => ({ ...search(w, { ...v, first: 100 }), cost: 1 }) },
  { name: "search", matches: /\bsearch\(type: ISSUE/, answer: search },
  {
    name: "node",
    matches: /\bnode\(id: \$id\)/,
    answer: (w, v) => ({ data: { node: w.entries.has(String(v.id)) ? clone(w.raw(w.refOf(String(v.id)))) : null }, cost: 1, errors: notFound(w, [String(v.id)]) }),
  },
  {
    name: "nodes",
    matches: /\bnodes\(ids: \$ids\)\s*\{\s*__typename/,
    answer: (w, v) => ({ data: { nodes: (v.ids as string[]).map((id) => (w.entries.has(id) ? clone(w.raw(w.refOf(id))) : null)) }, cost: 1, errors: notFound(w, v.ids as string[]) }),
  },
  { name: "boards", matches: /\bnodes\(ids: \$ids\)/, answer: boards },
  { name: "addComment", matches: /\baddComment\(input:/, answer: (w, v) => ({ data: { addComment: { commentEdge: { node: { url: addComment(w, v) } } } }, cost: 1 }) },
  { name: "addAssigneesToAssignable", matches: /\baddAssigneesToAssignable\(input:/, answer: (w, v) => assignees(w, v, "add") },
  { name: "removeAssigneesFromAssignable", matches: /\bremoveAssigneesFromAssignable\(input:/, answer: (w, v) => assignees(w, v, "remove") },
  { name: "closeIssue", matches: /\bcloseIssue\(input:/, answer: (w, v) => state(w, v, "closeIssue", () => w.close(w.refOf(String(v.id)), w.viewer, typeof v.reason === "string" ? v.reason : "COMPLETED")) },
  { name: "closePullRequest", matches: /\bclosePullRequest\(input:/, answer: (w, v) => state(w, v, "closePullRequest", () => w.close(w.refOf(String(v.id)), w.viewer)) },
  { name: "reopenIssue", matches: /\breopenIssue\(input:/, answer: (w, v) => state(w, v, "reopenIssue", () => w.reopen(w.refOf(String(v.id)), w.viewer)) },
  { name: "reopenPullRequest", matches: /\breopenPullRequest\(input:/, answer: (w, v) => state(w, v, "reopenPullRequest", () => w.reopen(w.refOf(String(v.id)), w.viewer)) },
];

/** GitHub's answer for ids that do not resolve, e.g. of a transferred issue: one `NOT_FOUND` error each, beside `null` data. */
function notFound(world: GitHubSimulator, ids: string[]): GraphQLError[] | undefined {
  const missing = ids.filter((id) => !world.entries.has(id));
  return missing.length > 0 ? missing.map((id) => ({ type: "NOT_FOUND", message: `Could not resolve to a node with the global id of '${id}'` })) : undefined;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function repos(world: GitHubSimulator, owner: string): Answer {
  if (!world.orgs.includes(owner)) return { data: { repositoryOwner: null }, cost: 1 };
  const names = [...new Set([...world.entries.values()].map((e) => e.raw.repository.nameWithOwner).filter((r) => r.startsWith(`${owner}/`)).map((r) => r.slice(owner.length + 1)))];
  return { data: { repositoryOwner: { repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: names.map((name) => ({ name })) } } }, cost: 1 };
}

function mentions(text: string, login: string): boolean {
  return new RegExp(`(^|[^\\w/-])@${login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i").test(addressedText(text));
}

/** GitHub's `involves:`: author, assignee, mentioned or commenter; reviewers count as commenters. */
function involves(world: GitHubSimulator, raw: ReturnType<GitHubSimulator["raw"]>): boolean {
  const me = world.viewer.toLowerCase();
  const posts = [raw.body, ...raw.comments.nodes.map((c) => c.body), ...(raw.reviews?.nodes ?? []).map((r) => r.body), ...(raw.reviewThreads?.nodes ?? []).flatMap((t) => t.comments.nodes.map((c) => c.body))];
  const people = [raw.author?.login, ...raw.assignees.nodes.map((a) => a.login), ...raw.comments.nodes.map((c) => c.author?.login), ...(raw.reviews?.nodes ?? []).map((r) => r.author?.login), ...(raw.reviewThreads?.nodes ?? []).flatMap((t) => t.comments.nodes.map((c) => c.author?.login))];
  return people.some((p) => p?.toLowerCase() === me) || posts.some((text) => mentions(text, world.viewer));
}

/** Answers a search the way `fetchItems` phrases it: state, one of two qualifiers, owners, `updated:>=`. */
function search(world: GitHubSimulator, vars: Variables): Answer {
  const tokens = String(vars.q).split(/\s+/);
  const value = (prefix: string) => tokens.find((t) => t.startsWith(prefix))?.slice(prefix.length);
  const owners = tokens.flatMap((t) => (/^(org|user):/.test(t) ? [t.split(":")[1].toLowerCase()] : []));
  const updatedSince = value("updated:>=");
  const closedSince = value("closed:>=");
  const wantClosed = tokens.includes("is:closed");
  const hits = [...world.entries.values()]
    .filter(({ raw, requested }) => {
      if (owners.length > 0 && !owners.includes(raw.repository.nameWithOwner.split("/")[0].toLowerCase())) return false;
      if (wantClosed ? !raw.closed || (!!closedSince && (raw.closedAt ?? "").slice(0, 10) < closedSince) : raw.closed) return false;
      if (updatedSince && raw.updatedAt < updatedSince) return false;
      if (tokens.includes("is:pr") && raw.__typename !== "PullRequest") return false;
      if (tokens.includes("review-requested:@me")) return requested.has(world.viewer) || world.teams.some((slug) => requested.has(`team:${slug}`));
      return tokens.includes("involves:@me") ? involves(world, raw) : true;
    })
    .map(({ raw }) => raw)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const first = Number(vars.first) || 50;
  const from = Number(vars.after ?? 0) || 0;
  const more = from + first < hits.length;
  return {
    data: { search: { pageInfo: { hasNextPage: more, endCursor: more ? String(from + first) : null }, nodes: clone(hits.slice(from, from + first)) } },
    cost: Math.max(1, Math.floor((first * 19) / 50)),
  };
}

function boards(world: GitHubSimulator, vars: Variables): Answer {
  const ids = vars.ids as string[];
  if (world.scopes && !world.scopes.includes("project")) throw new Error("Your token has not been granted the required scopes to execute this query");
  const nodes = ids.map((id) => (world.entries.has(id) ? { id, projectItems: { nodes: clone(world.entry(id).boards) } } : null));
  return { data: { nodes }, cost: Math.max(1, Math.ceil((ids.length * 6) / 50)) };
}

function addComment(world: GitHubSimulator, vars: Variables): string {
  const ref = world.refOf(String(vars.subjectId));
  world.comment(ref, world.viewer, String(vars.body));
  const raw = world.raw(ref);
  return `${raw.url}#issuecomment-${raw.comments.nodes.length}`;
}

function assignees(world: GitHubSimulator, vars: Variables, change: "add" | "remove"): Answer {
  const ref = world.refOf(String(vars.id));
  const raw = world.raw(ref);
  const has = raw.assignees.nodes.some((a) => a.login === world.viewer);
  if (change === "add" && !has) world.assign(ref, world.viewer, world.viewer);
  if (change === "remove" && has) world.unassign(ref, world.viewer, world.viewer);
  const payload = { assignable: { assignees: { nodes: clone(raw.assignees.nodes) } } };
  return { data: change === "add" ? { addAssigneesToAssignable: payload } : { removeAssigneesFromAssignable: payload }, cost: 1 };
}

function state(world: GitHubSimulator, vars: Variables, field: string, change: () => void): Answer {
  if (!world.entries.has(String(vars.id))) throw new Error(`Could not resolve to a node with the global id of '${String(vars.id)}'`);
  change();
  return { data: { [field]: { clientMutationId: null } }, cost: 1 };
}

function headers(world: GitHubSimulator, cost: number): Headers {
  const b = world.budget;
  return new Headers({
    "x-ratelimit-resource": "graphql",
    "x-ratelimit-limit": String(b.limit),
    "x-ratelimit-remaining": String(b.remaining),
    "x-ratelimit-used": String(b.limit - b.remaining),
    "x-ratelimit-reset": String(Math.floor(b.resetAt.getTime() / 1000)),
    "x-simulated-cost": String(cost),
  });
}

function json(body: unknown, init: ResponseInit & { headers: Headers }): Response {
  init.headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), init);
}

/** Charges the hourly budget, opening a new hour once the last one has passed. */
function charge(world: GitHubSimulator, cost: number): boolean {
  const b = world.budget;
  if (world.now >= b.resetAt) {
    b.remaining = b.limit;
    b.resetAt = new Date(world.now.getTime() + 3_600_000);
  }
  if (b.remaining < cost) return false;
  b.remaining -= cost;
  return true;
}

function graphql(world: GitHubSimulator, body: string): Response {
  const { query, variables = {} } = JSON.parse(body) as { query: string; variables?: Variables };
  const op = OPERATIONS.find((o) => o.matches.test(query));
  const name = op?.name ?? "unknown";
  if (!charge(world, 1)) {
    world.requests.push({ op: name, cost: 0 });
    return json({ message: "API rate limit exceeded" }, { status: 403, headers: headers(world, 0) });
  }
  const failure = world.failures.get(name);
  if (failure !== undefined) {
    world.failures.delete(name);
    world.requests.push({ op: name, cost: 1 });
    return json({ errors: [{ message: failure }] }, { status: 200, headers: headers(world, 1) });
  }
  try {
    if (!op) throw new Error("The simulated GitHub does not know this query; teach it to src/github/simulate/server.ts");
    const { data, cost, errors } = op.answer(world, variables);
    if (cost > 1) charge(world, cost - 1);
    world.requests.push({ op: name, cost });
    return json({ data, ...(errors && { errors }) }, { status: 200, headers: headers(world, cost) });
  } catch (e) {
    world.requests.push({ op: name, cost: 1 });
    return json({ errors: [{ message: e instanceof Error ? e.message : String(e) }] }, { status: 200, headers: headers(world, 1) });
  }
}

/**
 * Answers one request the app would send to GitHub, from the world: the GraphQL endpoint, the
 * root call that reports a token's scopes. Costs and the hourly budget
 * follow the measurements in `docs/reference/github-api.md`, so `x-ratelimit-*` headers move as
 * on GitHub.
 *
 * @param world  The world to read and change.
 * @param input  The request URL, as `fetch` receives it.
 * @param init   The request options, as `fetch` receives them.
 * @returns The response; rejects with a `TypeError` while `world.offline`.
 *
 * @example
 *   const response = await serve(world, "https://api.github.com/graphql", { method: "POST", body });
 */
export function serve(world: GitHubSimulator, input: string, init: RequestInit = {}): Promise<Response> {
  if (world.offline) return Promise.reject(new TypeError("Failed to fetch"));
  if (init.signal?.aborted) return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  if (input === ROOT) {
    const h = new Headers();
    if (world.scopes) h.set("X-OAuth-Scopes", world.scopes.join(", "));
    return Promise.resolve(new Response("{}", { headers: h }));
  }
  if (input === GRAPHQL) return Promise.resolve(graphql(world, typeof init.body === "string" ? init.body : ""));
  return Promise.reject(new TypeError(`The simulated GitHub does not serve ${input}`));
}

/**
 * Routes the global `fetch` to the world, so the app's own GitHub code talks to it. Used by tests
 * and, later, by the demo mode.
 *
 * @returns A function that puts the original `fetch` back.
 *
 * @example
 *   const restore = installSimulator(world);
 *   afterEach(restore);
 */
export function installSimulator(world: GitHubSimulator): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // Everything but GitHub (Tauri's own IPC calls, say) goes where it was going.
    return url.startsWith(ROOT) ? serve(world, url, init) : original(input, init);
  });
  return () => {
    globalThis.fetch = original;
  };
}
