import { describe, expect, it } from "vitest";
import { groupByType, isNewAssignment, assignedAt } from "../../ui/assignments";
import { historyText } from "../../ui/activities";
import { groupAuthored } from "../../ui/authored";
import { rowContext } from "../../ui/labels";
import { DAY, HOUR, MINUTE, simulation } from "./vitest";

// Scenarios from TESTING.md: "Mir zugewiesen", "Mir zuweisen", "Zurückstellen in Mir zugewiesen",
// "Wiedervorlage", "Mein Teil erledigt", "Von mir erstellt".
const sim = simulation();

describe("Assigned to me", () => {
  it("lists assignments by type, own pull requests excluded and foreign ones on top", async () => {
    const { world, app } = sim;
    const bug = world.issue({ assignees: ["octocat"], type: "Bug" });
    const untyped = world.issue({ assignees: ["octocat"] });
    const foreign = world.pullRequest({ assignees: ["octocat"], author: "alice" });
    const own = world.pullRequest({ assignees: ["octocat"], author: "octocat" });
    await app.refresh();

    const groups = groupByType(app.classified().filter((c) => app.views().assigned.includes(c.item.id)), {}, "newest", "octocat");

    expect(app.views().assigned.sort()).toEqual([bug.id, untyped.id, foreign.id].sort());
    expect(app.views().authored).toContain(own.id);
    expect(groups.map((g) => g.group)[0]).toBe("pr");
    expect(groups.flatMap((g) => g.entries.map((e) => e.item.id))).not.toContain(own.id);
  });

  it("marks an assignment new until opened, and an assignment to oneself never", async () => {
    const { world, app } = sim;
    const byBob = world.issue();
    world.assign(byBob, "bob", "octocat");
    const own = world.issue();
    world.assign(own, "octocat", "octocat");
    await app.refresh();
    const seen = new Map<string, string>();

    expect(isNewAssignment(app.entry(byBob), seen, "octocat")).toBe(true);
    expect(isNewAssignment(app.entry(own), seen, "octocat")).toBe(false);
    expect(assignedAt(app.entry(byBob).item, "octocat")).toMatchObject({ by: "bob" });

    world.advance(MINUTE);
    seen.set(byBob.id, world.stamp());
    expect(isNewAssignment(app.entry(byBob), seen, "octocat")).toBe(false);
  });

  it("shows an assignment to someone else only after the viewer is added", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["alice"] });
    world.comment(issue, "alice", "Mine.");
    await app.refresh();
    expect(app.viewOf(issue)).toBeNull();

    world.advance(MINUTE);
    world.assign(issue, "alice", "octocat");
    await app.refresh();

    expect(app.views().assigned).toContain(issue.id);
  });
});

describe("Assigning myself", () => {
  it("moves an item onto the plate at once and confirms with GitHub's assignees", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["alice"] });
    world.comment(issue, "alice", "@octocat can you take over?");
    await app.refresh();

    expect(await app.assignMe(issue)).toBeNull();

    expect(app.views().assigned).toContain(issue.id);
    expect(world.raw(issue).assignees.nodes.map((a) => a.login)).toEqual(["alice", "octocat"]);
    expect(app.entry(issue).item.activities.at(-1)).toMatchObject({ kind: "assigned", actor: "octocat", assignee: "octocat" });
  });

  it("assigns several items one after another and all land on GitHub", async () => {
    const { world, app } = sim;
    const issues = [world.issue(), world.issue(), world.issue()];
    for (const issue of issues) world.comment(issue, "alice", "@octocat");
    await app.refresh();

    await Promise.all(issues.map((issue) => app.assignMe(issue)));

    for (const issue of issues) expect(world.raw(issue).assignees.nodes.map((a) => a.login)).toEqual(["octocat"]);
  });

  it("puts the item back and keeps the error when GitHub refuses", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat");
    await app.refresh();
    world.fail("addAssigneesToAssignable", "Octocat cannot be assigned in this repository");

    const error = await app.assignMe(issue);

    expect(error).toContain("cannot be assigned");
    expect(app.views().assigned).not.toContain(issue.id);
    expect(app.writeFailures.get(issue.id)).toEqual([{ kind: "assign", error: expect.stringContaining("cannot be assigned") as string }]);
  });

  it("puts the item back when the network is gone", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat");
    await app.refresh();
    world.offline = true;

    expect(await app.assignMe(issue)).toContain("Failed to fetch");
    expect(app.entry(issue).item.assignees).toEqual([]);
  });

  it("removes the viewer, and the item shows nowhere until a mention brings it back", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat", "alice"] });
    await app.refresh();
    app.done(issue);

    expect(await app.leave(issue)).toBeNull();

    expect(world.raw(issue).assignees.nodes.map((a) => a.login)).toEqual(["alice"]);
    for (const ids of Object.values(app.views())) expect(ids).not.toContain(issue.id);

    world.advance(MINUTE);
    world.comment(issue, "alice", "@octocat actually, one more thing");
    await app.reload(issue);
    expect(app.viewOf(issue)).toBe("inbox");
  });

  it("assigns the viewer again with the status they had when leaving fails", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    app.done(issue);
    const before = app.statuses.get(issue.id);
    world.fail("removeAssigneesFromAssignable", "No write access");

    expect(await app.leave(issue)).toContain("No write access");

    expect(app.statuses.get(issue.id)).toEqual(before);
    expect(app.views().assigned).toContain(issue.id);
    expect(app.writeFailures.get(issue.id)?.[0]).toMatchObject({ kind: "unassign" });
  });
});

describe("My part done", () => {
  it("keeps a handed-off assignment on the plate, without counting it as news", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();

    app.done(issue);

    expect(app.statuses.get(issue.id)?.handoff).toBeDefined();
    expect(app.views().assigned).toContain(issue.id);
    expect(app.views().inbox).not.toContain(issue.id);
    expect(app.views().done).not.toContain(issue.id);
  });

  it("brings an update into the inbox, and ticking it off keeps the item on the plate", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    app.done(issue);

    world.advance(HOUR);
    world.comment(issue, "alice", "Thanks, one question though.");
    await app.reload(issue);
    expect(app.entry(issue).asks).toEqual(["update"]);
    expect(app.entry(issue).updates?.[0]).toMatchObject({ kind: "post", by: "alice" });

    app.done(issue);

    expect(app.entry(issue).asks).toEqual([]);
    expect(app.views().assigned).toContain(issue.id);
  });

  it("takes the tick-off back with undo", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    app.done(issue);
    world.advance(HOUR);
    world.comment(issue, "alice", "News");
    await app.reload(issue);

    app.done(issue);
    app.undo();

    expect(app.entry(issue).asks).toEqual(["update"]);
  });

  it("counts a moved board status, a linked pull request and closing as updates", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    world.setBoard(issue, { status: "In progress", sprint: "Sprint 12" });
    await app.refresh();
    app.done(issue);

    world.advance(HOUR);
    world.setBoard(issue, { status: "In review", sprint: "Sprint 12" });
    await app.reload(issue);
    expect(app.entry(issue).updates).toEqual([{ kind: "board", board: "Roadmap", from: "In progress", to: "In review" }]);
    app.done(issue);

    world.advance(HOUR);
    const pr = world.pullRequest({ author: "alice" });
    world.linkPullRequest(issue, pr, "alice");
    await app.reload(issue);
    expect(app.entry(issue).updates).toEqual([{ kind: "pr", number: pr.kind === "pr" ? world.raw(pr).number : 0 }]);
    app.done(issue);

    world.advance(HOUR);
    world.close(issue, "alice");
    await app.reload(issue);
    expect(app.entry(issue).updates?.map((u) => u.kind)).toEqual(["closed"]);
    expect(app.entry(issue).asks).toEqual(["update"]);
  });

  it("shows a closed assignment nowhere once the closing was ticked off, and never under Done", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    app.done(issue);
    world.advance(HOUR);
    world.close(issue, "alice");
    await app.reload(issue);
    app.done(issue);

    for (const ids of Object.values(app.views())) expect(ids).not.toContain(issue.id);
  });

  it("files a closed assignment under Done only when it also mentioned the viewer", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    world.comment(issue, "alice", "@octocat please check");
    world.close(issue, "alice");
    await app.refresh();

    expect(app.viewOf(issue)).toBe("done");
  });

  it("takes the item back into the work with O and leaves done alone there", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    app.done(issue);
    app.done(issue);
    expect(app.statuses.get(issue.id)?.status).toBe("done");

    app.open(issue);

    expect(app.statuses.has(issue.id)).toBe(false);
    expect(app.entry(issue).updates).toBeUndefined();
  });

  it("drops the handoff once the viewer is unassigned elsewhere, as if no status were stored", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    app.done(issue);

    world.unassign(issue, "alice", "octocat");
    await app.reload(issue);

    expect(app.viewOf(issue)).toBeNull();
  });

  it("turns a plain done on an assignment from an older version into my part done", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    app.statuses.set(issue.id, { status: "done", changedAt: world.stamp() });

    app.classified();

    expect(app.statuses.get(issue.id)?.handoff).toBeDefined();
    expect(app.log.get(issue.id)?.at(-1)).toMatchObject({ status: "done", automatic: true });
  });

  it("leaves a mention on a handed-off assignment in the inbox while it stays on the plate", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    app.done(issue);

    world.advance(HOUR);
    world.comment(issue, "alice", "@octocat quick one");
    await app.reload(issue);

    expect(app.views().inbox).toContain(issue.id);
    expect(app.views().assigned).toContain(issue.id);
  });
});

describe("Snoozing on the plate", () => {
  it("keeps a snoozed assignment on the plate, not under Snoozed, and brings it back to the inbox at its date", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();

    app.snooze(issue, new Date(world.now.getTime() + 2 * MINUTE).toISOString());

    expect(app.onPlate(issue)).toBe(true);
    expect(app.views().planned).toContain(issue.id);
    world.advance(3 * MINUTE);
    expect(app.entry(issue).asks).toEqual(["due"]);
    expect(app.statuses.get(issue.id)).toMatchObject({ status: "open", due: true });
    expect(app.onPlate(issue)).toBe(true);
  });

  it("shows a mention on a snoozed assignment in the inbox while it stays snoozed", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    app.snooze(issue, new Date(world.now.getTime() + DAY).toISOString());

    world.advance(HOUR);
    world.comment(issue, "alice", "@octocat quick one");
    await app.reload(issue);

    expect(app.views().inbox).toContain(issue.id);
    expect(app.entry(issue).status).toBe("snoozed");
    world.advance(MINUTE);
    world.comment(issue, "bob", "Another post");
    await app.reload(issue);
    expect(app.entry(issue).status).toBe("snoozed");
  });
});

describe("Created by me", () => {
  it("groups by who is on it: issues without assignees and ready pull requests without reviewers are unassigned, drafts taken", async () => {
    const { world, app } = sim;
    const bare = world.issue({ author: "octocat" });
    const taken = world.issue({ author: "octocat", assignees: ["alice"] });
    const draft = world.pullRequest({ author: "octocat", draft: true });
    const ready = world.pullRequest({ author: "octocat" });
    const asked = world.pullRequest({ author: "octocat" });
    world.requestReview(asked, "octocat", "alice");
    await app.refresh();

    const groups = groupAuthored(app.classified(), "octocat");
    const idsOf = (name: string) => groups.find((g) => g.group === name)?.entries.map((e) => e.item.id).sort() ?? [];

    expect(idsOf("unassigned")).toEqual([bare.id, ready.id].sort());
    expect(idsOf("taken")).toEqual([taken.id, draft.id, asked.id].sort());
  });

  it("drops what was closed, keeps an open mention in both places, and does not let D finish an own item", async () => {
    const { world, app } = sim;
    const open = world.issue({ author: "octocat" });
    const closed = world.issue({ author: "octocat" });
    const asked = world.issue({ author: "octocat" });
    world.advance(MINUTE);
    world.comment(asked, "alice", "@octocat what about the edge case?");
    await app.refresh();
    app.done(open);
    world.close(closed, "octocat");
    await app.refresh();

    expect(app.statuses.has(open.id)).toBe(false);
    expect(app.views().authored).toContain(open.id);
    expect(app.views().authored).not.toContain(closed.id);
    expect(app.views().authored).toContain(asked.id);
    expect(app.views().inbox).toContain(asked.id);
  });

  it("lets D hand off an own issue only when another person is assigned too", async () => {
    const { world, app } = sim;
    const alone = world.issue({ author: "octocat", assignees: ["octocat"] });
    const shared = world.issue({ author: "octocat", assignees: ["octocat", "alice"] });
    const pr = world.pullRequest({ author: "octocat" });
    await app.refresh();

    app.done(alone);
    app.done(shared);
    app.done(pr);

    expect(app.statuses.has(alone.id)).toBe(false);
    expect(app.statuses.get(shared.id)?.handoff).toBeDefined();
    expect(app.statuses.has(pr.id)).toBe(false);
  });

  it("sorts by opening, newest first", async () => {
    const { world, app } = sim;
    const older = world.issue({ author: "octocat", ago: 3 * DAY });
    const newer = world.issue({ author: "octocat", ago: DAY });
    await app.refresh();

    const [group] = groupAuthored(app.classified(), "octocat", "newest");

    expect(group.entries.map((e) => e.item.id)).toEqual([newer.id, older.id]);
    expect(groupAuthored(app.classified(), "octocat", "oldest")[0].entries.map((e) => e.item.id)).toEqual([older.id, newer.id]);
  });
});

describe("Follow-ups", () => {
  const inAnHour = (world: { now: Date }) => new Date(world.now.getTime() + HOUR).toISOString();

  it("keeps an own item in its table while it waits, with its date on the bell, and brings it back to the inbox at the time", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "octocat" });
    await app.refresh();

    app.snooze(issue, inAnHour(world));

    expect(app.statuses.get(issue.id)?.status).toBe("snoozed");
    expect(app.views().authored).toContain(issue.id);
    expect(app.views().planned).toContain(issue.id);
    expect(app.followUp(issue)).toBe(inAnHour(world));
    expect(groupAuthored(app.classified(), "octocat").map((g) => g.group)).toEqual(["later"]);

    world.advance(2 * HOUR);

    expect(app.views().inbox).toContain(issue.id);
    expect(app.entry(issue).asks).toEqual(["due"]);
    expect(app.followUp(issue)).toBeNull();
  });

  it("shows nothing about the end in the list once the item is back", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "octocat" });
    await app.refresh();
    app.snooze(issue, inAnHour(world));
    world.advance(2 * HOUR);

    const label = rowContext(app.entry(issue));

    expect(label).not.toMatch(/snooze|follow|reminder|ended|due/i);
  });

  it("leaves a line in the item's log when the follow-up comes due", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "octocat" });
    await app.refresh();
    app.snooze(issue, inAnHour(world));
    world.advance(2 * HOUR);

    app.classified();

    expect(app.log.get(issue.id)?.map((l) => historyText(l))).toEqual(["history.snoozed", "history.due"]);
  });

  it("files the returned item with D without finishing it: it leaves the inbox and stays in its table", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "octocat" });
    await app.refresh();
    app.snooze(issue, inAnHour(world));
    world.advance(2 * HOUR);

    app.done(issue);

    expect(app.views().inbox).not.toContain(issue.id);
    expect(app.views().authored).toContain(issue.id);
    expect(app.statuses.has(issue.id)).toBe(false);
  });

  it("takes the date off with X and puts it back with undo", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "octocat" });
    await app.refresh();
    app.snooze(issue, inAnHour(world));

    app.clearFollowUp(issue);
    expect(app.statuses.has(issue.id)).toBe(false);
    expect(app.followUp(issue)).toBeNull();
    expect(app.views().authored).toContain(issue.id);

    app.undo();
    expect(app.followUp(issue)).toBe(inAnHour(world));
  });

  it("shows a mention on a waiting own item in the inbox while it keeps waiting", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "octocat" });
    await app.refresh();
    app.snooze(issue, new Date(world.now.getTime() + DAY).toISOString());

    world.advance(HOUR);
    world.comment(issue, "alice", "@octocat any update?");
    await app.reload(issue);

    expect(app.views().inbox).toContain(issue.id);
    expect(app.entry(issue).status).toBe("snoozed");
    expect(app.followUp(issue)).not.toBeNull();
  });

  it("lets an item outside the tables leave its list until the date, and come back to the inbox", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "alice" });
    world.comment(issue, "alice", "@octocat");
    await app.refresh();

    app.snooze(issue, inAnHour(world));
    expect(app.viewOf(issue)).toBe("planned");

    world.advance(2 * HOUR);
    expect(app.viewOf(issue)).toBe("inbox");
  });

  it("waits without a date when none is given", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "octocat" });
    await app.refresh();

    app.snooze(issue);

    expect(app.statuses.get(issue.id)?.status).toBe("snoozed");
    expect(app.followUp(issue)).toBeNull();
    world.advance(30 * DAY);
    expect(app.views().inbox).not.toContain(issue.id);
  });
});
