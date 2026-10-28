import { describe, expect, it } from "vitest";
import { classify } from "../../classify";
import { ruleSwitches } from "../../rules";
import { arrivals } from "../../ui/attention";
import { matchesAsk } from "../../ui/inboxFilter";
import { unreadInInbox } from "../../ui/unread";
import { InboxSession } from "./session";
import { DAY, HOUR, MINUTE, simulation } from "./vitest";

// Scenarios from TESTING.md: "Inbox", "Kommentieren", "Status und Protokoll", "Wiedervorlage".
const sim = simulation();

describe("Inbox", () => {
  it("holds a mention until the viewer answers, then files it under Done", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "alice" });
    world.comment(issue, "alice", "@octocat could you take a look?");
    await app.refresh();
    expect(app.viewOf(issue)).toBe("inbox");

    world.advance(5 * MINUTE);
    await app.comment(issue, "Looking now.");

    expect(app.viewOf(issue)).toBe("done");
    expect(app.entry(issue).answered).toBe("mention");
  });

  it("brings the item back when someone mentions the viewer again", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat ping");
    await app.refresh();
    world.advance(MINUTE);
    await app.comment(issue, "Done on my side.");

    world.advance(MINUTE);
    world.comment(issue, "alice", "@octocat one more thing");
    await app.reload(issue);

    expect(app.viewOf(issue)).toBe("inbox");
  });

  it("does not bring an assignment into the inbox, but a mention on it adds it", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    expect(app.views().inbox).not.toContain(issue.id);
    expect(app.views().assigned).toContain(issue.id);

    world.comment(issue, "alice", "@octocat this is urgent");
    await app.reload(issue);

    expect(app.views().inbox).toContain(issue.id);
    expect(app.views().assigned).toContain(issue.id);
  });

  it("keeps a review request in the inbox until the viewer reviews, then files it under Done", async () => {
    const { world, app } = sim;
    const pr = world.pullRequest();
    world.requestReview(pr, "alice", "octocat");
    await app.refresh();
    expect(app.entry(pr).asks).toContain("review");

    world.advance(HOUR);
    world.review(pr, "octocat", "APPROVED");
    await app.reload(pr);

    expect(app.viewOf(pr)).toBe("done");
    expect(app.entry(pr).answered).toBe("review");
  });

  it("lists a pull request with a review request and an open mention under both switches", async () => {
    const { world, app } = sim;
    const pr = world.pullRequest();
    world.requestReview(pr, "alice", "octocat");
    world.comment(pr, "alice", "@octocat the migration is yours");
    const calm = world.pullRequest({ title: "Only a review" });
    world.requestReview(calm, "alice", "octocat");
    await app.refresh();

    const under = (filter: "mention" | "review") => app.classified().filter((c) => matchesAsk(c, filter, "octocat")).map((c) => c.item.id);

    expect(under("mention")).toEqual([pr.id]);
    expect(under("review").sort()).toEqual([pr.id, calm.id].sort());
  });

  it("treats a request to a team as a request to the viewer", async () => {
    const { world, app } = sim;
    world.teams = ["core"];
    const pr = world.pullRequest({ assignees: ["octocat"] });
    world.requestReview(pr, "alice", "team:core");
    await app.refresh();

    expect(app.entry(pr).asks).toContain("review");
  });

  it("takes a mention of themselves as a reminder", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "octocat" });
    world.advance(MINUTE);
    world.comment(issue, "octocat", "@octocat check the numbers tomorrow");
    await app.refresh();

    expect(app.entry(issue)).toMatchObject({ bucket: "inbox", mention: { self: true } });
  });

  it("ignores mentions inside code and quotes", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "run `@octocat` here\n> @octocat quoted\n```\n@octocat\n```");
    await app.refresh();

    expect(app.items).toEqual([]);
  });

  it("files a closed item under Done when it was for the viewer, and shows nothing otherwise", async () => {
    const { world, app } = sim;
    const mentioned = world.issue();
    world.comment(mentioned, "alice", "@octocat fyi");
    const assigned = world.issue({ assignees: ["octocat"] });
    world.close(mentioned, "alice");
    world.close(assigned, "alice");
    await app.refresh();

    expect(app.viewOf(mentioned)).toBe("done");
    expect(app.viewOf(assigned)).toBeNull();
  });

  it("leaves out items closed longer ago than the window", async () => {
    const { world, app } = sim;
    const old = world.issue();
    world.comment(old, "alice", "@octocat");
    world.close(old, "alice");
    world.advance(8 * DAY);
    await app.refresh();

    expect(app.items.map((i) => i.id)).not.toContain(old.id);
  });
});

describe("Commenting", () => {
  it("shows the comment at once and reloads only that item, with its boards", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    const before = world.requests.length;

    await app.comment(issue, "On it.");

    const requests = world.requests.slice(before);
    expect(requests.map((r) => r.op)).toEqual(["addComment", "node", "boards"]);
    expect(requests.reduce((sum, r) => sum + r.cost, 0)).toBe(1 + 1 + 1);
    expect(app.entry(issue).item.comments.map((c) => c.body)).toEqual(["On it."]);
  });

  it("keeps the text and reports the error when sending fails offline", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    await app.refresh();
    world.offline = true;

    await expect(app.comment(issue, "Lost?")).rejects.toThrow("Failed to fetch");

    expect(app.entry(issue).item.comments).toEqual([]);
  });

  it("closes and reopens an issue with a reason and an optional comment, and not a merged pull request", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: ["octocat"] });
    const pr = world.pullRequest({ assignees: ["octocat"] });
    await app.refresh();

    await app.comment(issue, "Closing this.");
    await app.setOpen(issue, "close", "NOT_PLANNED");
    expect(app.entry(issue).item.closed?.state).toBe("closed");
    expect(app.entry(issue).item.activities.at(-1)).toMatchObject({ kind: "state", change: "closed", reason: "NOT_PLANNED" });
    await app.setOpen(issue, "reopen");
    expect(app.entry(issue).item.closed).toBeNull();

    await app.setOpen(pr, "close");
    await app.setOpen(pr, "reopen");
    world.merge(pr, "alice");
    await expect(app.setOpen(pr, "reopen")).rejects.toThrow("merged");
  });
});

describe("Status and log", () => {
  it("logs every change: snoozed, done, open", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat");
    await app.refresh();

    app.snooze(issue);
    expect(app.viewOf(issue)).toBe("planned");
    app.done(issue);
    expect(app.viewOf(issue)).toBe("done");
    app.open(issue);

    expect(app.log.get(issue.id)?.map((l) => l.status)).toEqual(["snoozed", "done", "open"]);
  });

  it("does nothing for done on a done item, and moves the date of a snoozed one", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat");
    await app.refresh();
    app.done(issue);
    app.done(issue);
    expect(app.log.get(issue.id)).toHaveLength(1);

    const other = world.issue();
    world.comment(other, "alice", "@octocat");
    await app.refresh();
    app.snooze(other, new Date(world.now.getTime() + DAY).toISOString());
    const later = new Date(world.now.getTime() + 3 * DAY).toISOString();
    app.snooze(other, later);

    expect(app.entry(other).until).toBe(later);
  });

  it("takes the last change back with undo, without a log line", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat");
    await app.refresh();

    app.done(issue);
    app.undo();

    expect(app.viewOf(issue)).toBe("inbox");
    expect(app.log.get(issue.id)).toEqual([]);
  });

  it("refuses a status on a closed item", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat");
    world.close(issue, "alice");
    await app.refresh();

    app.snooze(issue);

    expect(app.statuses.has(issue.id)).toBe(false);
  });

  it("brings a snoozed item back on a mention, or on any post with that setting", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat");
    await app.refresh();
    app.snooze(issue);

    world.advance(MINUTE);
    world.comment(issue, "bob", "Just a remark");
    await app.reload(issue);
    expect(app.viewOf(issue)).toBe("planned");

    world.advance(MINUTE);
    world.comment(issue, "bob", "@octocat now it matters");
    await app.reload(issue);
    expect(app.viewOf(issue)).toBe("inbox");
    expect(app.log.get(issue.id)?.at(-1)).toMatchObject({ status: "open", automatic: true });
  });

  it("brings a snoozed item back on any post when 'any post' is chosen", async () => {
    const world = sim.world;
    const app = new InboxSession(world, { reopenOn: "any-post" });
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat");
    await app.refresh();
    app.snooze(issue);

    world.advance(MINUTE);
    world.comment(issue, "bob", "Just a remark");
    await app.reload(issue);

    expect(app.viewOf(issue)).toBe("inbox");
  });
});

describe("Snoozed until a date (Wiedervorlage)", () => {
  it("returns an item only involved at its time, marked due, and holds it there until filed", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: "alice" });
    world.comment(issue, "octocat", "I will watch this.");
    await app.refresh();
    expect(app.viewOf(issue)).toBeNull();
    const until = new Date(world.now.getTime() + 2 * MINUTE).toISOString();
    app.snooze(issue, until);
    expect(app.viewOf(issue)).toBe("planned");

    expect(app.entry(issue).asks).toEqual([]);
    world.advance(3 * MINUTE);
    const back = app.entry(issue);

    expect(back).toMatchObject({ bucket: "inbox" });
    expect(back.asks).toContain("due");
    expect(app.log.get(issue.id)?.at(-1)).toMatchObject({ status: "open", automatic: true });
    world.advance(DAY);
    expect(app.viewOf(issue)).toBe("inbox");
    app.done(issue);
    expect(app.viewOf(issue)).toBe("done");
  });

  it("notifies about a snooze that ended while the app was closed, and not about the rest of the inbox", async () => {
    const { world, app } = sim;
    const quiet = world.issue();
    world.comment(quiet, "alice", "@octocat old news");
    const snoozed = world.issue();
    world.comment(snoozed, "alice", "@octocat later");
    await app.refresh();
    app.snooze(snoozed, new Date(world.now.getTime() + MINUTE).toISOString());
    world.advance(HOUR);

    const atStart = app.items.map((item) => classify(item, "octocat", app.statuses.get(item.id), ruleSwitches(), "mention", world.now.getTime()));

    expect(arrivals(atStart, null).map((c) => c.item.id)).toEqual([snoozed.id]);
  });

  it("shows the date on a bell while the item waits, and nothing once it is back", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat");
    await app.refresh();
    const until = new Date(world.now.getTime() + HOUR).toISOString();
    app.snooze(issue, until);
    expect(app.followUp(issue)).toBe(until);

    world.advance(2 * HOUR);

    expect(app.followUp(issue)).toBeNull();
    expect(app.viewOf(issue)).toBe("inbox");
  });
});

describe("Read and unread", () => {
  it("is unread until opened, and again when someone else posts afterwards", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat");
    await app.refresh();
    const seen = new Map<string, string>();
    expect(unreadInInbox(app.entry(issue), seen, "octocat")).toBe(true);

    world.advance(MINUTE);
    seen.set(issue.id, world.stamp());
    expect(unreadInInbox(app.entry(issue), seen, "octocat")).toBe(false);

    world.advance(MINUTE);
    world.comment(issue, "bob", "Any news?");
    await app.reload(issue);
    expect(unreadInInbox(app.entry(issue), seen, "octocat")).toBe(true);
  });
});
