import type { ReviewState } from "../../model";
import type { RawBoardNode } from "../boards";
import type { RawEvent, RawItem } from "../fetch";

import { avatarUrl } from "../../demo/avatar";

export { avatarUrl };

/** GitHub's colors for the usual issue types, so the demo's type dots differ. */
const TYPE_COLORS: Record<string, string> = { Bug: "RED", Feature: "BLUE", Task: "YELLOW", Story: "PURPLE", Epic: "PINK" };

type RawAuthor = NonNullable<RawItem["author"]>;
type BoardItem = NonNullable<RawBoardNode["projectItems"]>["nodes"][number];
type Thread = NonNullable<RawItem["reviewThreads"]>["nodes"][number];

/** An item of the world, as a test or the demo holds it; pass it to the world's methods. */
export interface Ref {
  readonly id: string;
  readonly kind: "issue" | "pr";
}

/** What a stored item carries beyond GitHub's raw shape: who is asked to review, and its boards. */
interface Entry {
  raw: RawItem;
  requested: Set<string>;
  boards: BoardItem[];
}

export interface Draft {
  repo?: string;
  title?: string;
  author?: string;
  body?: string;
  assignees?: string[];
  labels?: { name: string; color: string }[];
  /** Issues only: the issue type, e.g. "Bug". */
  type?: string;
  draft?: boolean;
  base?: string;
  head?: string;
  additions?: number;
  deletions?: number;
  conflicts?: boolean;
}

export interface BoardPlace {
  project?: string;
  status?: string | null;
  sprint?: string | null;
  /** Further fields as shown in the detail, e.g. `{ name: "Component", value: "API" }`. */
  fields?: { name: string; value: string }[];
}

export interface InlineComment {
  path: string;
  line: number;
  body: string;
}

/**
 * A stand-in for GitHub: users, repositories, issues, pull requests and everything that happens
 * on them, held in memory. `serve` in `server.ts` answers the app's GraphQL requests from it, so
 * the real fetch, parse and classify code runs against a world a test or the demo scripts.
 *
 * Writing methods behave like GitHub's: they stamp the world's clock, add the timeline event
 * and, except where GitHub is known not to, move the item's `updatedAt`, which deltas rely on.
 * Board moves and review requests withdrawn leave it alone (see `docs/reference/github-api.md`,
 * "Known gaps").
 *
 * @example
 *   const world = new GitHubSimulator({ viewer: "octocat" });
 *   const issue = world.issue({ title: "Crash on start", assignees: ["octocat"] });
 *   world.comment(issue, "alice", "@octocat can you look?");
 *   const items = await fetchItems("token", ["octo-org"], { me: "octocat" }); // after `installSimulator(world)`
 */
export class GitHubSimulator {
  readonly viewer: string;
  /** The viewer's profile name, null for a profile without one. */
  readonly viewerName: string | null;
  readonly orgs: string[];
  private fixed: Date | null;
  /** Slugs of the teams the viewer belongs to; a review requested from one of them finds its pull request for them. */
  teams: string[] = [];
  /** Classic scopes in `X-OAuth-Scopes`; null sends no header, like a fine-grained token. */
  scopes: string[] | null = ["repo", "read:org", "project"];
  /** Fail every request at the network, like a Mac without Wi-Fi. */
  offline = false;
  /** Fail the next request of an operation with GitHub's message, e.g. `fail("addComment", "Conversation is locked")`. */
  readonly failures = new Map<string, string>();
  /** Every request served, in order; `cost` is what GitHub would have charged. */
  readonly requests: { op: string; cost: number }[] = [];
  budget = { limit: 5000, remaining: 5000, resetAt: new Date(0) };

  readonly entries = new Map<string, Entry>();
  private counter = 0;
  private numbers = new Map<string, number>();

  /**
   * @param options.name  The viewer's profile name.
   * @param options.now   The clock's start, standing still until moved; a fixed date by default.
   * @param options.live  Follow the wall clock instead, as the demo does; `advance` then pins it.
   */
  constructor({ viewer = "octocat", name = null, orgs = ["octo-org"], now = new Date("2026-10-25T12:00:00Z"), live = false }: { viewer?: string; name?: string | null; orgs?: string[]; now?: Date; live?: boolean } = {}) {
    this.viewer = viewer;
    this.viewerName = name;
    this.orgs = orgs;
    this.fixed = live ? null : now;
    this.budget.resetAt = new Date(this.now.getTime() + 3_600_000);
  }

  /** The world's clock; every stamp uses it. Move it with `advance`. */
  get now(): Date {
    return this.fixed ?? new Date();
  }

  set now(value: Date) {
    this.fixed = value;
  }

  /** Runs `scenario` with the clock `ago` ms in the past, so what it writes carries older times; the clock is put back after. */
  at(ago: number, scenario: () => void): void {
    const before = this.fixed;
    this.fixed = new Date(this.now.getTime() - ago);
    try {
      scenario();
    } finally {
      this.fixed = before;
    }
  }

  /** Moves the clock forward, e.g. `advance(2 * 3_600_000)` for "two hours later". */
  advance(ms: number): void {
    this.now = new Date(this.now.getTime() + ms);
  }

  /** The clock as GitHub writes times, shifted by `ms` (negative for the past). */
  stamp(ms = 0): string {
    return new Date(this.now.getTime() + ms).toISOString().replace(".000Z", "Z");
  }

  fail(op: string, message: string): void {
    this.failures.set(op, message);
  }

  /** Opens an issue; its `createdAt` is `ago` ms before now. */
  issue(draft: Draft & { ago?: number } = {}): Ref {
    return this.open("issue", draft);
  }

  /** Opens a pull request. */
  pullRequest(draft: Draft & { ago?: number } = {}): Ref {
    return this.open("pr", draft);
  }

  comment(ref: Ref, author: string, body: string): void {
    const raw = this.raw(ref);
    raw.comments.nodes.push({ author: this.author(author), body, createdAt: this.stamp() });
    this.touch(raw);
  }

  assign(ref: Ref, actor: string, assignee: string): void {
    const raw = this.raw(ref);
    if (!raw.assignees.nodes.some((a) => a.login === assignee)) raw.assignees.nodes.push({ login: assignee });
    this.event(raw, { __typename: "AssignedEvent", actor: this.author(actor), assignee: { login: assignee } });
    this.touch(raw);
  }

  unassign(ref: Ref, actor: string, assignee: string): void {
    const raw = this.raw(ref);
    raw.assignees.nodes = raw.assignees.nodes.filter((a) => a.login !== assignee);
    this.event(raw, { __typename: "UnassignedEvent", actor: this.author(actor), assignee: { login: assignee } });
    this.touch(raw);
  }

  /** A person, or `team:<slug>` for a team. */
  requestReview(ref: Ref, actor: string, reviewer: string): void {
    const entry = this.entry(ref);
    entry.requested.add(reviewer);
    this.event(entry.raw, { __typename: "ReviewRequestedEvent", actor: this.author(actor), requestedReviewer: this.reviewer(reviewer) });
    this.touch(entry.raw);
  }

  /** Takes the request back; GitHub does not move `updatedAt` for it as far as known. */
  withdrawReviewRequest(ref: Ref, actor: string, reviewer: string): void {
    const entry = this.entry(ref);
    entry.requested.delete(reviewer);
    this.event(entry.raw, { __typename: "ReviewRequestRemovedEvent", actor: this.author(actor), requestedReviewer: this.reviewer(reviewer) });
  }

  /**
   * Submits a review. Inline comments open one thread each; the reviewer is no longer asked.
   * @returns The review's id, for `replyInThread`.
   */
  review(ref: Ref, author: string, state: ReviewState, { body = "", inline = [] }: { body?: string; inline?: InlineComment[] } = {}): string {
    const entry = this.entry(ref);
    const raw = entry.raw;
    const id = `PRR_${++this.counter}`;
    const at = this.stamp();
    (raw.reviews ??= { nodes: [] }).nodes.push({ id, url: `${raw.url}#pullrequestreview-${this.counter}`, author: this.author(author), body, state, submittedAt: at });
    for (const c of inline) {
      (raw.reviewThreads ??= { nodes: [] }).nodes.push({
        path: c.path,
        line: c.line,
        originalLine: c.line,
        isResolved: false,
        isOutdated: false,
        resolvedBy: null,
        comments: { nodes: [{ author: this.author(author), body: c.body, createdAt: at, url: `${raw.url}#discussion_r${++this.counter}`, replyTo: null, pullRequestReview: { id } }] },
      });
    }
    entry.requested.delete(author);
    this.touch(raw);
    return id;
  }

  /** Answers inside a review thread; `thread` counts from 0 in the order the threads opened. */
  replyInThread(ref: Ref, thread: number, author: string, body: string): void {
    const raw = this.raw(ref);
    const target = this.thread(raw, thread);
    const first = target.comments.nodes[0];
    target.comments.nodes.push({
      author: this.author(author),
      body,
      createdAt: this.stamp(),
      url: `${raw.url}#discussion_r${++this.counter}`,
      replyTo: { id: `PRRC_${thread}` },
      pullRequestReview: first?.pullRequestReview ?? null,
    });
    this.touch(raw);
  }

  /** Resolving a thread leaves `updatedAt` alone as far as known (not verified). */
  resolveThread(ref: Ref, thread: number, by: string): void {
    const target = this.thread(this.raw(ref), thread);
    target.isResolved = true;
    target.resolvedBy = { login: by };
  }

  dismissReview(ref: Ref, actor: string, reviewer: string): void {
    const raw = this.raw(ref);
    for (const r of raw.reviews?.nodes ?? []) if (r.author?.login === reviewer) r.state = "DISMISSED";
    this.event(raw, { __typename: "ReviewDismissedEvent", actor: this.author(actor), url: `${raw.url}#event-${++this.counter}`, review: { author: { login: reviewer } } });
    this.touch(raw);
  }

  markReady(ref: Ref, actor: string): void {
    const raw = this.raw(ref);
    raw.isDraft = false;
    this.event(raw, { __typename: "ReadyForReviewEvent", actor: this.author(actor), url: `${raw.url}#event-${++this.counter}` });
    this.touch(raw);
  }

  convertToDraft(ref: Ref, actor: string): void {
    const raw = this.raw(ref);
    raw.isDraft = true;
    this.event(raw, { __typename: "ConvertToDraftEvent", actor: this.author(actor), url: `${raw.url}#event-${++this.counter}` });
    this.touch(raw);
  }

  forcePush(ref: Ref, actor: string): void {
    const raw = this.raw(ref);
    this.event(raw, { __typename: "HeadRefForcePushedEvent", actor: this.author(actor) });
    this.touch(raw);
  }

  enableAutoMerge(ref: Ref, actor: string): void {
    const raw = this.raw(ref);
    this.event(raw, { __typename: "AutoMergeEnabledEvent", actor: this.author(actor) });
    this.touch(raw);
  }

  commit(ref: Ref): void {
    const raw = this.raw(ref);
    (raw.commitItems ??= { nodes: [] }).nodes.push({ __typename: "PullRequestCommit", commit: { committedDate: this.stamp() } });
    this.touch(raw);
  }

  /** Merges a pull request: a `MergedEvent`, then the `ClosedEvent` GitHub adds right after. */
  merge(ref: Ref, actor: string): void {
    const raw = this.raw(ref);
    this.event(raw, { __typename: "MergedEvent", actor: this.author(actor), url: `${raw.url}#event-${++this.counter}` });
    raw.merged = true;
    this.close(ref, actor);
  }

  /** Closes an item; for issues `reason` is "COMPLETED", "NOT_PLANNED" or "DUPLICATE". */
  close(ref: Ref, actor: string, reason: string | null = ref.kind === "issue" ? "COMPLETED" : null): void {
    const raw = this.raw(ref);
    raw.closed = true;
    raw.closedAt = this.stamp();
    this.event(raw, { __typename: "ClosedEvent", actor: this.author(actor), url: `${raw.url}#event-${++this.counter}`, stateReason: reason });
    this.touch(raw);
  }

  /** @throws Error for a merged pull request, like GitHub. */
  reopen(ref: Ref, actor: string): void {
    const raw = this.raw(ref);
    if (raw.merged) throw new Error("Could not resolve to a reopenable pull request: it is merged");
    raw.closed = false;
    raw.closedAt = null;
    this.event(raw, { __typename: "ReopenedEvent", actor: this.author(actor) });
    this.touch(raw);
  }

  /** A pull request that closes `issue` when merged; it shows as linked until it closes. */
  linkPullRequest(issue: Ref, pr: Ref, actor: string): void {
    const raw = this.raw(issue);
    const target = this.raw(pr);
    (raw.closedByPullRequestsReferences ??= { nodes: [] }).nodes.push({ number: target.number, url: target.url, isDraft: target.isDraft ?? false, author: target.author ? { login: target.author.login } : null });
    this.event(raw, { __typename: "ConnectedEvent", actor: this.author(actor), subject: { number: raw.number, url: raw.url }, source: { number: target.number, url: target.url } });
    this.touch(raw);
  }

  markDuplicate(issue: Ref, canonical: Ref, actor: string): void {
    const raw = this.raw(issue);
    const target = this.raw(canonical);
    this.event(raw, { __typename: "MarkedAsDuplicateEvent", actor: this.author(actor), canonical: { number: target.number, url: target.url } });
    this.touch(raw);
  }

  /** Places the item on a board. Moving it later does not change `updatedAt`, as on GitHub. */
  setBoard(ref: Ref, { project = "Roadmap", status = null, sprint = null, fields = [] }: BoardPlace): void {
    const entry = this.entry(ref);
    const values: BoardItem["fieldValues"]["nodes"] = [];
    if (status) values.push({ name: status, color: "BLUE", field: { id: "F_status", name: "Status" } });
    if (sprint) values.push({ title: sprint, field: { id: "F_sprint", name: "Sprint" } });
    for (const f of fields) values.push({ name: f.value, color: "GRAY", field: { id: `F_${f.name}`, name: f.name } });
    entry.boards = [...entry.boards.filter((b) => b.project?.title !== project), { project: { id: `PVT_${project}`, title: project }, fieldValues: { nodes: values } }];
  }

  rename(ref: Ref, title: string): void {
    const raw = this.raw(ref);
    raw.title = title;
    this.touch(raw);
  }

  raw(ref: Ref): RawItem {
    return this.entry(ref).raw;
  }

  entry(ref: Ref | string): Entry {
    const id = typeof ref === "string" ? ref : ref.id;
    const found = this.entries.get(id);
    if (!found) throw new Error(`No item ${id} in the simulated world`);
    return found;
  }

  /** The reference to an item by node id, e.g. from a request. */
  refOf(id: string): Ref {
    return { id, kind: this.entry(id).raw.__typename === "PullRequest" ? "pr" : "issue" };
  }

  author(login: string): RawAuthor {
    const bot = login.endsWith("[bot]");
    const name = bot ? login.slice(0, -5) : login;
    return { login: name, __typename: bot ? "Bot" : "User", avatarUrl: avatarUrl(name) };
  }

  private reviewer(name: string): { login?: string; slug?: string } {
    return name.startsWith("team:") ? { slug: name.slice(5) } : { login: name };
  }

  private thread(raw: RawItem, index: number): Thread {
    const found = raw.reviewThreads?.nodes[index];
    if (!found) throw new Error(`No review thread ${index} on ${raw.url}`);
    return found;
  }

  private event(raw: RawItem, event: RawEvent): void {
    const target = raw.__typename === "PullRequest" ? (raw.timelineItems ??= { nodes: [] }) : (raw.assignments ??= { nodes: [] });
    target.nodes.push({ createdAt: this.stamp(), ...event });
  }

  private touch(raw: RawItem): void {
    raw.updatedAt = this.stamp();
  }

  private open(kind: Ref["kind"], draft: Draft & { ago?: number }): Ref {
    const repo = draft.repo ?? `${this.orgs[0]}/app`;
    const number = (this.numbers.get(repo) ?? 0) + 1;
    this.numbers.set(repo, number);
    const id = `${kind === "pr" ? "PR" : "I"}_${++this.counter}`;
    const at = this.stamp(-(draft.ago ?? 0));
    const raw: RawItem = {
      __typename: kind === "pr" ? "PullRequest" : "Issue",
      id,
      number,
      title: draft.title ?? (kind === "pr" ? "Add export" : "Something is off"),
      url: `https://github.com/${repo}/${kind === "pr" ? "pull" : "issues"}/${number}`,
      createdAt: at,
      updatedAt: at,
      body: draft.body ?? "",
      closed: false,
      closedAt: null,
      author: this.author(draft.author ?? "alice"),
      repository: { nameWithOwner: repo },
      labels: { nodes: draft.labels ?? [] },
      assignees: { nodes: (draft.assignees ?? []).map((login) => ({ login })) },
      comments: { nodes: [] },
    };
    if (kind === "pr") {
      Object.assign(raw, {
        isDraft: draft.draft ?? false,
        merged: false,
        baseRefName: draft.base ?? "main",
        headRefName: draft.head ?? `feature-${number}`,
        mergeable: draft.conflicts ? "CONFLICTING" : "MERGEABLE",
        additions: draft.additions ?? 12,
        deletions: draft.deletions ?? 3,
        timelineItems: { nodes: [] },
        commitItems: { nodes: [] },
        reviews: { nodes: [] },
        reviewThreads: { nodes: [] },
      });
    } else {
      Object.assign(raw, { assignments: { nodes: [] }, closedByPullRequestsReferences: { nodes: [] }, issueType: draft.type ? { name: draft.type, color: TYPE_COLORS[draft.type] ?? "GRAY" } : null });
    }
    this.entries.set(id, { raw, requested: new Set(), boards: [] });
    return { id, kind };
  }
}
