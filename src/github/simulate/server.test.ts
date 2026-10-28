import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RateLimitError, lastBudget, missingScopes, tokenScopes } from "../client";
import { addComment, assignSelf, setOpen, unassignSelf } from "../comment";
import { fetchItem, fetchItems, fetchItemsById, fetchOrgRepos, fetchViewer } from "../fetch";
import { installSimulator } from "./server";
import { GitHubSimulator } from "./world";

const DAY = 86_400_000;
let world: GitHubSimulator;
let restore: () => void;

beforeEach(() => {
  world = new GitHubSimulator({ viewer: "octocat", orgs: ["octo-org"] });
  restore = installSimulator(world);
});
afterEach(() => restore());

const fetchAll = (options: Parameters<typeof fetchItems>[2] = {}) => fetchItems("t", ["octo-org"], { me: "octocat", boards: false, now: world.now, ...options });

describe("searching the world", () => {
  it("finds what involves the viewer, and nothing else", async () => {
    const assigned = world.issue({ assignees: ["octocat"] });
    const mentioned = world.issue();
    world.comment(mentioned, "alice", "@octocat what do you think?");
    world.issue({ title: "Unrelated" });

    const items = await fetchAll();

    expect(items.map((i) => i.id).sort()).toEqual([assigned.id, mentioned.id].sort());
  });

  it("keeps to the watched owners", async () => {
    world.issue({ repo: "other-org/app", assignees: ["octocat"] });
    const mine = world.issue({ assignees: ["octocat"] });

    expect((await fetchAll()).map((i) => i.id)).toEqual([mine.id]);
  });

  it("finds a pull request that asks for the viewer's review, and drops it once they reviewed", async () => {
    const pr = world.pullRequest();
    world.requestReview(pr, "alice", "octocat");
    expect((await fetchAll())[0].reasons).toContain("review");

    world.review(pr, "octocat", "APPROVED");
    expect((await fetchAll())[0].reasons).not.toContain("review");
  });

  it("does not match a team request to the viewer", async () => {
    const pr = world.pullRequest();
    world.requestReview(pr, "alice", "team:core");

    expect(await fetchAll()).toEqual([]);
  });

  it("returns closed items only inside the window", async () => {
    const recent = world.issue({ assignees: ["octocat"] });
    const old = world.issue({ assignees: ["octocat"] });
    world.close(old, "alice");
    world.advance(10 * DAY);
    world.close(recent, "alice");

    const items = await fetchAll({ closedDays: 7 });

    expect(items.map((i) => i.id)).toEqual([recent.id]);
  });

  it("returns only items updated since a delta's start", async () => {
    const quiet = world.issue({ assignees: ["octocat"] });
    const busy = world.issue({ assignees: ["octocat"] });
    const since = new Date(world.now.getTime() + 60_000);
    world.advance(2 * 60_000);
    world.comment(busy, "alice", "ping");

    const delta = await fetchAll({ since });

    expect(delta.map((i) => i.id)).toEqual([busy.id]);
    expect(quiet.id).not.toBe(busy.id);
  });

  it("pages through more hits than one page holds", async () => {
    for (let i = 0; i < 7; i++) world.issue({ assignees: ["octocat"] });

    expect(await fetchAll({ pageSize: 3 })).toHaveLength(7);
  });
});

describe("what a request costs", () => {
  it("charges a page of 50 with 19 points and a page of 20 with 7, a single item 1", async () => {
    const issue = world.issue({ assignees: ["octocat"] });
    await fetchAll({ pageSize: 50 });
    await fetchAll({ pageSize: 20 });
    await fetchItem("t", issue.id, { me: "octocat", boards: false });

    const searches = world.requests.filter((r) => r.op === "search").map((r) => r.cost);
    expect(searches).toEqual([19, 19, 7, 7]);
    expect(world.requests.at(-1)).toEqual({ op: "node", cost: 1 });
  });

  it("reports the budget in the headers the app reads", async () => {
    world.issue({ assignees: ["octocat"] });
    await fetchAll({ pageSize: 20 });

    expect(lastBudget()?.remaining).toBe(5000 - 14);
    expect(lastBudget()?.limit).toBe(5000);
  });

  it("refuses with a RateLimitError once the budget is gone, until its reset", async () => {
    world.budget.remaining = 0;

    const error = await fetchViewer("t").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).until).toEqual(world.budget.resetAt);
  });

  it("opens a new hour of budget after the reset", async () => {
    world.budget.remaining = 0;
    world.advance(3_600_001);

    await expect(fetchViewer("t")).resolves.toMatchObject({ login: "octocat" });
  });
});

describe("writing to the world", () => {
  it("shows a posted comment in the next fetch of the item", async () => {
    const issue = world.issue({ assignees: ["octocat"] });

    const url = await addComment("t", issue.id, "On it.");
    const item = await fetchItem("t", issue.id, { me: "octocat", boards: false });

    expect(url).toContain("#issuecomment-");
    expect(item?.comments.map((c) => [c.author, c.body])).toEqual([["octocat", "On it."]]);
  });

  it("loads many items by id in one request, leaving out those that are gone", async () => {
    const a = world.issue({ title: "First", assignees: ["octocat"] });
    const b = world.issue({ title: "Second" });

    const items = await fetchItemsById("t", [a.id, "gone", b.id], { me: "octocat", boards: false });

    expect(items.map((i) => i.title)).toEqual(["First", "Second"]);
    expect(items[0].reasons).toEqual(["assigned"]);
  });

  it("assigns and unassigns the viewer without touching others", async () => {
    const issue = world.issue({ assignees: ["alice"] });

    expect(await assignSelf("t", issue.id)).toEqual(["alice", "octocat"]);
    expect(await assignSelf("t", issue.id)).toEqual(["alice", "octocat"]);
    expect(await unassignSelf("t", issue.id)).toEqual(["alice"]);
  });

  it("closes with a reason, reopens, and refuses to reopen a merged pull request", async () => {
    const issue = world.issue();
    const pr = world.pullRequest();

    await setOpen("t", { id: issue.id, kind: "issue" }, "close", "NOT_PLANNED");
    expect(world.raw(issue)).toMatchObject({ closed: true });
    expect(world.raw(issue).assignments?.nodes.at(-1)).toMatchObject({ __typename: "ClosedEvent", stateReason: "NOT_PLANNED" });
    await setOpen("t", { id: issue.id, kind: "issue" }, "reopen");
    expect(world.raw(issue).closed).toBe(false);

    world.merge(pr, "alice");
    await expect(setOpen("t", { id: pr.id, kind: "pr" }, "reopen")).rejects.toThrow("merged");
  });

  it("fails one operation with GitHub's message, then works again", async () => {
    const issue = world.issue();
    world.fail("addComment", "Conversation is locked");

    await expect(addComment("t", issue.id, "hi")).rejects.toThrow("Conversation is locked");
    await expect(addComment("t", issue.id, "hi")).resolves.toContain("#issuecomment-");
  });

  it("rejects a query it does not know instead of answering wrongly", async () => {
    const { graphql } = await import("../client");

    await expect(graphql("t", "{ rateLimit { cost } }")).rejects.toThrow("does not know this query");
  });
});

describe("requests that are not GitHub's", () => {
  it("go where they were going, so the shell's own calls keep working", async () => {
    const response = await fetch("data:text/plain,hello");

    expect(await response.text()).toBe("hello");
    expect(world.requests).toEqual([]);
  });
});

describe("the account around the items", () => {
  it("fails at the network while offline", async () => {
    world.offline = true;

    await expect(fetchViewer("t")).rejects.toThrow("Failed to fetch");
  });

  it("lists the viewer, their organizations and the repositories of an owner", async () => {
    world.issue({ repo: "octo-org/app" });
    world.issue({ repo: "octo-org/docs" });

    expect((await fetchViewer("t")).orgs.map((o) => o.login)).toEqual(["octo-org"]);
    expect((await fetchOrgRepos("t", "octo-org")).sort()).toEqual(["app", "docs"]);
    expect(await fetchOrgRepos("t", "nobody")).toEqual([]);
  });

  it("reports the token's scopes, and a missing one", async () => {
    world.scopes = ["repo", "read:org"];

    expect(missingScopes(await tokenScopes("t"))).toEqual(["project"]);
  });

  it("answers without boards when the token lacks the project scope", async () => {
    world.scopes = ["repo", "read:org"];
    const issue = world.issue({ assignees: ["octocat"] });
    world.setBoard(issue, { status: "Backlog" });

    const items = await fetchItems("t", ["octo-org"], { me: "octocat", boards: true });

    expect(items[0].boards).toEqual([]);
  });
});
