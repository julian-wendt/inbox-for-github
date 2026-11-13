import { describe, expect, it } from "vitest";
import type { Classified } from "./classify";
import type { InboxSession } from "./github/simulate/session";
import { DAY, HOUR, MINUTE, simulation } from "./github/simulate/vitest";
import type { GitHubSimulator, Ref } from "./github/simulate/world";
import { hasNewActivity, isNewAssignment, onPlate } from "./ui/assignments";
import { isOwnOpen } from "./ui/authored";
import { isWaiting } from "./ui/followUp";
import { VIEWS, type View } from "./ui/labels";
import { datedOf } from "./ui/plan";
import { doneAccess } from "./ui/statusPlan";
import { inDoneBar } from "./ui/doneBar";
import { arrivals, askKey, dueReminders, ringing } from "./ui/attention";
import { unreadInInbox } from "./ui/unread";

// Walks the table in docs/reference/behaviour.md, one describe per rule.
const ME = "octocat";
const sim = simulation();

interface Row {
  situation: string;
  /** Where today's code differs from the model: the issue that changes it, and how it differs. */
  diverges?: string;
  run: (world: GitHubSimulator, app: InboxSession) => Promise<void> | void;
}

function walk(rows: Row[]): void {
  for (const { situation, diverges, run } of rows) {
    if (diverges) it.fails(`${situation} (diverges, ${diverges})`, () => run(sim.world, sim.app));
    else it(situation, () => run(sim.world, sim.app));
  }
}

/** Every view the entry shows in, in sidebar order with the session's pins and plans, then "done" for the inbox's Done bar. */
function viewsOf(c: Classified): (View | "done")[] {
  const { focus, planned: plans } = sim.app.today;
  const planned = datedOf(c, focus, plans) !== null;
  const shows: Record<View | "done", boolean> = {
    inbox: c.bucket === "inbox",
    planned,
    snoozed: isWaiting(c),
    assigned: onPlate(c, ME),
    authored: isOwnOpen(c, ME),
    done: inDoneBar(c, sim.app.handledUntil.get(c.item.id), ME, sim.world.now.getTime(), planned),
  };
  return [...VIEWS.map((v) => v.id), "done" as const].filter((v) => shows[v]);
}

const later = (world: GitHubSimulator, ms: number) => new Date(world.now.getTime() + ms).toISOString();

/** Loads the item a minute after what happened on GitHub, as a refresh would, so stamps never tie. */
async function refetch(world: GitHubSimulator, app: InboxSession, ref: Ref): Promise<void> {
  world.advance(MINUTE);
  await app.reload(ref);
}

async function mentioned(world: GitHubSimulator, app: InboxSession, draft: Parameters<GitHubSimulator["issue"]>[0] = {}): Promise<Ref> {
  const issue = world.issue(draft);
  world.comment(issue, "alice", "@octocat could you look?");
  await app.refresh();
  world.advance(HOUR);
  return issue;
}

async function handedOff(world: GitHubSimulator, app: InboxSession): Promise<Ref> {
  const issue = world.issue({ assignees: [ME] });
  await app.refresh();
  app.done(issue);
  world.advance(HOUR);
  return issue;
}

describe("views", () => {
  walk([
    {
      situation: "a review request is only a review: Inbox, not Assigned to me",
      run: async (world, app) => {
        const pr = world.pullRequest();
        world.requestReview(pr, "alice", ME);
        await app.refresh();
        expect(viewsOf(app.entry(pr))).toEqual(["inbox"]);
      },
    },
    {
      situation: "Created by me watches: D is not offered there",
      run: async (world, app) => {
        const issue = world.issue({ author: ME });
        await app.refresh();
        expect(viewsOf(app.entry(issue))).toEqual(["authored"]);
        expect(doneAccess(app.entry(issue), ME, "authored")).toBe("hidden");
      },
    },
  ]);
});

describe("rule 1: the inbox holds every item with an ask newer than its handled-until", () => {
  walk([
    {
      situation: "a mention nobody handled is in the Inbox",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        expect(viewsOf(app.entry(issue))).toEqual(["inbox"]);
      },
    },
    {
      situation: "a mention older than D in the inbox stays out; the own item stays in Created by me",
      run: async (world, app) => {
        const issue = await mentioned(world, app, { author: ME });
        app.done(issue);
        expect(viewsOf(app.entry(issue))).toContain("authored");
        expect(viewsOf(app.entry(issue))).not.toContain("inbox");
        expect(app.entry(issue).asks).toEqual([]);
      },
    },
    {
      situation: "a mention newer than D in the inbox asks again",
      run: async (world, app) => {
        const issue = await mentioned(world, app, { author: ME });
        app.done(issue);
        world.advance(HOUR);
        world.comment(issue, "bob", "@octocat and this?");
        await refetch(world, app, issue);
        expect(viewsOf(app.entry(issue))).toEqual(["inbox", "authored"]);
      },
    },
  ]);
});

describe("rule 2: everything that brings an item back is an ask with a time", () => {
  walk([
    {
      situation: "a mention after D",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.done(issue);
        world.advance(HOUR);
        world.comment(issue, "bob", "@octocat one more thing");
        await refetch(world, app, issue);
        expect(app.entry(issue)).toMatchObject({ bucket: "inbox", asks: ["mention"] });
      },
    },
    {
      situation: "a review request after D",
      run: async (world, app) => {
        const pr = world.pullRequest();
        world.requestReview(pr, "alice", ME);
        await app.refresh();
        app.done(pr);
        world.advance(HOUR);
        world.requestReview(pr, "bob", ME);
        await refetch(world, app, pr);
        expect(app.entry(pr)).toMatchObject({ bucket: "inbox", asks: ["review"] });
      },
    },
    {
      situation: "feedback on an own item after D",
      run: async (world, app) => {
        const issue = world.issue({ author: ME });
        world.comment(issue, "alice", "Why this way?");
        await app.refresh();
        app.done(issue);
        world.advance(HOUR);
        world.comment(issue, "alice", "Still unsure.");
        await refetch(world, app, issue);
        expect(app.entry(issue)).toMatchObject({ bucket: "inbox", asks: ["feedback"] });
      },
    },
    {
      situation: "a reply in my review thread after D",
      run: async (world, app) => {
        const pr = world.pullRequest();
        world.review(pr, ME, "COMMENTED", { inline: [{ path: "a.ts", line: 1, body: "Why?" }] });
        await app.refresh();
        world.advance(HOUR);
        world.replyInThread(pr, 0, "alice", "Because of the cache.");
        await refetch(world, app, pr);
        app.done(pr);
        world.advance(HOUR);
        world.replyInThread(pr, 0, "alice", "And the queue.");
        await refetch(world, app, pr);
        expect(app.entry(pr)).toMatchObject({ bucket: "inbox", asks: ["reply"] });
      },
    },
    {
      situation: "new commits after my review",
      run: async (world, app) => {
        const pr = world.pullRequest();
        world.requestReview(pr, "alice", ME);
        world.review(pr, ME, "APPROVED");
        await app.refresh();
        world.advance(HOUR);
        world.commit(pr, "alice");
        await refetch(world, app, pr);
        expect(app.entry(pr)).toMatchObject({ bucket: "inbox", asks: ["commits"] });
      },
    },
    {
      situation: "a new assignment is no ask: new work in Assigned to me, with its dot",
      run: async (world, app) => {
        const issue = world.issue();
        world.assign(issue, "bob", ME);
        await app.refresh();
        expect(viewsOf(app.entry(issue))).toEqual(["assigned"]);
        expect(isNewAssignment(app.entry(issue), new Map(), ME)).toBe(true);
      },
    },
    {
      situation: "a new assignment after my part done: new work in Assigned to me, with its dot",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        const seen = new Map([[issue.id, world.stamp()]]);
        world.advance(HOUR);
        world.unassign(issue, "bob", ME);
        world.assign(issue, "bob", ME);
        await refetch(world, app, issue);
        expect(app.entry(issue)).toMatchObject({ status: "open" });
        expect(viewsOf(app.entry(issue))).toEqual(["assigned"]);
        expect(isNewAssignment(app.entry(issue), seen, ME)).toBe(true);
      },
    },
    {
      situation: "a reopen by someone else after D",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.done(issue);
        world.advance(HOUR);
        world.close(issue, "alice");
        world.reopen(issue, "bob");
        await refetch(world, app, issue);
        expect(app.entry(issue).bucket).toBe("inbox");
        expect(app.entry(issue).asks).toContain("reopened");
      },
    },
    {
      situation: "a reopen by someone else after D asks alone; the mention D handled stays handled",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.done(issue);
        world.advance(HOUR);
        world.close(issue, "alice");
        world.reopen(issue, "bob");
        await refetch(world, app, issue);
        expect(app.entry(issue).asks).toEqual(["reopened"]);
      },
    },
    {
      situation: "a reopen by someone else after my answer",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        await app.comment(issue, "Will do.");
        world.advance(HOUR);
        world.close(issue, "alice");
        world.reopen(issue, "bob");
        await refetch(world, app, issue);
        expect(app.entry(issue)).toMatchObject({ bucket: "inbox", asks: ["reopened"] });
      },
    },
    {
      situation: "news after my part done",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        world.comment(issue, "alice", "Shipped.");
        await refetch(world, app, issue);
        expect(app.entry(issue)).toMatchObject({ bucket: "inbox", status: "done", asks: ["update"] });
      },
    },
    {
      situation: "a due follow-up on an answered mention",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        await app.comment(issue, "Will do.");
        app.snooze(issue, later(world, DAY));
        world.advance(2 * DAY);
        expect(app.entry(issue)).toMatchObject({ bucket: "inbox", asks: ["due"] });
      },
    },
    {
      situation: "a due follow-up on a pending mention, although F handled it",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.snooze(issue, later(world, DAY));
        world.advance(2 * DAY);
        expect(app.entry(issue)).toMatchObject({ bucket: "inbox", asks: ["due", "mention"] });
      },
    },
  ]);
});

describe("rule 3: D on someone else's item files it; there is no stored done for it", () => {
  walk([
    {
      situation: "D in the inbox takes a mention out of the inbox",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.done(issue);
        expect(viewsOf(app.entry(issue))).not.toContain("inbox");
      },
    },
    {
      situation: "D in the inbox stores no done",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.done(issue);
        expect(app.statuses.get(issue.id)).toBeUndefined();
        expect(app.filedAt.has(issue.id)).toBe(true);
      },
    },
    {
      situation: "D in the inbox on an assignment files the mention and leaves the work open",
      run: async (world, app) => {
        const issue = await mentioned(world, app, { assignees: [ME] });
        app.done(issue);
        expect(app.statuses.get(issue.id)).toBeUndefined();
        expect(viewsOf(app.entry(issue))).toEqual(["assigned", "done"]);
      },
    },
  ]);
});

describe("rule 3, closed items", () => {
  walk([
    {
      situation: "D on a closed item with news in the inbox sets handled-until and writes no done",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        world.comment(issue, "alice", "Shipped.");
        world.close(issue, "alice");
        await refetch(world, app, issue);
        const before = app.statuses.get(issue.id);
        expect(app.entry(issue)).toMatchObject({ bucket: "inbox", asks: ["update"] });
        app.done(issue);
        expect(app.filedAt.has(issue.id)).toBe(true);
        expect(app.statuses.get(issue.id)).toBe(before);
      },
    },
  ]);
});

describe("rule 4: the Done bar shows what was handled in the last N days and has no newer ask", () => {
  walk([
    {
      situation: "an answered mention is out of the inbox, with no newer ask",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        await app.comment(issue, "Will do.");
        expect(viewsOf(app.entry(issue))).not.toContain("inbox");
        expect(app.entry(issue)).toMatchObject({ answered: "mention", asks: [] });
      },
    },
    {
      situation: "Done is a bar, not a view of the sidebar",
      run: () => {
        expect(VIEWS.map((v) => v.id)).not.toContain("done");
      },
    },
    {
      situation: "a mention filed with D on an assignment is in Done",
      run: async (world, app) => {
        const issue = await mentioned(world, app, { assignees: [ME] });
        app.done(issue);
        expect(viewsOf(app.entry(issue))).toContain("done");
      },
    },
    {
      situation: "what was handled more than 7 days ago leaves Done",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        await app.comment(issue, "Will do.");
        world.advance(8 * DAY);
        expect(viewsOf(app.entry(issue))).not.toContain("done");
      },
    },
    {
      situation: "a thread reply filed with D, with no mention or review request, is in Done",
      run: async (world, app) => {
        const pr = world.pullRequest();
        world.review(pr, ME, "COMMENTED", { inline: [{ path: "a.ts", line: 1, body: "Why?" }] });
        await app.refresh();
        world.advance(HOUR);
        world.replyInThread(pr, 0, "alice", "Because of the cache.");
        await refetch(world, app, pr);
        app.done(pr);
        expect(viewsOf(app.entry(pr))).toEqual(["done"]);
      },
    },
    {
      situation: "a newer ask takes it out of Done into the inbox",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        await app.comment(issue, "Will do.");
        world.advance(HOUR);
        world.comment(issue, "alice", "@octocat any news?");
        await refetch(world, app, issue);
        expect(viewsOf(app.entry(issue))).toEqual(["inbox"]);
      },
    },
  ]);
});

describe("rule 5: a follow-up is a when, not a status", () => {
  walk([
    {
      situation: "F on someone else's item: in Follow-up, out of the inbox",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        expect(viewsOf(app.entry(issue))).toEqual(["snoozed"]);
      },
    },
    {
      situation: "F on an assignment: in Follow-up and still in Assigned to me",
      run: async (world, app) => {
        const issue = world.issue({ assignees: [ME] });
        await app.refresh();
        app.snooze(issue, later(world, 3 * DAY));
        expect(viewsOf(app.entry(issue))).toEqual(["snoozed", "assigned"]);
      },
    },
    {
      situation: "F on an assignment whose part is done keeps my part done",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        expect(viewsOf(app.entry(issue))).toContain("snoozed");
        expect(app.entry(issue).updates).toEqual([]);
        expect(app.statuses.get(issue.id)?.handoff).toBeDefined();
      },
    },
    {
      situation: "F on news after my part done handles the news; the part stays done",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        world.comment(issue, "alice", "Shipped in the last release.");
        await refetch(world, app, issue);
        expect(app.entry(issue).asks).toEqual(["update"]);
        app.snooze(issue, later(world, 3 * DAY));
        expect(viewsOf(app.entry(issue))).toEqual(["snoozed", "assigned"]);
        expect(app.entry(issue).updates).toEqual([]);
      },
    },
    {
      situation: "news while a finished part waits is an update in the inbox",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        world.advance(HOUR);
        world.comment(issue, "alice", "Shipped in the last release.");
        await refetch(world, app, issue);
        expect(viewsOf(app.entry(issue))).toEqual(["inbox", "snoozed", "assigned"]);
        expect(app.entry(issue).asks).toEqual(["update"]);
      },
    },
    {
      situation: "a finished part whose follow-up came due is my part done again, not open",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        app.snooze(issue, later(world, DAY));
        world.advance(2 * DAY);
        expect(viewsOf(app.entry(issue))).not.toContain("snoozed");
        expect(app.entry(issue)).toMatchObject({ status: "done", updates: [] });
      },
    },
    {
      situation: "F with no date again on a finished part that waits without one writes nothing",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        app.snooze(issue, "");
        const before = app.statuses.get(issue.id);
        const logged = app.log.get(issue.id)?.length;
        world.advance(HOUR);
        app.snooze(issue, "");
        expect(app.statuses.get(issue.id)).toBe(before);
        expect(app.log.get(issue.id)?.length).toBe(logged);
      },
    },
    {
      situation: "T and P on a finished part that waits do nothing: no plan, the follow-up stays",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        const before = app.statuses.get(issue.id);
        app.pin(issue);
        app.plan(issue, later(world, 2 * DAY).slice(0, 10));
        expect(app.today).toMatchObject({ focus: [], planned: [] });
        expect(app.statuses.get(issue.id)).toEqual(before);
        expect(viewsOf(app.entry(issue))).toEqual(["snoozed", "assigned"]);
      },
    },
    {
      situation: "leaving an assignment whose part is done keeps its follow-up",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        await app.leave(issue);
        expect(viewsOf(app.entry(issue))).toContain("snoozed");
      },
    },
    {
      situation: "X on a finished part that waits gives back my part done; handled-until stays",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        const handled = app.handledUntil.get(issue.id);
        world.advance(HOUR);
        app.clearFollowUp(issue);
        expect(viewsOf(app.entry(issue))).toEqual(["assigned"]);
        expect(app.entry(issue)).toMatchObject({ status: "done", updates: [] });
        expect(app.handledUntil.get(issue.id)).toBe(handled);
      },
    },
    {
      situation: "news while a finished part waited stays an update after X",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        world.advance(HOUR);
        world.comment(issue, "alice", "Shipped in the last release.");
        await refetch(world, app, issue);
        app.clearFollowUp(issue);
        expect(viewsOf(app.entry(issue))).toEqual(["inbox", "assigned"]);
        expect(app.entry(issue).asks).toEqual(["update"]);
      },
    },
    {
      situation: "D in Follow-up on a finished part ends the follow-up; my part stays done",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        app.choose(issue, "done", undefined, "snoozed");
        expect(viewsOf(app.entry(issue))).toEqual(["assigned"]);
        expect(app.entry(issue)).toMatchObject({ status: "done", updates: [] });
      },
    },
    {
      situation: "O on a finished part that waits opens the work; the follow-up stays",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        app.open(issue);
        expect(viewsOf(app.entry(issue))).toEqual(["snoozed", "assigned"]);
        expect(app.entry(issue).updates).toBeUndefined();
      },
    },
    {
      situation: "X takes off the follow-up and gives back what F handled: the pending mention asks again",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        app.clearFollowUp(issue);
        expect(viewsOf(app.entry(issue))).toContain("inbox");
        expect(app.entry(issue).asks).toEqual(["mention"]);
      },
    },
    {
      situation: "X on a plan gives back what P handled, as on a follow-up",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.plan(issue, later(world, 2 * DAY).slice(0, 10));
        expect(viewsOf(app.entry(issue))).not.toContain("inbox");
        app.clearPlan(issue);
        expect(app.entry(issue).asks).toEqual(["mention"]);
      },
    },
    {
      situation: "X on a follow-up with nothing pending brings nothing back",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        world.comment(issue, ME, "On it.");
        await refetch(world, app, issue);
        app.snooze(issue, later(world, 3 * DAY));
        app.clearFollowUp(issue);
        expect(viewsOf(app.entry(issue))).not.toContain("inbox");
      },
    },
  ]);
});

describe("rule 5, one when", () => {
  const nextDay = (world: GitHubSimulator) => later(world, 2 * DAY).slice(0, 10);

  walk([
    {
      situation: "F on a pinned item takes it off Today; it only waits",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.pin(issue);
        app.snooze(issue, later(world, 3 * DAY));
        expect(viewsOf(app.entry(issue))).toEqual(["snoozed"]);
        expect(app.today.focus).not.toContain(issue.id);
      },
    },
    {
      situation: "F on a planned item ends the plan; it only waits",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.plan(issue, nextDay(world));
        app.snooze(issue, later(world, 3 * DAY));
        expect(viewsOf(app.entry(issue))).toEqual(["snoozed"]);
        expect(app.today.planned).toEqual([]);
      },
    },
    {
      situation: "T on a follow-up ends it; the item is on Today only",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        app.pin(issue);
        expect(viewsOf(app.entry(issue))).toEqual(["planned"]);
        expect(app.statuses.get(issue.id)).toBeUndefined();
      },
    },
    {
      situation: "P on a follow-up of an assignment ends it: planned and open work in Assigned to me",
      run: async (world, app) => {
        const issue = world.issue({ assignees: [ME] });
        await app.refresh();
        app.snooze(issue, later(world, 3 * DAY));
        app.plan(issue, nextDay(world));
        expect(viewsOf(app.entry(issue))).toEqual(["planned", "assigned"]);
        expect(app.entry(issue).status).toBe("open");
      },
    },
    {
      situation: "X after F takes off the follow-up; the plan F replaced stays gone",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.pin(issue);
        app.snooze(issue, later(world, 3 * DAY));
        app.clearFollowUp(issue);
        expect(viewsOf(app.entry(issue))).not.toContain("planned");
        expect(viewsOf(app.entry(issue))).not.toContain("snoozed");
      },
    },
  ]);
});

describe("rule 6: planning and a follow-up count as handled and as seen", () => {
  walk([
    {
      situation: "T after a mention: out of the inbox, into Planned",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.pin(issue);
        expect(viewsOf(app.entry(issue))).toEqual(["planned"]);
      },
    },
    {
      situation: "T on an assignment: out of the inbox, in Planned and Assigned to me",
      run: async (world, app) => {
        const issue = await mentioned(world, app, { assignees: [ME] });
        app.pin(issue);
        expect(viewsOf(app.entry(issue))).toEqual(["planned", "assigned"]);
      },
    },
    {
      situation: "a mention after T asks again",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.pin(issue);
        world.advance(HOUR);
        world.comment(issue, "bob", "@octocat and now?");
        await refetch(world, app, issue);
        expect(viewsOf(app.entry(issue))).toEqual(["inbox", "planned"]);
      },
    },
    {
      situation: "F on an assignment handles the mention before it",
      run: async (world, app) => {
        const issue = await mentioned(world, app, { assignees: [ME] });
        app.snooze(issue, later(world, 3 * DAY));
        expect(viewsOf(app.entry(issue))).toEqual(["snoozed", "assigned"]);
      },
    },
  ]);
});

describe("rule 7: news by someone else makes an item unread; an unassignment is none", () => {
  /** An own issue assigned to me and bob, seen now, then `act` happens an hour later. */
  async function newsAfter(world: GitHubSimulator, app: InboxSession, act: (issue: Ref) => void): Promise<boolean> {
    const issue = world.issue({ author: ME, assignees: [ME, "bob"] });
    await app.refresh();
    const seen = new Map([[app.entry(issue).item.id, world.now.toISOString()]]);
    world.advance(HOUR);
    act(issue);
    await refetch(world, app, issue);
    return hasNewActivity(app.entry(issue), seen, ME);
  }
  walk([
    { situation: "a comment by someone else is news", run: async (world, app) => expect(await newsAfter(world, app, (i) => world.comment(i, "alice", "Looks good"))).toBe(true) },
    { situation: "someone else assigns another person: news", run: async (world, app) => expect(await newsAfter(world, app, (i) => world.assign(i, "alice", "carol"))).toBe(true) },
    { situation: "someone else removes another assignee: no news", run: async (world, app) => expect(await newsAfter(world, app, (i) => world.unassign(i, "alice", "bob"))).toBe(false) },
    { situation: "someone else removes me: no news", run: async (world, app) => expect(await newsAfter(world, app, (i) => world.unassign(i, "alice", ME))).toBe(false) },
  ]);
});

describe("rule 8: a follow-up with Remind me rings once when it comes due, and comes back unread like any", () => {
  /** An own pull request reviewed by bob, waiting a day for a follow-up, with or without Remind me. */
  async function waitingOnReview(world: GitHubSimulator, app: InboxSession, notify: boolean): Promise<Ref> {
    const pr = world.pullRequest({ author: ME });
    world.requestReview(pr, ME, "bob");
    await app.refresh();
    app.snooze(pr, later(world, DAY), notify);
    return pr;
  }
  walk([
    {
      situation: "an own pull request with Remind me: waits in Created by me, then rings in the inbox",
      run: async (world, app) => {
        const pr = await waitingOnReview(world, app, true);
        expect(ringing(app.entry(pr))).toBe(false);
        expect(viewsOf(app.entry(pr))).toEqual(["snoozed", "authored"]);
        world.advance(2 * DAY);
        expect(ringing(app.entry(pr))).toBe(true);
        expect(viewsOf(app.entry(pr))).toEqual(["inbox", "authored"]);
      },
    },
    {
      situation: "a plain follow-up comes due quietly",
      run: async (world, app) => {
        const pr = await waitingOnReview(world, app, false);
        world.advance(2 * DAY);
        expect(app.entry(pr).asks).toEqual(["due"]);
        expect(ringing(app.entry(pr))).toBe(false);
      },
    },
    {
      situation: "with or without Remind me, it comes back unread though it was seen when F was set",
      run: async (world, app) => {
        for (const notify of [true, false]) {
          const pr = await waitingOnReview(world, app, notify);
          const seen = new Map([[pr.id, world.now.toISOString()]]);
          world.advance(2 * DAY);
          expect(unreadInInbox(app.entry(pr), seen, ME)).toBe(true);
        }
      },
    },
    {
      situation: "it notifies once, and at start only when it came due after the last fetch",
      run: async (world, app) => {
        const pr = await waitingOnReview(world, app, true);
        const lastFetch = world.now.toISOString();
        world.advance(2 * DAY);
        const now = [app.entry(pr)];
        expect(dueReminders(now, null, lastFetch)).toHaveLength(1);
        expect(dueReminders(now, null, world.now.toISOString())).toHaveLength(0);
        expect(dueReminders(now, new Set([pr.id]), null)).toHaveLength(0);
      },
    },
    {
      situation: "D files it: out of the inbox, into the Done bar",
      run: async (world, app) => {
        const pr = await waitingOnReview(world, app, true);
        world.advance(2 * DAY);
        app.done(pr);
        expect(ringing(app.entry(pr))).toBe(false);
        expect(viewsOf(app.entry(pr))).toEqual(["authored", "done"]);
      },
    },
    {
      situation: "Later sets the follow-up anew, with Remind me",
      run: async (world, app) => {
        const pr = await waitingOnReview(world, app, true);
        world.advance(2 * DAY);
        app.snooze(pr, later(world, HOUR), true);
        expect(app.entry(pr)).toMatchObject({ status: "snoozed", notify: true, asks: [] });
        world.advance(2 * HOUR);
        expect(ringing(app.entry(pr))).toBe(true);
      },
    },
  ]);
});

describe("rule 10: an ask notifies only when it is newer than the fetch before", () => {
  walk([
    {
      situation: "an item missing from a fetch comes back quietly with its old ask, a new mention notifies",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        const lastFetch = world.now.toISOString();
        const missing = new Map(app.classified().filter((c) => c.bucket === "inbox" && c.item.id !== issue.id).map((c) => [c.item.id, askKey(c)]));
        world.advance(HOUR);
        await app.refresh();
        expect(arrivals(app.classified(), missing, lastFetch)).toEqual([]);
        const other = world.issue();
        world.comment(other, "bob", "@octocat a quick one?");
        await app.refresh();
        expect(arrivals(app.classified(), missing, lastFetch).map((c) => c.item.id)).toEqual([other.id]);
      },
    },
  ]);
});

describe("answered questions", () => {
  walk([
    {
      situation: "a due follow-up on an assignment comes into the inbox",
      run: async (world, app) => {
        const issue = world.issue({ assignees: [ME] });
        await app.refresh();
        app.snooze(issue, later(world, DAY));
        world.advance(2 * DAY);
        expect(viewsOf(app.entry(issue))).toEqual(["inbox", "assigned"]);
      },
    },
    {
      situation: "a due follow-up on an assignment whose part is done comes into the inbox",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        app.snooze(issue, later(world, DAY));
        world.advance(2 * DAY);
        expect(viewsOf(app.entry(issue))).toEqual(["inbox", "assigned"]);
      },
    },
    {
      situation: "an own issue assigned to me is in Assigned to me and Created by me",
      run: async (world, app) => {
        const issue = world.issue({ author: ME, assignees: [ME] });
        await app.refresh();
        expect(viewsOf(app.entry(issue))).toEqual(["assigned", "authored"]);
      },
    },
    {
      situation: "D on an own issue in Assigned to me sets my part done, and it stays",
      run: async (world, app) => {
        const issue = world.issue({ author: ME, assignees: [ME] });
        await app.refresh();
        app.done(issue);
        expect(app.entry(issue)).toMatchObject({ status: "done", updates: [] });
      },
    },
  ]);
});
