import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { addToOrca, checkoutFor, cloneArgs, createArgs, isRepoName, openInOrca, orcaFailure, orcaRepoFor, orcaRepoIds, orcaResult, pathText, repoHome, worktreeFor, type OrcaWorktree } from "./orca";
import type { Checkout } from "./orca";
import type { PullState } from "./model";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const ok = (result: unknown) => JSON.stringify({ ok: true, result });
const pull = (head: string): PullState => ({ base: "main", head, additions: 0, deletions: 0, conflicts: false });

function worktree(over: Partial<OrcaWorktree>): OrcaWorktree {
  return { id: "r::/w", branch: "refs/heads/main", displayName: "main", linkedIssue: null, linkedPR: null, isArchived: false, ...over };
}

describe("orcaResult", () => {
  it("returns the result of a successful answer", () => {
    expect(orcaResult(ok({ repos: [] }))).toEqual({ repos: [] });
  });

  it("throws Orca's readable explanation of a failure", () => {
    const failed = JSON.stringify({ ok: false, error: { code: "selector_not_found", message: "selector_not_found", data: { nextSteps: ["No Orca workspace matched."] } } });
    expect(() => orcaResult(failed)).toThrow("No Orca workspace matched.");
  });

  it("falls back to the error code without an explanation", () => {
    expect(() => orcaResult(JSON.stringify({ ok: false, error: { message: "runtime_unavailable" } }))).toThrow("runtime_unavailable");
  });
});

describe("orcaFailure", () => {
  it("reads Orca's explanation from a failed call, and keeps other text as it is", () => {
    const failed = JSON.stringify({ ok: false, error: { message: "x", data: { nextSteps: ["Orca is not running."] } } });
    expect(orcaFailure(failed).message).toBe("Orca is not running.");
    expect(orcaFailure("No such file or directory (os error 2)").message).toBe("No such file or directory (os error 2)");
  });
});

describe("orcaRepoIds", () => {
  it("keys GitHub repos by owner/name in lower case and skips others", () => {
    const ids = orcaRepoIds(
      ok({
        repos: [
          { id: "a", gitRemoteIdentity: { canonicalKey: "github.com/Julian-Wendt/Inbox" } },
          { id: "b", gitRemoteIdentity: { canonicalKey: "gitlab.com/o/r" } },
          { id: "c", gitRemoteIdentity: null },
        ],
      }),
    );
    expect([...ids]).toEqual([["julian-wendt/inbox", "a"]]);
    expect(orcaRepoFor(ids, "julian-wendt/INBOX")).toBe("a");
    expect(orcaRepoFor(ids, "o/r")).toBeUndefined();
  });
});

describe("worktreeFor", () => {
  it("finds an issue's worktree by its linked number", () => {
    const linked = worktree({ id: "r::/7", linkedIssue: 7 });
    expect(worktreeFor([worktree({ linkedPR: 7 }), linked], { kind: "issue", number: 7, pull: null, title: "Fix it" })).toBe(linked);
  });

  it("finds a pull request's worktree by its link first, then by its head branch", () => {
    const byBranch = worktree({ id: "r::/b", branch: "refs/heads/feat/x" });
    const byLink = worktree({ id: "r::/l", linkedPR: 42 });
    expect(worktreeFor([byBranch, byLink], { kind: "pr", number: 42, pull: pull("feat/x"), title: "Add x" })).toBe(byLink);
    expect(worktreeFor([byBranch], { kind: "pr", number: 42, pull: pull("feat/x"), title: "Add x" })).toBe(byBranch);
  });

  it("ignores archived worktrees", () => {
    expect(worktreeFor([worktree({ linkedIssue: 7, isArchived: true })], { kind: "issue", number: 7, pull: null, title: "Fix it" })).toBeUndefined();
  });
});

describe("createArgs", () => {
  it("links a pull request and names the worktree after it", () => {
    expect(createArgs("r", { kind: "pr", number: 42 })).toEqual(["worktree", "create", "--repo", "id:r", "--name", "pr-42", "--pr", "42", "--no-parent", "--activate"]);
  });
});

describe("openInOrca", () => {
  const calls = () => vi.mocked(invoke).mock.calls.map(([command, args]) => (command === "orca" ? (args as { args: string[] }).args.slice(0, 2).join(" ") : command));

  beforeEach(() => vi.mocked(invoke).mockReset());

  function answer(worktrees: OrcaWorktree[], terminals: { handle: string }[] = []) {
    vi.mocked(invoke).mockImplementation((command, args) => {
      if (command !== "orca") return Promise.resolve();
      const [group, verb] = (args as { args: string[] }).args;
      if (group === "worktree" && verb === "list") return Promise.resolve(ok({ worktrees }));
      if (group === "terminal" && verb === "list") return Promise.resolve(ok({ terminals }));
      if (group === "worktree" && verb === "create") return Promise.resolve(ok({ worktree: { id: "r::/issue-7" } }));
      return Promise.resolve(ok({}));
    });
  }

  it("creates a worktree when none belongs to the item", async () => {
    answer([]);
    await expect(openInOrca("r", { kind: "issue", number: 7, pull: null, title: "Fix it" })).resolves.toBe("created");
    expect(calls()).toEqual(["worktree list", "worktree create", "worktree set", "orca_activate"]);
    expect(vi.mocked(invoke).mock.calls[2][1]).toEqual({ args: ["worktree", "set", "--worktree", "id:r::/issue-7", "--display-name", "Fix it"] });
  });

  it("names an existing worktree after the item while it still has its short name", async () => {
    answer([worktree({ linkedIssue: 7, displayName: "issue-7" })], [{ handle: "term_1" }]);
    await openInOrca("r", { kind: "issue", number: 7, pull: null, title: "Fix it" });
    expect(calls()).toEqual(["worktree list", "worktree set", "terminal list", "terminal switch", "orca_activate"]);
  });

  it("still opens the worktree when naming it fails", async () => {
    answer([]);
    const answered = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation((command, args) => ((args as { args?: string[] } | undefined)?.args?.[1] === "set" ? Promise.resolve(JSON.stringify({ ok: false, error: { message: "nope" } })) : answered(command, args)));
    await expect(openInOrca("r", { kind: "issue", number: 7, pull: null, title: "Fix it" })).resolves.toBe("created");
  });

  it("switches to a terminal of the existing worktree", async () => {
    answer([worktree({ linkedIssue: 7 })], [{ handle: "term_1" }]);
    await expect(openInOrca("r", { kind: "issue", number: 7, pull: null, title: "Fix it" })).resolves.toBe("revealed");
    expect(calls()).toEqual(["worktree list", "terminal list", "terminal switch", "orca_activate"]);
  });

  it("opens a terminal in an existing worktree that has none", async () => {
    answer([worktree({ linkedIssue: 7 })]);
    await openInOrca("r", { kind: "issue", number: 7, pull: null, title: "Fix it" });
    expect(calls()).toEqual(["worktree list", "terminal list", "terminal create", "orca_activate"]);
  });
});

describe("repoHome", () => {
  it("is the folder most of Orca's repos sit in", () => {
    const repos = [{ id: "a", path: "/u/Repos/a" }, { id: "b", path: "/u/Work/b" }, { id: "c", path: "/u/Work/c/" }];
    expect(repoHome(ok({ repos }))).toBe("/u/Work");
  });

  it("takes the first folder on a tie", () => {
    expect(repoHome(ok({ repos: [{ id: "a", path: "/u/Repos/a" }, { id: "b", path: "/u/Work/b" }] }))).toBe("/u/Repos");
  });

  it("is null while Orca has no repo with a path", () => {
    expect(repoHome(ok({ repos: [{ id: "a" }] }))).toBeNull();
  });
});

describe("addToOrca", () => {
  const listed = (keys: string[]) => ok({ repos: keys.map((key, i) => ({ id: `id-${i}`, path: `/u/Repos/${key.split("/")[2]}`, gitRemoteIdentity: { canonicalKey: key } })) });
  const orcaCalls = () => vi.mocked(invoke).mock.calls.filter(([command]) => command === "orca").map(([, args]) => (args as { args: string[] }).args);

  beforeEach(() => vi.mocked(invoke).mockReset());

  function answer(checkouts: Checkout[], after: string[]) {
    vi.mocked(invoke).mockImplementation((command, args) => {
      if (command === "repo_checkouts") return Promise.resolve(["/u/Repos", checkouts]);
      if (command !== "orca") return Promise.resolve();
      return Promise.resolve((args as { args: string[] }).args[0] === "repo" && (args as { args: string[] }).args[1] === "list" ? listed(["github.com/o/known", ...after]) : ok({}));
    });
  }

  it("adds the checkout in the repo folder whose origin is the repo", async () => {
    answer([{ path: "/u/Repos/other", origin: "https://github.com/o/other.git" }, { path: "/u/Repos/my-app", origin: "git@github.com:Octo/App.git" }], ["github.com/octo/app"]);
    await expect(addToOrca("octo/app", "~/Repos")).resolves.toEqual({ id: "id-1", how: "added", path: "/u/Repos/my-app" });
    expect(orcaCalls()).toEqual([["repo", "add", "--path", "/u/Repos/my-app"], ["repo", "list"]]);
    expect(vi.mocked(invoke).mock.calls[0]).toEqual(["repo_checkouts", { folder: "~/Repos" }]);
  });

  it("clones the repo into the folder when no checkout there has it as origin, a fork included", async () => {
    answer([{ path: "/u/Repos/app", origin: "https://github.com/me/app.git" }], ["github.com/octo/app"]);
    await expect(addToOrca("octo/app", "~/Repos")).resolves.toEqual({ id: "id-1", how: "cloned", path: "/u/Repos/app" });
    expect(orcaCalls()).toEqual([cloneArgs("octo/app", "/u/Repos"), ["repo", "list"]]);
  });

  it("fails when Orca still lacks the repo afterwards", async () => {
    answer([], []);
    await expect(addToOrca("octo/app", "~/Repos")).rejects.toThrow("Orca has no octo/app after adding it");
  });

  it("refuses a name that is not a GitHub repo, without calling anything", async () => {
    answer([], []);
    await expect(addToOrca("octo/..", "~/Repos")).rejects.toThrow("not a GitHub repository");
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });
});

describe("checkoutFor", () => {
  it("knows GitHub's https and ssh remotes, with and without .git, in any case", () => {
    const at = (origin: string) => checkoutFor([{ path: "/p", origin }], "octo/app")?.path;
    expect(at("https://github.com/octo/app")).toBe("/p");
    expect(at("https://token@github.com/Octo/App.git/")).toBe("/p");
    expect(at("ssh://git@github.com/octo/app.git")).toBe("/p");
    expect(at("git@github.com:octo/app.git")).toBe("/p");
    expect(at("https://gitlab.com/octo/app.git")).toBeUndefined();
    expect(at("https://github.com/octo/app-two.git")).toBeUndefined();
  });
});

describe("isRepoName", () => {
  it("takes owner/name of GitHub's letters and rejects paths and flags around it", () => {
    expect(isRepoName("octo-org/my.app_2")).toBe(true);
    expect(isRepoName("octo/..")).toBe(false);
    expect(isRepoName("octo/a/b")).toBe(false);
    expect(isRepoName("octo/a b")).toBe(false);
  });
});

describe("cloneArgs", () => {
  it("clones the GitHub repo into the folder on this Mac", () => {
    expect(cloneArgs("octo/app", "/u/Repos")).toEqual(["project", "setup-clone", "--project", "github:octo/app", "--host", "local", "--url", "https://github.com/octo/app.git", "--destination", "/u/Repos"]);
  });
});

describe("pathText", () => {
  it("writes the home folder as ~ and leaves other paths alone", () => {
    expect(pathText("/Users/me/Repos")).toBe("~/Repos");
    expect(pathText("/Users/me")).toBe("~");
    expect(pathText("/opt/src")).toBe("/opt/src");
  });
});
