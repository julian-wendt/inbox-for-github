import { datedOf } from "../../ui/plan";
import { classify, type Classified } from "../../classify";
import { snapshotOf } from "../../handoff";
import type { Item, Reopen, StatusChange, StatusExtra, Status, StoredStatus } from "../../model";
import { REOPEN_DEFAULT, snoozeEnded } from "../../reopen";
import { ruleSwitches } from "../../rules";
import { directOnly } from "../../rules/directOnly";
import { sameLogin } from "../../timeline";
import { onPlate, withAssignees, withSelfAssigned } from "../../ui/assignments";
import { isOwnOpen } from "../../ui/authored";
import { viewOf, type View } from "../../ui/labels";
import { movedKeys, movedLists } from "../../transfer";
import { followUpOf } from "../../ui/followUp";
import { planStatus } from "../../ui/statusPlan";
import { addComment, assignSelf, setOpen, unassignSelf, type CloseReason } from "../comment";
import { canDelta, DELTA_OVERLAP_MS, findTransfers, mergeDelta, withinClosedWindow } from "../delta";
import { fetchItem, fetchItems } from "../fetch";
import type { GitHubSimulator, Ref } from "./world";

const TOKEN = "simulated-token";
const DELTA_PAGE_SIZE = 20;

export interface SessionSettings {
  orgs?: string[];
  closedDays?: number;
  loadBoards?: boolean;
  maxItems?: number;
  reopenOn?: Reopen;
  reviewOnCommits?: boolean;
  rules?: Record<string, boolean>;
  directOnly?: Record<string, string[]>;
}

/**
 * The app without its window: what `useInbox` and `App` do with fetched items, statuses and
 * follow-ups, driven against a `GitHubSimulator` through the real GitHub client. It fetches in
 * full or as deltas, reloads single items, files items with the real `planStatus`, writes to
 * GitHub the way `App` does (at once locally, then queued, put back on failure), settles the
 * automatic status changes the hook makes, and classifies with the real `classify`.
 *
 * Statuses and the status log live in maps instead of SQLite. Nothing here is a second
 * implementation of a rule: wherever the app decides, this calls the same function.
 *
 * @example
 *   const app = new InboxSession(world);
 *   await app.refresh();
 *   app.viewOf(issue); // "inbox"
 *   app.done(issue);
 */
export class InboxSession {
  readonly me: string;
  items: Item[] = [];
  readonly statuses = new Map<string, StoredStatus>();
  readonly log = new Map<string, StatusChange[]>();
  readonly writeFailures = new Map<string, { kind: "assign" | "unassign"; error: string }[]>();
  readonly settings: Required<SessionSettings>;
  private last: { fetchedAt: Date; fullAt: Date; key: string } | null = null;
  private undoStep: (() => void) | null = null;

  constructor(
    readonly world: GitHubSimulator,
    settings: SessionSettings = {},
  ) {
    this.me = world.viewer;
    this.settings = { orgs: world.orgs, closedDays: 7, loadBoards: true, maxItems: 200, reopenOn: REOPEN_DEFAULT, reviewOnCommits: true, rules: {}, directOnly: {}, ...settings };
  }

  private get nowMs(): number {
    return this.world.now.getTime();
  }

  /** ⌘R: a delta when the last full fetch is younger than an hour, else a full fetch; ⇧⌘R (`full`) always the latter. @returns Which, and the points it cost. */
  async refresh(full = false): Promise<{ kind: "full" | "delta"; cost: number }> {
    const { orgs, closedDays, loadBoards, maxItems } = this.settings;
    const key = JSON.stringify([orgs, this.me]);
    const delta = !full && !!this.last && canDelta({ fullAt: this.last.fullAt, scope: this.last.key }, key, this.nowMs);
    const before = this.world.requests.length;
    const fetched = await fetchItems(TOKEN, orgs, {
      limit: maxItems,
      closedDays,
      me: this.me,
      boards: loadBoards,
      now: this.world.now,
      ...(delta && { since: new Date(this.last!.fetchedAt.getTime() - DELTA_OVERLAP_MS), pageSize: DELTA_PAGE_SIZE }),
    });
    const moves = findTransfers(this.items, fetched);
    this.carryOver(moves);
    this.items = (delta ? mergeDelta(this.items, fetched, closedDays, this.nowMs) : fetched).filter((item) => !moves.has(item.id));
    this.last = { fetchedAt: this.world.now, fullAt: delta ? this.last!.fullAt : this.world.now, key };
    return { kind: delta ? "delta" : "full", cost: this.world.requests.slice(before).reduce((sum, r) => sum + r.cost, 0) };
  }

  /** ⌃R: loads one item again and keeps the reasons only a search can tell (a review request); one GitHub no longer resolves goes after a refresh, as in `useInbox`. */
  async reload(ref: Ref): Promise<void> {
    const fresh = await fetchItem(TOKEN, ref.id, { me: this.me, boards: this.settings.loadBoards });
    if (!fresh) {
      await this.refresh();
      this.items = this.items.filter((item) => item.id !== ref.id);
      return;
    }
    this.items = this.items.map((old) => (old.id === ref.id ? { ...fresh, reasons: [...old.reasons.filter((r) => r === "review" || r === "involved"), ...fresh.reasons] } : old));
  }

  /** ⌘↵ in the comment box: posts, then loads just that item. */
  async comment(ref: Ref, body: string): Promise<void> {
    await addComment(TOKEN, ref.id, body);
    await this.reload(ref);
  }

  /** Closes or reopens on GitHub, then loads the item. */
  async setOpen(ref: Ref, action: "close" | "reopen", reason?: CloseReason): Promise<void> {
    await setOpen(TOKEN, ref, action, reason);
    await this.reload(ref);
  }

  /** ⌃A on an item the viewer is not assigned to. @returns The error when GitHub refused and the item went back. */
  async assignMe(ref: Ref): Promise<string | null> {
    const before = this.item(ref);
    this.replace(withSelfAssigned(before, this.me, this.world.stamp()));
    try {
      this.replace(withAssignees(this.item(ref), await assignSelf(TOKEN, ref.id), this.me));
      return null;
    } catch (e) {
      const { assignees, reasons, activities } = before;
      this.replace({ ...this.item(ref), assignees, reasons, activities });
      this.fail(ref, "assign", String(e));
      return String(e);
    }
  }

  /** ⌃A on an assignment: the viewer leaves, the stored status goes, and both come back on failure. */
  async leave(ref: Ref): Promise<string | null> {
    const before = this.item(ref);
    const previous = this.statuses.get(ref.id);
    this.statuses.delete(ref.id);
    this.replace({
      ...before,
      assignees: before.assignees.filter((a) => !sameLogin(a, this.me)),
      reasons: before.reasons.filter((r) => r !== "assigned"),
      activities: [...before.activities, { kind: "unassigned", at: this.world.stamp(), actor: this.me, assignee: this.me }],
    });
    try {
      this.replace(withAssignees(this.item(ref), await unassignSelf(TOKEN, ref.id), this.me));
      return null;
    } catch (e) {
      const { assignees, reasons, activities } = before;
      this.replace({ ...this.item(ref), assignees, reasons, activities });
      if (previous) this.statuses.set(ref.id, previous);
      this.fail(ref, "unassign", String(e));
      return String(e);
    }
  }

  /** D or O or a snooze choice, as `App.applyStatus` carries it out. */
  choose(ref: Ref, status: Status, until?: string): void {
    const c = this.entry(ref);
    const previous = this.statuses.get(ref.id);
    const logged = this.log.get(ref.id) ?? [];
    const restore = () => {
      this.log.set(ref.id, logged);
      if (previous) this.statuses.set(ref.id, previous);
      else this.statuses.delete(ref.id);
    };
    const plan = planStatus(c, status, this.me);
    switch (plan.do) {
      case "resume":
      case "clear":
        this.statuses.delete(ref.id);
        break;
      case "blocked":
        return;
      case "tick-update":
      case "hand-off":
        this.write(ref.id, "done", false, { handoff: snapshotOf(c.item) });
        break;
      case "set":
        if (c.item.closed || (c.status === plan.status && until === undefined)) return;
        this.write(ref.id, plan.status, false, until ? { until } : {});
        break;
      case "none":
        return;
    }
    this.undoStep = restore;
  }

  done(ref: Ref): void {
    this.choose(ref, "done");
  }

  open(ref: Ref): void {
    this.choose(ref, "open");
  }

  /** F with a time (or without): the item waits for a follow-up, in place if it belongs to a table. */
  snooze(ref: Ref, until?: string): void {
    this.choose(ref, "snoozed", until);
  }

  /** X or the × in the chip: takes the follow-up off, as if never set. */
  clearFollowUp(ref: Ref): void {
    const previous = this.statuses.get(ref.id);
    const logged = this.log.get(ref.id) ?? [];
    this.statuses.delete(ref.id);
    this.undoStep = () => {
      this.log.set(ref.id, logged);
      if (previous) this.statuses.set(ref.id, previous);
    };
  }

  /** The follow-up date the item waits for, which its bell and chip show; null once it is back. */
  followUp(ref: Ref): string | null {
    return followUpOf(this.entry(ref))?.at ?? null;
  }

  /** ⌘Z: takes back the last status change, without a log line. */
  undo(): void {
    this.undoStep?.();
    this.undoStep = null;
  }

  /** The items as the app classifies them now, after the automatic changes the hook writes back. */
  classified(): Classified[] {
    const switches = ruleSwitches(this.settings.rules);
    const list = () =>
      withinClosedWindow(this.items, this.settings.closedDays, this.nowMs).map((raw) => {
        const item = directOnly(raw, this.me, this.settings.directOnly);
        return classify(item, this.me, this.statuses.get(item.id), switches, this.settings.reopenOn, this.nowMs, this.settings.reviewOnCommits);
      });
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (const c of list()) changed = this.settle(c) || changed;
      if (!changed) break;
    }
    return list();
  }

  entry(ref: Ref): Classified {
    const found = this.classified().find((c) => c.item.id === ref.id);
    if (!found) throw new Error(`${ref.id} is not among the fetched items`);
    return found;
  }

  /** The view the item stands in, or null where it shows nowhere. */
  viewOf(ref: Ref): View | null {
    const c = this.classified().find((e) => e.item.id === ref.id);
    return c ? viewOf(c, this.me) : null;
  }

  /** What each view holds, by item id: the tables by their own rule, the lists by bucket. */
  views(): Record<View, string[]> {
    const all = this.classified();
    const ids = (keep: (c: Classified) => boolean) => all.filter(keep).map((c) => c.item.id);
    return {
      inbox: ids((c) => c.bucket === "inbox"),
      assigned: ids((c) => onPlate(c, this.me)),
      authored: ids((c) => isOwnOpen(c, this.me)),
      planned: ids((c) => datedOf(c, [], []) !== null),
      done: ids((c) => c.bucket === "done"),
    };
  }

  /** Whether the item is on the viewer's plate ("Assigned to me" or its "later" bar). */
  onPlate(ref: Ref): boolean {
    return onPlate(this.entry(ref), this.me);
  }

  private item(ref: Ref): Item {
    const found = this.items.find((i) => i.id === ref.id);
    if (!found) throw new Error(`${ref.id} is not among the fetched items`);
    return found;
  }

  private replace(next: Item): void {
    this.items = this.items.map((i) => (i.id === next.id ? next : i));
  }

  /** What `Store.moveItems` does for transferred issues, on the session's maps. */
  private carryOver(moves: ReadonlyMap<string, string>): void {
    const refill = <T>(map: Map<string, T>, next: Map<string, T>) => {
      map.clear();
      for (const [id, value] of next) map.set(id, value);
    };
    refill(this.statuses, movedKeys(this.statuses, moves));
    refill(this.log, movedLists(this.log, moves));
    refill(this.writeFailures, movedLists(this.writeFailures, moves));
  }

  private fail(ref: Ref, kind: "assign" | "unassign", error: string): void {
    this.writeFailures.set(ref.id, [...(this.writeFailures.get(ref.id) ?? []), { kind, error }]);
  }

  private write(id: string, status: Status, automatic: boolean, extra: StatusExtra = {}, source?: string): void {
    this.statuses.set(id, { status, changedAt: this.world.stamp(), ...extra });
    this.log.set(id, [...(this.log.get(id) ?? []), { status, at: this.world.stamp(), automatic, ...(source && { source }) }]);
  }

  /** The automatic writes `useInbox` makes for one classification; true when it wrote. */
  private settle(c: Classified): boolean {
    const { id } = c.item;
    if (c.statusReset) {
      this.write(id, "open", true, {}, snoozeEnded(this.statuses.get(id), this.nowMs) ? "auto:snooze-ended" : "auto:reopen");
      return true;
    }
    const ownPr = c.item.kind === "pr" && sameLogin(c.item.author, this.me);
    if (c.status === "done" && c.answered === null && !c.updates && !c.item.closed && !ownPr && c.item.reasons.includes("assigned")) {
      this.write(id, "done", true, { handoff: snapshotOf(c.item) });
      return true;
    }
    return false;
  }
}
