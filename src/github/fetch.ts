import type { Activity, Comment, Item, Org, PullState, Reason, ReviewRequest, ReviewState, ReviewThread } from "../model";
import { fetchBoards } from "./boards";
import { graphql } from "./client";
import { mentionsOf, sameLogin } from "../timeline";

const PAGE_SIZE = 50;

/**
 * One search per qualifier. `involves:@me` already covers assignments, mentions, authorship and
 * comments, so those reasons are read from the item itself (see `reasonsOf`); only review
 * requests need their own search, since a requested reviewer is not "involved".
 */
const QUALIFIERS: Partial<Record<Reason, string>> = {
  involved: "involves:@me",
  review: "is:pr review-requested:@me",
};

// GraphQL fragments cannot span Issue and PullRequest, so the shared selection is inlined twice.
const ITEM_FIELDS = `
  id number title url createdAt updatedAt body closed closedAt
  author { login __typename avatarUrl }
  repository { nameWithOwner }
  labels(first: 20) { nodes { name color } }
  assignees(first: 10) { nodes { login } }
  comments(last: 100) { nodes { author { login __typename avatarUrl } body createdAt } }
`;

const ASSIGNED =
  "... on AssignedEvent { createdAt actor { login __typename avatarUrl } assignee { ... on User { login } } } " +
  "... on UnassignedEvent { createdAt actor { login __typename avatarUrl } assignee { ... on User { login } } }";

const ACTOR = "createdAt actor { login __typename avatarUrl }";

/** State changes shared by issues and pull requests; `ClosedEvent.url` and `stateReason` exist, `ReopenedEvent` has neither. */
const STATE_EVENTS = `... on ClosedEvent { ${ACTOR} url stateReason } ... on ReopenedEvent { ${ACTOR} }`;

// Reviews, inline threads and review requests exist only on pull requests.
const PR_FIELDS = `
  isDraft merged baseRefName headRefName mergeable additions deletions
  timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT, REVIEW_REQUEST_REMOVED_EVENT, ASSIGNED_EVENT, UNASSIGNED_EVENT, HEAD_REF_FORCE_PUSHED_EVENT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT, MERGED_EVENT, CLOSED_EVENT, REOPENED_EVENT, REVIEW_DISMISSED_EVENT, AUTO_MERGE_ENABLED_EVENT], last: 50) {
    nodes {
      __typename
      ... on ReviewRequestedEvent { ${ACTOR} requestedReviewer { ... on User { login } ... on Team { slug } } }
      ... on ReviewRequestRemovedEvent { ${ACTOR} requestedReviewer { ... on User { login } ... on Team { slug } } }
      ${ASSIGNED}
      ... on HeadRefForcePushedEvent { ${ACTOR} }
      ... on ReadyForReviewEvent { ${ACTOR} url }
      ... on ConvertToDraftEvent { ${ACTOR} url }
      ... on MergedEvent { ${ACTOR} url }
      ${STATE_EVENTS}
      ... on ReviewDismissedEvent { ${ACTOR} url review { author { login } } }
      ... on AutoMergeEnabledEvent { ${ACTOR} }
    }
  }
  # Own window, so a long run of commits cannot push review requests and other events out.
  commitItems: timelineItems(itemTypes: [PULL_REQUEST_COMMIT], last: 20) { nodes { ... on PullRequestCommit { commit { committedDate author { user { login } } } } } }
  reviews(last: 30) { nodes { id url author { login __typename avatarUrl } body state submittedAt } }
  reviewThreads(last: 30) {
    nodes {
      path line originalLine isResolved isOutdated resolvedBy { login }
      comments(last: 20) { nodes { author { login __typename avatarUrl } body createdAt url replyTo { id } pullRequestReview { id } } }
    }
  }
`;

const ISSUE_FIELDS = `
  assignments: timelineItems(itemTypes: [ASSIGNED_EVENT, UNASSIGNED_EVENT, CLOSED_EVENT, REOPENED_EVENT, CONNECTED_EVENT, MARKED_AS_DUPLICATE_EVENT, TRANSFERRED_EVENT], last: 20) {
    nodes {
      __typename ${ASSIGNED} ${STATE_EVENTS}
      ... on TransferredEvent { ${ACTOR} fromRepository { nameWithOwner } }
      ... on ConnectedEvent { ${ACTOR} subject { ... on PullRequest { number url } } source { ... on PullRequest { number url } } }
      ... on MarkedAsDuplicateEvent { ${ACTOR} canonical { ... on Issue { number url } ... on PullRequest { number url } } }
    }
  }
  closedByPullRequestsReferences(first: 5, includeClosedPrs: false) { nodes { number url isDraft author { login } } }
  issueType { name color }
`;

const QUERY = `
query ($q: String!, $first: Int!, $after: String) {
  search(type: ISSUE, query: $q, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on Issue { ${ITEM_FIELDS} ${ISSUE_FIELDS} }
      ... on PullRequest { ${ITEM_FIELDS} ${PR_FIELDS} }
    }
  }
}`;

interface RawAuthor {
  login: string;
  __typename?: string;
  avatarUrl?: string;
}

interface RawReviewer {
  login?: string;
  slug?: string;
}

interface RawComment {
  author: RawAuthor | null;
  body: string;
  createdAt: string;
}

interface RawThreadComment extends RawComment {
  url?: string;
  replyTo?: { id: string } | null;
  pullRequestReview?: { id: string } | null;
}

export interface RawItem {
  __typename: "Issue" | "PullRequest";
  id: string;
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  body: string;
  closed?: boolean;
  closedAt?: string | null;
  merged?: boolean;
  author: RawAuthor | null;
  repository: { nameWithOwner: string };
  labels: { nodes: { name: string; color: string }[] };
  assignees: { nodes: { login: string }[] };
  comments: { nodes: RawComment[] };
  reviews?: { nodes: { id?: string; url?: string; author: RawAuthor | null; body: string; state: ReviewState; submittedAt: string | null }[] };
  reviewThreads?: {
    nodes: {
      path: string;
      line: number | null;
      originalLine: number | null;
      isResolved?: boolean;
      isOutdated?: boolean;
      resolvedBy?: { login: string } | null;
      comments: { nodes: RawThreadComment[] };
    }[];
  };
  isDraft?: boolean;
  baseRefName?: string;
  headRefName?: string;
  mergeable?: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  additions?: number;
  deletions?: number;
  timelineItems?: { nodes: RawEvent[] };
  commitItems?: { nodes: RawEvent[] };
  assignments?: { nodes: RawEvent[] };
  closedByPullRequestsReferences?: { nodes: { number: number; url: string; isDraft: boolean; author: { login: string } | null }[] };
  issueType?: { name: string; color: string } | null;
}

export interface RawEvent {
  __typename?: string;
  createdAt?: string;
  actor?: RawAuthor | null;
  requestedReviewer?: RawReviewer | null;
  assignee?: { login?: string } | null;
  commit?: { committedDate: string; author?: { user: { login: string } | null } | null };
  url?: string;
  stateReason?: string | null;
  review?: { author: { login: string } | null } | null;
  subject?: { number?: number; url?: string } | null;
  source?: { number?: number; url?: string } | null;
  canonical?: { number?: number; url?: string } | null;
  fromRepository?: { nameWithOwner: string } | null;
}

interface SearchResult {
  search: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RawItem[] };
}

export interface Viewer {
  login: string;
  name: string | null;
  avatarUrl: string;
  /** The avatar as a data URL, embedded so it shows without a connection; see `embedAvatar`. */
  avatar?: string;
  orgs: Org[];
}

/**
 * Returns the token owner's login, profile display name (null when the profile has none) and the
 * organizations they belong to, for picking which ones to watch.
 *
 * Organizations that restrict third-party access, or need an SSO session the token lacks, may be
 * missing from the list.
 *
 * @example
 *   const viewer = await fetchViewer(token);
 *   // { login: "octocat", name: "The Octocat", avatarUrl: "…", orgs: [{ login: "github", name: "GitHub", avatarUrl: "…" }] }
 */
export async function fetchViewer(token: string, signal?: AbortSignal): Promise<Viewer> {
  const data = await graphql<{ viewer: { login: string; name: string | null; avatarUrl: string; organizations: { nodes: Org[] } } }>(
    token,
    "{ viewer { login name avatarUrl organizations(first: 100) { nodes { login name avatarUrl } } } }",
    {},
    signal,
  );
  const { login, name, avatarUrl, organizations } = data.viewer;
  return { login, name: name || null, avatarUrl, orgs: organizations.nodes.filter(Boolean) };
}

/**
 * Downloads an avatar at `size` pixels and returns it as a data URL, so it can be cached with
 * the rest of the fetch. Returns null when the download fails.
 *
 * @example
 *   await embedAvatar("https://avatars.githubusercontent.com/u/583231?v=4", 40); // "data:image/png;base64,…"
 */
export async function embedAvatar(avatarUrl: string, size: number): Promise<string | null> {
  if (avatarUrl.startsWith("data:")) return avatarUrl;
  try {
    const response = await fetch(`${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}s=${size}`);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const REPOS_QUERY = `
query ($org: String!, $after: String) {
  repositoryOwner(login: $org) {
    repositories(first: 100, after: $after, isArchived: false, ownerAffiliations: [OWNER], orderBy: { field: PUSHED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { name }
    }
  }
}`;

interface ReposResult {
  repositoryOwner: { repositories: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { name: string }[] } } | null;
}

/**
 * Lists the repositories an organization or user owns that are not archived, most recently
 * pushed first, for the repo filter in the settings. Reads at most 500.
 *
 * @param token  GitHub token with `repo` and `read:org` scope.
 * @param org    The organization or user login, e.g. "octo-org".
 * @returns Repo names without the owner; empty for an unknown login.
 *
 * @example
 *   await fetchOrgRepos(token, "octo-org"); // ["app", "docs", …]
 */
export async function fetchOrgRepos(token: string, org: string): Promise<string[]> {
  const names: string[] = [];
  let after: string | null = null;
  for (let page = 0; page < 5; page++) {
    const data: ReposResult = await graphql<ReposResult>(token, REPOS_QUERY, { org, after });
    const repos = data.repositoryOwner?.repositories;
    if (!repos) break;
    names.push(...repos.nodes.map((r) => r.name));
    if (!repos.pageInfo.hasNextPage) break;
    after = repos.pageInfo.endCursor;
  }
  return names;
}

export interface FetchOptions {
  limit?: number;
  closedDays?: number;
  me?: string;
  boards?: boolean;
  now?: Date;
  /** Aborts the remaining requests. */
  signal?: AbortSignal;
  /** Only items updated since then, for a delta refresh (see `mergeDelta`). */
  since?: Date;
  /** Hits per page; GitHub prices a page by its size, so deltas ask for small pages. */
  pageSize?: number;
  /** Only items closed before then, and no open ones: widening the closed window loads just the days missing. */
  closedBefore?: Date;
}

/**
 * The state part of each search: open items, and closed ones within `closedDays`. With
 * `closedBefore`, only closed items from the window's start up to that day (both days included;
 * the overlap with the cached days is merged by node id).
 *
 * @example
 *   searchStates(new Date("2026-10-29"), 30, new Date("2026-10-22")); // ["is:closed closed:2026-09-29..2026-10-22"]
 */
export function searchStates(now: Date, closedDays: number, closedBefore?: Date): string[] {
  const day = (at: Date) => at.toISOString().slice(0, 10);
  const from = day(new Date(now.getTime() - closedDays * 86_400_000));
  if (closedBefore) return closedDays > 0 ? [`is:closed closed:${from}..${day(closedBefore)}`] : [];
  return closedDays > 0 ? ["is:open", `is:closed closed:>=${from}`] : ["is:open"];
}

/**
 * Collects every open issue and pull request in the given organizations, and in the viewer's own
 * repositories when their login is among them, that is assigned to the
 * viewer, mentions them, requests their review or otherwise involves them, plus those closed or
 * merged within the last `closedDays` days.
 *
 * Runs one search per qualifier in `QUALIFIERS` over all owners (GitHub ORs repeated `org:` and
 * `user:` qualifiers) and merges the hits by node id; "assigned" and "mentioned" come from the
 * item's assignees and posts, so an item carries all its reasons.
 * Each search reads at most `limit` hits, in pages of 50; only the last 100 comments per item
 * are loaded. Boards come from a second, failure-tolerant query (see `fetchBoards`), skipped when
 * `boards` is false.
 *
 * @param token  GitHub token with `repo` and `read:org` scope.
 * @param orgs   Owner logins, e.g. `["octo-org"]`. An empty list returns no items.
 * @param options.limit       Hits per search (two per state); GitHub's search stops at 1000.
 * @param options.closedDays  How far back closed and merged items are loaded; 0 loads none.
 * @param options.closedBefore  Loads only the closed items from `closedDays` back up to that day
 *                            (see `searchStates`), e.g. the days a wider window adds.
 * @param options.me          The viewer's login; in `orgs` it stands for their personal
 *                            repositories, and it decides the "assigned" and "mentioned" reasons.
 * @param options.boards      Load board status and sprint; off saves a query per refresh.
 * @returns Items in no particular order.
 *
 * @example
 *   const items = await fetchItems(token, ["octo-org", "octo-labs"], { me: "octocat", closedDays: 7 });
 */
export async function fetchItems(token: string, orgs: string[], { limit = 200, closedDays = 0, me = "", boards = true, now = new Date(), signal, since, pageSize = PAGE_SIZE, closedBefore }: FetchOptions = {}): Promise<Item[]> {
  if (orgs.length === 0) return [];
  const scope = orgs.map((login) => (sameLogin(login, me) ? `user:${login}` : `org:${login}`)).join(" ");
  const byId = new Map<string, Item>();
  const updated = since ? ` updated:>=${since.toISOString().slice(0, 19)}Z` : "";
  const searches = searchStates(now, closedDays, closedBefore).flatMap((state) => (Object.keys(QUALIFIERS) as Reason[]).map((reason) => ({ state, reason })));

  await Promise.all(
    searches.map(async ({ state, reason }) => {
      for (const raw of await search(token, `${state} ${QUALIFIERS[reason]} ${scope}${updated}`, limit, pageSize, signal)) {
        const item = byId.get(raw.id) ?? toItem(raw);
        for (const r of [reason, ...reasonsOf(item, me)]) if (!item.reasons.includes(r)) item.reasons.push(r);
        byId.set(raw.id, item);
      }
    }),
  );
  if (boards) {
    const found = await fetchBoards(token, [...byId.keys()], signal);
    for (const item of byId.values()) item.boards = found.get(item.id) ?? [];
  }
  return [...byId.values()];
}

const NODE_QUERY = `
query ($id: ID!) {
  node(id: $id) {
    __typename
    ... on Issue { ${ITEM_FIELDS} ${ISSUE_FIELDS} }
    ... on PullRequest { ${ITEM_FIELDS} ${PR_FIELDS} }
  }
}`;

/**
 * Loads one issue or pull request by node id, e.g. right after commenting on it, instead of
 * running every search again; costs one or two points. `reasons` holds only what the item's
 * data shows (see `reasonsOf`); search-only reasons such as a review request are the caller's
 * to keep.
 *
 * @param token  GitHub token with the `REQUIRED_SCOPES`.
 * @param id     The item's node id.
 * @param options.me      The viewer's login, for the reasons.
 * @param options.boards  Load board status and sprint as well.
 * @returns The item, or null when it no longer exists or is out of reach, e.g. transferred to
 *          another repository under a new id.
 *
 * @example
 *   const fresh = await fetchItem(token, item.id, { me: "octocat", boards: true });
 */
export async function fetchItem(token: string, id: string, { me = "", boards = true }: Pick<FetchOptions, "me" | "boards"> = {}): Promise<Item | null> {
  const data = await graphql<{ node: RawItem | null }>(token, NODE_QUERY, { id }, undefined, { allowNotFound: true });
  if (!data.node?.id) return null;
  const item = toItem(data.node);
  item.reasons = reasonsOf(item, me);
  if (boards) item.boards = (await fetchBoards(token, [id])).get(id) ?? [];
  return item;
}

const NODES_QUERY = `
query ($ids: [ID!]!) {
  nodes(ids: $ids) {
    __typename
    ... on Issue { ${ITEM_FIELDS} ${ISSUE_FIELDS} }
    ... on PullRequest { ${ITEM_FIELDS} ${PR_FIELDS} }
  }
}`;

/** Ids per request; the cost grows with the items, 19 points for 50 (measured 2026-10-26), against one point each through `fetchItem`. */
export const REFRESH_CHUNK = 50;

/**
 * Loads many issues and pull requests by node id in few requests, e.g. to refresh everything a
 * view holds. Like `fetchItem`, `reasons` holds only what the item's data shows; the caller
 * keeps what only a search knows.
 *
 * @param token  GitHub token with the `REQUIRED_SCOPES`.
 * @param ids    The items' node ids; sent in chunks of `REFRESH_CHUNK`.
 * @param options.me      The viewer's login, for the reasons.
 * @param options.boards  Load board status and sprint as well.
 * @param options.signal  Stops between and during the requests.
 * @returns The items found; those that no longer exist or are out of reach are missing.
 *
 * @example
 *   const fresh = await fetchItemsById(token, view.map((c) => c.item.id), { me: "octocat", boards: true });
 */
export async function fetchItemsById(token: string, ids: string[], { me = "", boards = true, signal }: Pick<FetchOptions, "me" | "boards" | "signal"> = {}): Promise<Item[]> {
  const items: Item[] = [];
  for (let from = 0; from < ids.length; from += REFRESH_CHUNK) {
    const data = await graphql<{ nodes: (RawItem | null)[] }>(token, NODES_QUERY, { ids: ids.slice(from, from + REFRESH_CHUNK) }, signal, { allowNotFound: true });
    for (const node of data.nodes) {
      if (!node?.id) continue;
      const item = toItem(node);
      item.reasons = reasonsOf(item, me);
      items.push(item);
    }
  }
  if (boards && items.length > 0) {
    const found = await fetchBoards(token, items.map((i) => i.id), signal);
    for (const item of items) item.boards = found.get(item.id) ?? [];
  }
  return items;
}

/** The reasons an item's own data shows: assigned to the viewer, or mentioning them in a post. */
export function reasonsOf(item: Item, me: string): Reason[] {
  if (!me) return [];
  const reasons: Reason[] = [];
  if (item.assignees.some((a) => sameLogin(a, me))) reasons.push("assigned");
  if (mentionsOf(item, me).length > 0) reasons.push("mentioned");
  return reasons;
}

async function search(token: string, q: string, limit: number, pageSize: number, signal?: AbortSignal): Promise<RawItem[]> {
  const hits: RawItem[] = [];
  let after: string | null = null;
  for (let page = 0; page < Math.ceil(limit / pageSize); page++) {
    const data: SearchResult = await graphql<SearchResult>(token, QUERY, { q, first: pageSize, after }, signal);
    hits.push(...data.search.nodes.filter((node) => node?.id));
    if (!data.search.pageInfo.hasNextPage) break;
    after = data.search.pageInfo.endCursor;
  }
  return hits;
}

/**
 * Maps one search hit to an `Item`.
 *
 * For pull requests, review summaries with text and inline review comments join the conversation
 * comments, tagged with `where` and sorted by time, so mentions in a review count like any other.
 * Pending reviews (no `submittedAt`) and empty review summaries are left out of the comments;
 * `reviews` keeps every submitted review, and `reviewRequests` every request event. Bot authors
 * carry a "[bot]" suffix; `avatars` maps every author login to its avatar URL.
 *
 * @example
 *   toItem(raw).comments.at(-1); // { author: "bob", body: "@me nit", createdAt: "…", where: "src/app.ts:42" }
 */
export function toItem(raw: RawItem): Item {
  return {
    id: raw.id,
    kind: raw.__typename === "PullRequest" ? "pr" : "issue",
    repo: raw.repository.nameWithOwner,
    number: raw.number,
    title: raw.title,
    url: raw.url,
    author: toLogin(raw.author),
    body: raw.body,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    labels: raw.labels.nodes,
    reviewRequests: reviewRequests(raw),
    draft: raw.isDraft ?? false,
    reviews: (raw.reviews?.nodes ?? []).flatMap((r) => (r.submittedAt ? [{ author: toLogin(r.author), at: r.submittedAt, id: r.id, state: r.state, url: r.url }] : [])),
    threads: threadsOf(raw),
    activities: activitiesOf(raw),
    assignees: raw.assignees.nodes.map((a) => a.login),
    comments: [...raw.comments.nodes.map((c) => toComment(c)), ...reviewComments(raw)].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    ),
    avatars: avatarsOf(raw),
    pull: raw.__typename === "PullRequest" ? toPull(raw) : null,
    linkedPrs: (raw.closedByPullRequestsReferences?.nodes ?? []).map((pr) => ({ number: pr.number, url: pr.url, draft: pr.isDraft, author: pr.author?.login ?? "ghost" })),
    issueType: raw.issueType ?? null,
    ...transferOf(raw),
    closed: raw.closed && raw.closedAt ? { state: raw.merged ? "merged" : "closed", at: raw.closedAt } : null,
    boards: [],
    reasons: [],
  };
}

/** The repository the issue was last moved from, as `transferredFrom`; nothing for an issue never moved. */
function transferOf(raw: RawItem): Pick<Item, "transferredFrom"> {
  const from = (raw.assignments?.nodes ?? []).filter((e) => e.__typename === "TransferredEvent").at(-1)?.fromRepository?.nameWithOwner;
  return from ? { transferredFrom: from } : {};
}

function toComment(raw: RawComment, where?: string): Comment {
  return { author: toLogin(raw.author), body: raw.body, createdAt: raw.createdAt, ...(where && { where }) };
}

function reviewComments(raw: RawItem): Comment[] {
  const summaries = (raw.reviews?.nodes ?? [])
    .filter((r) => r.submittedAt && r.body.trim())
    .map((r) => ({ ...toComment({ author: r.author, body: r.body, createdAt: r.submittedAt! }, "Review"), reviewState: r.state }));
  const inline = (raw.reviewThreads?.nodes ?? []).flatMap((thread) => {
    const line = thread.line ?? thread.originalLine;
    const where = line ? `${thread.path}:${line}` : thread.path;
    return thread.comments.nodes.map((c) => toComment(c, where));
  });
  return [...summaries, ...inline];
}

function threadsOf(raw: RawItem): ReviewThread[] {
  return (raw.reviewThreads?.nodes ?? []).map((thread) => ({
    resolved: thread.isResolved ?? false,
    resolvedBy: thread.resolvedBy?.login ?? null,
    outdated: thread.isOutdated ?? false,
    comments: thread.comments.nodes.map((c) => ({
      author: toLogin(c.author),
      at: c.createdAt,
      url: c.url ?? "",
      review: c.pullRequestReview?.id ?? null,
      reply: !!c.replyTo,
    })),
  }));
}

/** Bots get GitHub's "[bot]" suffix, so `isBot` can tell them apart by login alone. */
function toLogin(author: RawAuthor | null): string {
  if (!author) return "ghost";
  return author.__typename === "Bot" ? `${author.login}[bot]` : author.login;
}

function reviewRequests(raw: RawItem): ReviewRequest[] {
  return (raw.timelineItems?.nodes ?? []).flatMap((event) => {
    if (event.__typename !== "ReviewRequestedEvent") return [];
    const reviewer = reviewerName(event.requestedReviewer);
    return event.createdAt && reviewer ? [{ reviewer, at: event.createdAt }] : [];
  });
}

function reviewerName(reviewer: RawReviewer | null | undefined): string | null {
  if (reviewer?.login) return reviewer.login;
  return reviewer?.slug ? `team:${reviewer.slug}` : null;
}

function avatarsOf(raw: RawItem): Record<string, string> {
  const authors = [
    raw.author,
    ...raw.comments.nodes.map((c) => c.author),
    ...(raw.reviews?.nodes ?? []).map((r) => r.author),
    ...(raw.reviewThreads?.nodes ?? []).flatMap((t) => t.comments.nodes.map((c) => c.author)),
    ...((raw.timelineItems ?? raw.assignments)?.nodes ?? []).map((e) => e.actor ?? null),
  ];
  return Object.fromEntries(authors.flatMap((a) => (a?.avatarUrl ? [[toLogin(a), a.avatarUrl]] : [])));
}

function toPull(raw: RawItem): PullState {
  return {
    base: raw.baseRefName ?? "",
    head: raw.headRefName ?? "",
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    conflicts: raw.mergeable === "CONFLICTING",
  };
}

function activitiesOf(raw: RawItem): Activity[] {
  const events = [...((raw.timelineItems ?? raw.assignments)?.nodes ?? []), ...(raw.commitItems?.nodes ?? [])];
  const mergedAt = events.flatMap((e) => (e.__typename === "MergedEvent" && e.createdAt ? [Date.parse(e.createdAt)] : []));
  const fromEvents = events.flatMap((e): Activity[] => {
    const actor = toLogin(e.actor ?? null);
    if (e.commit) {
      const author = e.commit.author?.user?.login;
      return [{ kind: "commit", at: e.commit.committedDate, ...(author && { author }) }];
    }
    const at = e.createdAt;
    if (!at) return [];
    const url = e.url ? { url: e.url } : {};
    const linked = e.__typename === "ConnectedEvent" ? (e.source?.url ? e.source : e.subject) : e.canonical;
    switch (e.__typename) {
      case "HeadRefForcePushedEvent":
        return [{ kind: "force-pushed", at, actor }];
      case "AutoMergeEnabledEvent":
        return [{ kind: "auto-merge", at, actor }];
      case "ReadyForReviewEvent":
        return [{ kind: "state", at, actor, change: "ready", ...url }];
      case "ConvertToDraftEvent":
        return [{ kind: "state", at, actor, change: "draft", ...url }];
      case "MergedEvent":
        return [{ kind: "state", at, actor, change: "merged", ...url }];
      case "ReopenedEvent":
        return [{ kind: "state", at, actor, change: "reopened" }];
      case "ClosedEvent":
        // Merging also closes; the merge says enough.
        if (mergedAt.some((m) => Math.abs(m - Date.parse(at)) < 60_000)) return [];
        return [{ kind: "state", at, actor, change: "closed", ...(e.stateReason && { reason: e.stateReason }), ...url }];
      case "ReviewDismissedEvent":
        return [{ kind: "dismissed", at, actor, reviewer: e.review?.author?.login ?? "ghost", ...url }];
      case "TransferredEvent":
        return e.fromRepository ? [{ kind: "transferred", at, actor, from: e.fromRepository.nameWithOwner }] : [];
      case "ConnectedEvent":
      case "MarkedAsDuplicateEvent":
        return linked?.number && linked.url ? [{ kind: e.__typename === "ConnectedEvent" ? "linked" : "duplicate", at, actor, number: linked.number, url: linked.url }] : [];
    }
    if (e.assignee?.login) return [{ kind: e.__typename === "UnassignedEvent" ? "unassigned" : "assigned", at, actor, assignee: e.assignee.login }];
    const reviewer = reviewerName(e.requestedReviewer);
    return reviewer ? [{ kind: e.__typename === "ReviewRequestRemovedEvent" ? "review-request-removed" : "review-requested", at, actor, reviewer }] : [];
  });
  const silentReviews = (raw.reviews?.nodes ?? []).flatMap((r): Activity[] =>
    r.submittedAt && !r.body.trim() ? [{ kind: "reviewed", at: r.submittedAt, actor: toLogin(r.author), state: r.state }] : [],
  );
  return [...fromEvents, ...silentReviews].sort((a, b) => a.at.localeCompare(b.at));
}
