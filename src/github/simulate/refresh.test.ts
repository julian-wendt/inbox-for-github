import { describe, expect, it } from "vitest";
import { RateLimitError, lastBudget, pointsSpent } from "../client";
import { FULL_EVERY_MS } from "../delta";
import { DAY, HOUR, MINUTE, simulation } from "./vitest";

// Scenarios from TESTING.md: "API-Verbrauch", "Boards", "Offline".
const sim = simulation();

describe("API usage", () => {
  it("makes the first refresh full and the next ones deltas that cost a fraction", async () => {
    const { world, app } = sim;
    for (let i = 0; i < 5; i++) world.issue({ assignees: ["octocat"] });
    const spent = pointsSpent();

    const first = await app.refresh();
    world.advance(10 * MINUTE);
    await app.refresh();
    world.advance(10 * MINUTE);
    const quiet = await app.refresh();

    expect(first.kind).toBe("full");
    expect(quiet.kind).toBe("delta");
    expect(quiet.cost).toBe(28);
    expect(first.cost).toBeGreaterThan(quiet.cost);
    expect(pointsSpent() - spent).toBeGreaterThan(first.cost + quiet.cost);
  });

  it("shows the remaining budget and when it resets", async () => {
    const { world, app } = sim;
    world.issue({ assignees: ["octocat"] });

    const { cost } = await app.refresh();

    expect(lastBudget()).toMatchObject({ limit: 5000, remaining: 5000 - cost, resetAt: world.budget.resetAt });
  });

  it("fetches in full again after an hour", async () => {
    const { world, app } = sim;
    world.issue({ assignees: ["octocat"] });
    await app.refresh();

    world.advance(FULL_EVERY_MS - MINUTE);
    expect((await app.refresh()).kind).toBe("delta");
    world.advance(2 * MINUTE);

    expect((await app.refresh()).kind).toBe("full");
  });

  it("fetches in full when the organizations change", async () => {
    const { world, app } = sim;
    world.issue({ assignees: ["octocat"] });
    world.issue({ repo: "octo-labs/lab", assignees: ["octocat"] });
    await app.refresh();
    expect(app.items).toHaveLength(1);

    app.settings.orgs = ["octo-org", "octo-labs"];

    expect((await app.refresh()).kind).toBe("full");
    expect(app.items).toHaveLength(2);
  });

  it("shows a change made on GitHub after the next delta", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();

    world.advance(10 * MINUTE);
    world.comment(issue, "alice", "New comment");
    await app.refresh();

    expect(app.entry(issue).item.comments.map((c) => c.body)).toEqual(["New comment"]);
  });

  it("reaches back five minutes, so an item the search indexed late is not missed", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    world.advance(10 * MINUTE);
    await app.refresh();

    world.advance(-4 * MINUTE);
    world.comment(issue, "alice", "Written just before the last refresh");
    world.advance(4 * MINUTE);
    await app.refresh();

    expect(app.entry(issue).item.comments).toHaveLength(1);
  });

  it("does not see a board move or a withdrawn review request in a delta, only in the hourly full fetch", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    world.setBoard(issue, { status: "Backlog" });
    const pr = world.pullRequest();
    world.requestReview(pr, "alice", "octocat");
    await app.refresh();

    world.advance(10 * MINUTE);
    await app.refresh();
    world.advance(10 * MINUTE);
    world.setBoard(issue, { status: "In progress" });
    world.withdrawReviewRequest(pr, "alice", "octocat");
    await app.refresh();
    expect(app.entry(issue).item.boards[0].status).toBe("Backlog");
    expect(app.entry(pr).asks).toContain("review");

    world.advance(HOUR);
    await app.refresh();
    expect(app.entry(issue).item.boards[0].status).toBe("In progress");
    expect(app.items.map((i) => i.id)).not.toContain(pr.id);
  });

  it("drops closed items from a delta once they are older than the window", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    world.comment(issue, "alice", "@octocat");
    await app.refresh();
    world.close(issue, "alice");
    await app.refresh();
    expect(app.viewOf(issue)).toBe("done");

    world.advance(8 * DAY);
    await app.refresh();

    expect(app.items.map((i) => i.id)).not.toContain(issue.id);
  });

  it("stops at the rate limit with the time it ends, and works again after the reset", async () => {
    const { world, app } = sim;
    world.issue({ assignees: ["octocat"] });
    world.budget.remaining = 0;

    const error = await app.refresh().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).until).toEqual(world.budget.resetAt);
    world.advance(HOUR + MINUTE);
    await expect(app.refresh()).resolves.toMatchObject({ kind: "full" });
  });

  it("reloads one item for a single point when boards are off", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    app.settings.loadBoards = false;
    const before = world.requests.length;

    await app.reload(issue);

    expect(world.requests.slice(before)).toEqual([{ op: "node", cost: 1 }]);
  });
});

describe("Boards", () => {
  it("shows status and sprint, and costs less without them", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    world.setBoard(issue, { project: "Roadmap", status: "Backlog", sprint: "Sprint 2026-11", fields: [{ name: "Component", value: "API" }] });

    const withBoards = await app.refresh();
    expect(app.entry(issue).item.boards).toEqual([
      expect.objectContaining({ title: "Roadmap", status: "Backlog", sprint: "Sprint 2026-11", fields: expect.arrayContaining([expect.objectContaining({ name: "Component", value: "API" })]) as unknown }),
    ]);

    app.settings.loadBoards = false;
    world.advance(2 * HOUR);
    const without = await app.refresh();

    expect(app.entry(issue).item.boards).toEqual([]);
    expect(without.cost).toBeLessThan(withBoards.cost);
  });

  it("brings the boards back with the next full fetch after switching them on", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    world.setBoard(issue, { status: "Backlog", sprint: "Sprint 12" });
    app.settings.loadBoards = false;
    await app.refresh();

    app.settings.loadBoards = true;
    world.advance(2 * HOUR);
    await app.refresh();

    expect(app.entry(issue).item.boards[0]).toMatchObject({ status: "Backlog", sprint: "Sprint 12" });
  });

  it("leaves the items without boards when the token lacks the project scope", async () => {
    const { world, app } = sim;
    world.scopes = ["repo", "read:org"];
    const issue = world.issue({ assignees: ["octocat"] });
    world.setBoard(issue, { status: "Backlog" });

    await app.refresh();

    expect(app.viewOf(issue)).toBe("assigned");
    expect(app.entry(issue).item.boards).toEqual([]);
  });
});

describe("Offline", () => {
  it("keeps what it showed when a refresh fails, and catches up when the network is back", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    world.comment(issue, "alice", "While you were away");
    world.offline = true;

    await expect(app.refresh()).rejects.toThrow("Failed to fetch");
    expect(app.items).toHaveLength(1);
    expect(app.entry(issue).item.comments).toEqual([]);

    world.offline = false;
    await app.refresh();
    expect(app.entry(issue).item.comments).toHaveLength(1);
  });

  it("does not count failed requests against the budget", async () => {
    const { world, app } = sim;
    world.issue({ assignees: ["octocat"] });
    world.offline = true;

    await app.refresh().catch(() => undefined);

    expect(world.budget.remaining).toBe(5000);
  });
});

describe("Transferred issues", () => {
  it("shows a transferred issue once, under its new repository, after the next delta", async () => {
    const { world, app } = sim;
    const issue = world.issue({ repo: "octo-org/docs", assignees: ["octocat"] });
    await app.refresh();

    world.advance(10 * MINUTE);
    const moved = world.transfer(issue, "alice", "octo-org/portal");
    expect((await app.refresh()).kind).toBe("delta");

    expect(app.items.map((i) => [i.id, i.repo])).toEqual([[moved.id, "octo-org/portal"]]);
  });
});
