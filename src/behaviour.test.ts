import { describe, expect, it } from "vitest";
import { ASK_RULES_DEFAULT, classify, type Classified } from "./classify";
import { REOPEN_DEFAULT } from "./reopen";
import { ruleSwitches } from "./rules";
import { latest } from "./timeline";
import type { InboxSession } from "./github/simulate/session";
import { DAY, HOUR, MINUTE, simulation } from "./github/simulate/vitest";
import type { GitHubSimulator, Ref } from "./github/simulate/world";
import { isNewAssignment, onPlate } from "./ui/assignments";
import { isOwnOpen } from "./ui/authored";
import { isWaiting } from "./ui/followUp";
import { VIEWS, type View } from "./ui/labels";
import { datedOf, unplan } from "./ui/plan";
import { doneAccess } from "./ui/statusPlan";

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

/** Every view the entry shows in, in sidebar order; `pinned` puts it on Today, as T does. */
function viewsOf(c: Classified, pinned = false): View[] {
  const shows: Record<View, boolean> = {
    inbox: c.bucket === "inbox",
    planned: datedOf(c, pinned ? [c.item.id] : [], []) !== null,
    snoozed: isWaiting(c),
    assigned: onPlate(c, ME),
    authored: isOwnOpen(c, ME),
    done: c.bucket === "done",
  };
  return VIEWS.map((v) => v.id).filter((v) => shows[v]);
}

/** The entry pinned for today at `plannedAt` (T sets handled-until), classified as `useInbox` does; the session has no plans. */
function pinned(app: InboxSession, ref: Ref, plannedAt: string): Classified {
  const item = app.items.find((i) => i.id === ref.id)!;
  return classify(item, ME, app.statuses.get(ref.id), ruleSwitches(), REOPEN_DEFAULT, app.world.now.getTime(), true, latest(app.handledUntil.get(ref.id), plannedAt) ?? undefined, ASK_RULES_DEFAULT, true);
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
      diverges: "#108: a new request does not lift the done D stored",
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
      diverges: "#108: the Open written on the reset is newer than the reply, which then no longer asks",
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
      diverges: "#108: the reset drops what D handled, and the mention asks again",
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
      diverges: "#108: a reopen asks only where a status is stored",
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
        expect(app.entry(issue)).toMatchObject({ bucket: "inbox", asks: ["reopened"] });
      },
    },
    {
      situation: "a due follow-up on a pending mention, although F handled it",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.snooze(issue, later(world, DAY));
        world.advance(2 * DAY);
        expect(app.entry(issue)).toMatchObject({ bucket: "inbox", asks: ["mention"] });
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
      diverges: "#106: it stores a done instead of filing",
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
        expect(viewsOf(app.entry(issue))).toEqual(["assigned"]);
      },
    },
  ]);
});

describe("rule 3, closed items", () => {
  walk([
    {
      situation: "D on a closed item with news in the inbox sets handled-until and writes no done",
      diverges: "#106: it writes a stored done again (tick-update)",
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
      diverges: "#109: Done is still one of the views",
      run: () => {
        expect(VIEWS.map((v) => v.id)).not.toContain("done");
      },
    },
    {
      situation: "a mention filed with D on an assignment is in Done",
      diverges: "#109: filed asks show in no Done view",
      run: async (world, app) => {
        const issue = await mentioned(world, app, { assignees: [ME] });
        app.done(issue);
        expect(viewsOf(app.entry(issue))).toContain("done");
      },
    },
    {
      situation: "what was handled more than 7 days ago leaves Done",
      diverges: "#109: Done keeps it for good",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        await app.comment(issue, "Will do.");
        world.advance(8 * DAY);
        expect(viewsOf(app.entry(issue))).not.toContain("done");
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
      diverges: "#107: the follow-up replaces the hand-off",
      run: async (world, app) => {
        const issue = await handedOff(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        expect(viewsOf(app.entry(issue))).toContain("snoozed");
        expect(app.statuses.get(issue.id)?.status).toBe("done");
        expect(app.statuses.get(issue.id)?.handoff).toBeDefined();
      },
    },
    {
      situation: "X takes off the follow-up only; the asks F handled stay out of the inbox",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        app.clearFollowUp(issue);
        expect(viewsOf(app.entry(issue))).not.toContain("inbox");
      },
    },
  ]);
});

describe("rule 5, one when", () => {
  walk([
    {
      situation: "unplan clears the day plan that F replaces, and the item then only waits",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        const at = world.stamp();
        const day = at.slice(0, 10);
        const today = { focus: [issue.id], focusDay: day, planned: [], pinnedOn: { [issue.id]: day }, plannedAt: { [issue.id]: at } };
        expect(unplan(today, [issue.id])).toEqual({ focus: [], focusDay: day, planned: [], pinnedOn: {}, plannedAt: {} });
        app.snooze(issue, later(world, 3 * DAY));
        expect(viewsOf(app.entry(issue))).toEqual(["snoozed"]);
      },
    },
    {
      situation: "clearing the follow-up leaves only the plan",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        app.snooze(issue, later(world, 3 * DAY));
        app.clearFollowUp(issue);
        expect(viewsOf(pinned(app, issue, world.stamp()), true)).toEqual(["planned"]);
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
        expect(viewsOf(pinned(app, issue, world.stamp()), true)).toEqual(["planned"]);
      },
    },
    {
      situation: "T on an assignment: out of the inbox, in Planned and Assigned to me",
      run: async (world, app) => {
        const issue = await mentioned(world, app, { assignees: [ME] });
        expect(viewsOf(pinned(app, issue, world.stamp()), true)).toEqual(["planned", "assigned"]);
      },
    },
    {
      situation: "a mention after T asks again",
      run: async (world, app) => {
        const issue = await mentioned(world, app);
        const at = world.stamp();
        world.advance(HOUR);
        world.comment(issue, "bob", "@octocat and now?");
        await refetch(world, app, issue);
        expect(viewsOf(pinned(app, issue, at), true)).toEqual(["inbox", "planned"]);
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

describe("answered questions", () => {
  walk([
    {
      situation: "a due follow-up on an assignment comes into the inbox",
      diverges: "#108: it ends in its table without an ask",
      run: async (world, app) => {
        const issue = world.issue({ assignees: [ME] });
        await app.refresh();
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
