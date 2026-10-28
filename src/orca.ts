import { invoke } from "@tauri-apps/api/core";
import { log } from "./log";
import type { Item } from "./model";

/** The parts of an Orca worktree used to find the one that belongs to an item. */
export interface OrcaWorktree {
  /** Orca's worktree id, `<repo-id>::<path>`. */
  id: string;
  /** The full ref, e.g. "refs/heads/feat/x". */
  branch: string;
  /** The name Orca's sidebar shows. */
  displayName: string;
  linkedIssue: number | null;
  linkedPR: number | null;
  isArchived: boolean;
}

/** What `openInOrca` did: brought an existing worktree forward, or made a new one. */
export type OrcaOutcome = "revealed" | "created";

type Target = Pick<Item, "kind" | "number" | "pull" | "title">;

/**
 * Reads the `result` of an Orca CLI answer. Orca wraps every `--json` answer in
 * `{ ok, result }`, and a failure in `{ ok: false, error: { code, message, data } }`, where
 * `data.nextSteps[0]` is the sentence a person can read.
 *
 * @param json  The CLI's output.
 * @returns     The `result` object.
 * @throws      An `Error` with Orca's explanation when `ok` is false.
 *
 * @example
 *   orcaResult<{ repos: unknown[] }>('{"ok":true,"result":{"repos":[]}}'); // { repos: [] }
 */
export function orcaResult<T>(json: string): T {
  const answer = JSON.parse(json) as { ok: boolean; result?: T; error?: { message?: string; data?: { nextSteps?: string[] } } };
  if (answer.ok && answer.result !== undefined) return answer.result;
  throw new Error(answer.error?.data?.nextSteps?.[0] ?? answer.error?.message ?? json);
}

/**
 * Turns the text of a failed CLI call into an `Error`. Orca answers a failure in JSON on stdout
 * and exits with 1; the shell passes that text on, or the system's error when Orca is missing.
 *
 * @param text  What the `orca` command rejected with.
 *
 * @example
 *   orcaFailure("No such file or directory (os error 2)").message; // the same text
 */
export function orcaFailure(text: string): Error {
  try {
    orcaResult(text);
  } catch (e) {
    if (e instanceof Error && !(e instanceof SyntaxError)) return e;
  }
  return new Error(text);
}

/**
 * Maps each GitHub repo registered in Orca to Orca's repo id, keyed by "owner/name" in lower
 * case. Repos without a GitHub remote are left out.
 *
 * @param json  The output of `orca repo list --json`.
 *
 * @example
 *   orcaRepoIds(output).get("julian-wendt/inbox-for-github"); // "da7a86b6-…"
 */
export function orcaRepoIds(json: string): Map<string, string> {
  const ids = new Map<string, string>();
  for (const repo of reposOf(json)) {
    const key = repo.gitRemoteIdentity?.canonicalKey?.toLowerCase();
    if (key?.startsWith("github.com/")) ids.set(key.slice("github.com/".length), repo.id);
  }
  return ids;
}

/** What Orca knows: its GitHub repos (see `orcaRepoIds`) and where a missing one goes (see `repoHome`). */
export interface OrcaRepos {
  ids: Map<string, string>;
  home: string | null;
}

/**
 * The folder a repo Orca lacks is cloned into: the one most of Orca's repos sit in, the first
 * of them on a tie. Null while Orca has no repo with a path.
 *
 * @param json  The output of `orca repo list --json`.
 *
 * @example
 *   repoHome(output); // "/Users/me/Repos" for repos at /Users/me/Repos/a and /Users/me/Repos/b
 */
export function repoHome(json: string): string | null {
  const counts = new Map<string, number>();
  for (const { path } of reposOf(json)) {
    const parent = path?.replace(/\/+$/, "").replace(/\/[^/]+$/, "");
    if (parent) counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [parent, n] of counts) if (best === null || n > counts.get(best)!) best = parent;
  return best;
}

type OrcaRepo = { id: string; path?: string; gitRemoteIdentity?: { canonicalKey?: string } | null };

function reposOf(json: string): OrcaRepo[] {
  return orcaResult<{ repos: OrcaRepo[] }>(json).repos;
}

/**
 * The Orca repo id for a GitHub repo, if Orca knows it.
 *
 * @param ids   The map from `orcaRepoIds`.
 * @param repo  The item's repo, "owner/name" in any case.
 *
 * @example
 *   orcaRepoFor(ids, "Julian-Wendt/inbox-for-github"); // "da7a86b6-…"
 */
export function orcaRepoFor(ids: Map<string, string>, repo: string): string | undefined {
  return ids.get(repo.toLowerCase());
}

/**
 * The worktree an item is worked on in: the one Orca linked to its number, or for a pull
 * request the one on its head branch. Archived worktrees do not count.
 *
 * @param worktrees  The repo's worktrees from `orca worktree list --json`.
 * @param item       The issue or pull request.
 *
 * @example
 *   worktreeFor(worktrees, { kind: "pr", number: 42, pull: { head: "feat/x", … } });
 */
export function worktreeFor(worktrees: OrcaWorktree[], item: Target): OrcaWorktree | undefined {
  const live = worktrees.filter((w) => !w.isArchived);
  if (item.kind === "issue") return live.find((w) => w.linkedIssue === item.number);
  const head = item.pull ? `refs/heads/${item.pull.head}` : null;
  return live.find((w) => w.linkedPR === item.number) ?? live.find((w) => w.branch === head);
}

/**
 * The short name a new worktree gets for its folder and branch, e.g. "pr-42"; Orca shows it
 * until the display name is set to the item's title.
 *
 * @example
 *   worktreeName({ kind: "issue", number: 7 }); // "issue-7"
 */
export function worktreeName(item: Pick<Item, "kind" | "number">): string {
  return `${item.kind}-${item.number}`;
}

/**
 * The arguments for `orca worktree create` that make a worktree linked to the item and show it
 * in Orca, named by `worktreeName`. `--no-parent` keeps it top-level: Orca otherwise nests it
 * under the worktree the app was started from.
 *
 * @param repoId  Orca's repo id.
 * @param item    The issue or pull request.
 *
 * @example
 *   createArgs("da7a…", { kind: "issue", number: 7 });
 *   // ["worktree", "create", "--repo", "id:da7a…", "--name", "issue-7", "--issue", "7", "--no-parent", "--activate"]
 */
export function createArgs(repoId: string, item: Pick<Item, "kind" | "number">): string[] {
  const link = item.kind === "pr" ? "--pr" : "--issue";
  return ["worktree", "create", "--repo", `id:${repoId}`, "--name", worktreeName(item), link, String(item.number), "--no-parent", "--activate"];
}

/**
 * A folder as people read it, with the home folder as "~".
 *
 * @example
 *   pathText("/Users/me/Repos"); // "~/Repos"
 */
export function pathText(path: string): string {
  return path.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
}

function orca(args: string[]): Promise<string> {
  return invoke<string>("orca", { args }).catch((e: unknown) => {
    throw orcaFailure(String(e));
  });
}

/**
 * Reads which GitHub repos Orca knows. Fails when Orca is not installed or its runtime cannot
 * be reached.
 *
 * @example
 *   const ids = await loadOrcaRepos();
 */
export async function loadOrcaRepos(): Promise<OrcaRepos> {
  const json = await orca(["repo", "list"]);
  return { ids: orcaRepoIds(json), home: repoHome(json) };
}

/** A git checkout directly inside the repo folder, as the shell's `repo_checkouts` lists it. */
export interface Checkout {
  path: string;
  /** The URL of its `origin` remote. */
  origin: string;
}

/** How `addToOrca` brought a repo in: from a checkout in the repo folder, or by cloning it there. */
export type Added = { id: string; how: "added" | "cloned"; path: string };

/**
 * Brings a GitHub repo Orca lacks into Orca. It looks in the repo folder for a checkout whose
 * `origin` is that repo (`checkoutFor`) and adds it (`repo add`); without one it clones the repo
 * into the folder (`project setup-clone`, which returns a repo Orca already has under that URL
 * instead). A folder whose origin is another repo, a fork included, is never added. Git's own
 * credentials do the cloning.
 *
 * @param repo    The item's repo, "owner/name".
 * @param folder  The repo folder: the setting, or `repoHome`; "~" stands for the home folder.
 * @returns       Orca's id for the repo, how it came in and its path.
 * @throws        When the name is not a GitHub repo name, the folder cannot be read, Orca fails,
 *                or Orca still lacks the repo.
 *
 * @example
 *   const { id, how } = await addToOrca("octo-org/app", "~/Repos"); // how: "added"
 */
export async function addToOrca(repo: string, folder: string): Promise<Added> {
  if (!isRepoName(repo)) throw new Error(`${repo} is not a GitHub repository`);
  const [home, checkouts] = await invoke<[string, Checkout[]]>("repo_checkouts", { folder }).catch((e: unknown) => {
    throw new Error(String(e));
  });
  const checkout = checkoutFor(checkouts, repo);
  orcaResult(await orca(checkout ? ["repo", "add", "--path", checkout.path] : cloneArgs(repo, home)));
  const id = orcaRepoFor((await loadOrcaRepos()).ids, repo);
  if (!id) throw new Error(`Orca has no ${repo} after adding it`);
  return { id, how: checkout ? "added" : "cloned", path: checkout?.path ?? `${home}/${repo.split("/")[1]}` };
}

/**
 * The checkout of a GitHub repo among `checkouts`: the one whose `origin` points at it, in
 * https or ssh form, with or without ".git", in any case.
 *
 * @example
 *   checkoutFor([{ path: "/u/Repos/app", origin: "git@github.com:Octo/App.git" }], "octo/app"); // that checkout
 */
export function checkoutFor(checkouts: Checkout[], repo: string): Checkout | undefined {
  return checkouts.find((c) => githubRepoOf(c.origin) === repo.toLowerCase());
}

/** The "owner/name" in lower case a GitHub remote URL points at, or null for other hosts. */
function githubRepoOf(url: string): string | null {
  const match = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
}

/** Whether `repo` is a GitHub "owner/name": letters, digits, ".", "_" and "-", and neither part "." or "..". */
export function isRepoName(repo: string): boolean {
  const parts = repo.split("/");
  return parts.length === 2 && parts.every((p) => /^[\w.-]+$/.test(p) && p !== "." && p !== "..");
}

/**
 * The arguments for `orca project setup-clone` that clone a GitHub repo into a folder below
 * `home` named like the repo, on this Mac.
 *
 * @example
 *   cloneArgs("octo-org/app", "/Users/me/Repos");
 *   // ["project", "setup-clone", "--project", "github:octo-org/app", "--host", "local", "--url", "https://github.com/octo-org/app.git", "--destination", "/Users/me/Repos"]
 */
export function cloneArgs(repo: string, home: string): string[] {
  return ["project", "setup-clone", "--project", `github:${repo}`, "--host", "local", "--url", `https://github.com/${repo}.git`, "--destination", home];
}

/** Shows the item's title in Orca's sidebar; a failure leaves the short name and is only logged. */
async function nameAfterTitle(worktreeId: string, item: Target): Promise<void> {
  try {
    orcaResult(await orca(["worktree", "set", "--worktree", `id:${worktreeId}`, "--display-name", item.title]));
  } catch (e) {
    log.debug("orca", { rename: `${item.kind}-${item.number}`, error: String(e) });
  }
}

/**
 * Opens an item in Orca: switches to a terminal of the worktree it is already worked on in
 * (opening one if it has none), or creates a worktree linked to it. A worktree the app created
 * shows the item's title in Orca, also one that still carries its short name from before.
 * Orca then comes to the front. Nothing is written to GitHub; Orca keeps the link in its own
 * metadata.
 *
 * @param repoId  Orca's repo id, from `orcaRepoFor`.
 * @param item    The issue or pull request.
 * @returns       Whether an existing worktree was shown or a new one created.
 *
 * @example
 *   const outcome = await openInOrca(repoId, current.item); // "revealed"
 */
export async function openInOrca(repoId: string, item: Target): Promise<OrcaOutcome> {
  const { worktrees } = orcaResult<{ worktrees: OrcaWorktree[] }>(await orca(["worktree", "list", "--repo", `id:${repoId}`, "--limit", "500"]));
  const existing = worktreeFor(worktrees, item);
  if (!existing) {
    const { worktree } = orcaResult<{ worktree?: { id: string } }>(await orca(createArgs(repoId, item)));
    if (worktree) await nameAfterTitle(worktree.id, item);
    await invoke("orca_activate");
    return "created";
  }
  if (existing.displayName === worktreeName(item)) await nameAfterTitle(existing.id, item);
  const selector = `id:${existing.id}`;
  const { terminals } = orcaResult<{ terminals: { handle: string }[] }>(await orca(["terminal", "list", "--worktree", selector]));
  const switchArgs = terminals.length > 0 ? ["terminal", "switch", "--terminal", terminals[0].handle] : ["terminal", "create", "--worktree", selector, "--focus"];
  orcaResult(await orca(switchArgs));
  await invoke("orca_activate");
  return "revealed";
}
