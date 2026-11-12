import { describe, expect, it } from "vitest";
import { DAY, HOUR, MINUTE, simulation } from "../github/simulate/vitest";
import type { InboxSession } from "../github/simulate/session";
import type { Ref } from "../github/simulate/world";
import type { Classified } from "../classify";
import type { Item } from "../model";
import { handledAt, inDoneBar, listBars } from "./doneBar";
import { setLang } from "./i18n";

const ME = "octocat";

const at = (app: InboxSession, ref: Ref) => handledAt(app.entry(ref), app.handledUntil.get(ref.id), ME);
const inBar = (app: InboxSession, ref: Ref, dated = false) => inDoneBar(app.entry(ref), app.handledUntil.get(ref.id), ME, app.world.now.getTime(), dated);

describe("handledAt", () => {
  const sim = simulation();

  it("takes the reply to a mention", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat could you look?");
    await app.refresh();
    world.advance(HOUR);
    await app.comment(issue, "Will do.");
    expect(at(app, issue)).toBe(app.entry(issue).item.comments.at(-1)!.createdAt);
  });

  it("leaves an own issue to Created by me after the viewer answered a mention on it", async () => {
    const { world, app } = sim;
    const issue = world.issue({ author: ME });
    world.comment(issue, "alice", "@octocat which version?");
    await app.refresh();
    world.advance(HOUR);
    await app.comment(issue, "The latest.");
    expect(app.views().authored).toContain(issue.id);
    expect(at(app, issue)).toBeNull();
    expect(app.views().done).not.toContain(issue.id);
  });

  it("takes handled-until for a mention filed on an assignment", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: [ME] });
    world.comment(issue, "alice", "@octocat could you look?");
    await app.refresh();
    app.done(issue);
    expect(at(app, issue)).toBe(app.handledUntil.get(issue.id));
  });

  it("takes the closing of a closed item that was for the viewer", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat FYI");
    world.advance(HOUR);
    world.close(issue, "alice");
    await app.refresh();
    expect(at(app, issue)).toBe(app.entry(issue).item.closed!.at);
  });

  it("takes the time of a done stored before handled-until", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, ME, "Noted.");
    await app.refresh();
    const changedAt = world.stamp();
    app.statuses.set(issue.id, { status: "done", changedAt });
    expect(at(app, issue)).toBe(changedAt);
  });

  it("is null while the item asks or waits", async () => {
    const { world, app } = sim;
    const asking = world.issue();
    world.comment(asking, "alice", "@octocat could you look?");
    const waiting = world.issue();
    world.comment(waiting, "alice", "@octocat could you look?");
    await app.refresh();
    app.snooze(waiting, new Date(world.now.getTime() + DAY).toISOString());
    expect([at(app, asking), at(app, waiting)]).toEqual([null, null]);
  });

  it("is null for a waiting item an ask brought into the inbox", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat could you look?");
    await app.refresh();
    app.snooze(issue, new Date(world.now.getTime() + 3 * DAY).toISOString());
    world.advance(HOUR);
    world.comment(issue, "bob", "@octocat and this?");
    world.advance(MINUTE);
    await app.reload(issue);
    expect(app.entry(issue)).toMatchObject({ bucket: "inbox", status: "snoozed" });
    expect(at(app, issue)).toBeNull();
  });

  it("takes a past-due follow-up filed with D, which no longer waits", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat could you look?");
    await app.refresh();
    app.snooze(issue, new Date(world.now.getTime() + DAY).toISOString());
    world.advance(2 * DAY);
    expect(app.entry(issue).asks).toContain("due");
    app.done(issue);
    expect(app.entry(issue).status).not.toBe("snoozed");
    expect(at(app, issue)).toBe(app.handledUntil.get(issue.id));
  });

  it("is null for my part done, waiting or not; it stays in the bar Finished", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: [ME] });
    await app.refresh();
    app.done(issue);
    world.advance(HOUR);
    app.snooze(issue, new Date(world.now.getTime() + DAY).toISOString());
    expect(app.entry(issue)).toMatchObject({ status: "snoozed", updates: [] });
    expect(at(app, issue)).toBeNull();
    app.clearFollowUp(issue);
    expect(app.entry(issue)).toMatchObject({ status: "done", updates: [] });
    expect(at(app, issue)).toBeNull();
  });

  it("is null while the closing of a finished part assigned anew asks as news", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: [ME] });
    await app.refresh();
    app.done(issue);
    world.advance(HOUR);
    world.unassign(issue, "alice", ME);
    world.assign(issue, "alice", ME);
    world.advance(HOUR);
    world.close(issue, "alice");
    await app.refresh();
    expect(app.entry(issue)).toMatchObject({ bucket: "inbox", asks: ["update"] });
    expect(at(app, issue)).toBeNull();
  });

  it("is null for an assignment reopened before the viewer ever handled it", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: [ME] });
    world.close(issue, "bob");
    world.advance(HOUR);
    world.reopen(issue, "bob");
    await app.refresh();
    expect(app.entry(issue)).toMatchObject({ bucket: "assigned", asks: [] });
    expect(at(app, issue)).toBeNull();
    expect(app.views().done).not.toContain(issue.id);
  });
});

describe("inDoneBar", () => {
  const sim = simulation({ closedDays: 30 });

  it("keeps an open item for 7 days after it was handled", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat could you look?");
    await app.refresh();
    app.done(issue);
    world.advance(7 * DAY - MINUTE);
    expect(inBar(app, issue)).toBe(true);
    world.advance(2 * MINUTE);
    expect(inBar(app, issue)).toBe(false);
  });

  it("leaves a planned item to Planned", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat could you look?");
    await app.refresh();
    app.done(issue);
    expect(inBar(app, issue, true)).toBe(false);
  });

  it("keeps a closed item as long as it is loaded", async () => {
    const { world, app } = sim;
    const issue = world.issue();
    world.comment(issue, "alice", "@octocat FYI");
    world.close(issue, "alice");
    await app.refresh();
    world.advance(20 * DAY);
    expect(inBar(app, issue)).toBe(true);
  });

  it("leaves out a finished part whose closing was ticked off, once it is no longer for the viewer", async () => {
    const { world, app } = sim;
    const issue = world.issue({ assignees: [ME] });
    await app.refresh();
    app.done(issue);
    world.advance(HOUR);
    world.close(issue, "alice");
    await app.refresh();
    expect(app.entry(issue).asks).toEqual(["update"]);
    app.done(issue);
    world.advance(20 * DAY);
    expect(app.entry(issue).bucket).toBe("involved");
    expect(inBar(app, issue)).toBe(false);
  });
});

describe("listBars", () => {
  setLang("en");
  const row = (id: string, ring = false): Classified => ({ item: { id } as Item, bucket: "inbox", status: "open", mention: null, answered: null, asks: ring ? ["due"] : ["review"], statusAt: null, asked: {}, ...(ring && { notify: true as const }) });
  const timed = (rows: Classified[]) => [{ group: "today", heading: "Today", entries: rows }];
  const shape = (bars: ReturnType<typeof listBars>) => bars?.map((b) => `${b.group}:${b.heading}:${b.entries.map((c) => c.item.id).join(",")}`);
  const rows = [row("I_1"), row("I_2", true)];

  it("puts the rows that ring on top, the rest in their time groups, and the Done bar last", () => {
    expect(shape(listBars(rows, true, [row("I_3")], timed))).toEqual(["ringing:Reminders:I_2", "today:Today:I_1", "done:Done:I_3"]);
  });

  it("rings only in the inbox", () => {
    expect(shape(listBars(rows, false, [], timed))).toEqual(["today:Today:I_1,I_2"]);
  });

  it("without time groups: rows under no bar, under Inbox below Reminders, and no bars at all when there are none", () => {
    expect(listBars([row("I_1")], true, [], null)).toBeUndefined();
    expect(shape(listBars([row("I_1")], true, [row("I_3")], null))).toEqual(["::I_1", "done:Done:I_3"]);
    expect(shape(listBars(rows, true, [], null))).toEqual(["ringing:Reminders:I_2", "rest:Inbox:I_1"]);
    expect(shape(listBars([row("I_2", true)], true, [], null))).toEqual(["ringing:Reminders:I_2"]);
  });
});
