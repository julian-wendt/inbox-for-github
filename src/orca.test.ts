import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createArgs, openInOrca, orcaFailure, orcaRepoFor, orcaRepoIds, orcaResult, worktreeFor, type OrcaWorktree } from "./orca";
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
