import type { Classified } from "../classify";
import type { Item, Status } from "../model";
import { isBot, latest, posts, sameLogin } from "../timeline";
import { workStatus, type StatusMap } from "../workStatus";
import type { AuthoredGroup } from "./authored";
import type { SnoozeGroup } from "./timeGroups";

/**
 * A bar in the "Assigned to me" table: the work statuses, "later" for snoozed or blocked ones,
 * and "finished" for what is done but still open on GitHub: done on its board, or the viewer's
 * part done. Assignments not opened yet sit in their work status bar, marked as new in their row;
 * so do those pinned for today or planned for a day, with their star or day (Planned lists them).
 */
export type PlateGroup = "review" | "progress" | "todo" | "later" | "finished";

/** A bar of the tables in any grouping: a work status bar, a type bar (see `groupByType`), a bar of Created by me or a day bar of Planned. */
export type TableGroup = PlateGroup | TypeGroup | AuthoredGroup | DayGroup;

/** A day bar of Planned as a table: `day:today` to `day:undated` (see `groupBySnoozeEnd`). */
export type DayGroup = `day:${SnoozeGroup}`;

/** A type bar: pull requests, one issue type by name (`type:Bug`), or issues without a type. */
export type TypeGroup = "pr" | `type:${string}` | "notype";

/** Issue types by urgency, lowercased; types not listed sit between "bug" and "task". */
const TYPE_RANK = ["bug", "", "task", "feature", "story", "epic"];

/** Within a type bar, what is furthest along comes first. */
const WORK_RANK = ["review", "progress", "todo", "done", "snoozed"];

function typeRank(group: TypeGroup): number {
  if (group === "pr") return -1;
  if (group === "notype") return TYPE_RANK.length;
  const rank = TYPE_RANK.indexOf(group.slice(5).toLowerCase());
  return rank < 0 ? 1 : rank;
}

/**
 * One bar per kind of work, most urgent first: pull requests (to review or finish for others),
 * then issues by their type (bugs first, then other types, tasks, features, stories, epics),
 * and issues without a type last. Types outside that list sort by name among themselves. Each
 * bar holds what is furthest along first (in review, in progress, backlog, done on the board),
 * then by when the viewer was assigned (`assignedAt`), in the given order.
 *
 * @param entries    The table's items, without "Today" and the snoozed bar.
 * @param statusMap  The viewer's board status mapping, for the work status.
 * @param order      "newest" or "oldest", by the assignment time within the same work status.
 * @param me         The viewer's login, for the assignment time.
 *
 * @example
 *   groupByType(entries, {}); // [{ group: "type:Bug", entries }, { group: "type:Feature", entries }, { group: "notype", entries }]
 */
export function groupByType(entries: Classified[], statusMap: StatusMap = {}, order: "newest" | "oldest" = "newest", me = ""): { group: TypeGroup; entries: Classified[] }[] {
  const byType = new Map<TypeGroup, Classified[]>();
  for (const entry of entries) {
    const group: TypeGroup = entry.item.kind === "pr" ? "pr" : entry.item.issueType ? `type:${entry.item.issueType.name}` : "notype";
    byType.set(group, [...(byType.get(group) ?? []), entry]);
  }
  const updated = (c: Classified) => assignedAt(c.item, me).at;
  const within = (a: Classified, b: Classified) =>
    WORK_RANK.indexOf(workStatus(a.item, statusMap)) - WORK_RANK.indexOf(workStatus(b.item, statusMap)) ||
    (order === "newest" ? updated(b).localeCompare(updated(a)) : updated(a).localeCompare(updated(b)));
  return [...byType.keys()]
    .sort((a, b) => typeRank(a) - typeRank(b) || a.localeCompare(b))
    .map((group) => ({ group, entries: byType.get(group)!.sort(within) }));
}

/** The bars in display order. */
export const PLATE_GROUPS: PlateGroup[] = ["review", "progress", "todo", "later", "finished"];

/**
 * What counts as activity besides posts and reviews by others (the "movesUp" setting). The
 * viewer's own activity never counts.
 */
export interface MovesUp {
  /** Pushed commits; GitHub names no pusher, so the viewer's own count too. */
  commits: boolean;
  /** Timeline events: assignments, review requests, state changes, links, force pushes. */
  events: boolean;
  /** Posts and events by bots. */
  bots: boolean;
}

export const MOVES_UP_DEFAULT: MovesUp = { commits: false, events: true, bots: false };

/**
 * The latest post or activity by someone other than the viewer, or null.
 *
 * @param counted  Which activity counts besides posts and reviews by people; the default leaves
 *                 out commits and bots.
 *
 * @example
 *   lastOthersActivity(item, "octocat", { ...MOVES_UP_DEFAULT, commits: true }); // "2026-10-21T09:12:00Z"
 */
export function lastOthersActivity(item: Item, me: string, counted: MovesUp = MOVES_UP_DEFAULT): string | null {
  const byOther = (login: string) => !sameLogin(login, me) && (counted.bots || !isBot(login));
  const counts = (a: Item["activities"][number]) => {
    if (a.kind === "commit") return counted.commits;
    return byOther(a.actor) && (a.kind === "reviewed" || counted.events);
  };
  const times = [...posts(item).filter((p) => byOther(p.author)).map((p) => p.at), ...item.activities.filter(counts).map((a) => a.at)];
  return times.sort().at(-1) ?? null;
}

/**
 * The viewer's plate for "Assigned to me": every open item assigned to them that is not done,
 * in the table's bars. Snoozed ones go to "later", the rest by their work status (see
 * `workStatus`), where a blocked board status also counts as "later". Each bar is sorted by when
 * the viewer was assigned (`assignedAt`), newest first.
 *
 * @param entries    All classified items; only current assignments that are open or snoozed are used,
 *                   without the viewer's own pull requests, which belong to "Created by me".
 * @param statusMap  The viewer's board status mapping.
 * @param order      The viewer's bar order (see `orderBars`); bars it names that no longer exist are ignored.
 * @param me         The viewer's login.
 * @returns The non-empty bars in that order.
 *
 * @example
 *   groupPlate(classified, settings.statusMap); // [{ group: "review", entries }, { group: "todo", entries }, …]
 */
export function groupPlate(entries: Classified[], statusMap: StatusMap = {}, order: PlateGroup[] = [], me = ""): { group: PlateGroup; entries: Classified[] }[] {
  const groups = new Map<PlateGroup, Classified[]>(PLATE_GROUPS.map((g) => [g, []]));
  for (const entry of entries.filter((e) => onPlate(e, me))) groups.get(plateGroup(entry, statusMap))!.push(entry);
  const newest = (a: Classified, b: Classified) => assignedAt(b.item, me).at.localeCompare(assignedAt(a.item, me).at);
  return orderBars(order)
    .map((group) => ({ group, entries: groups.get(group)!.sort(newest) }))
    .filter((g) => g.entries.length > 0);
}

/**
 * The viewer's bar order, completed with any bars it leaves out: each goes before the first bar
 * that follows it by default, so a bar added later lands where it belongs in a saved order.
 *
 * @example
 *   orderBars(["review", "focus", "progress", "todo", "later", "finished"]); // "planned" before "later"
 */
export function orderBars(order: PlateGroup[]): PlateGroup[] {
  const bars = order.filter((g) => PLATE_GROUPS.includes(g));
  for (const group of PLATE_GROUPS.filter((g) => !bars.includes(g))) {
    const next = PLATE_GROUPS.slice(PLATE_GROUPS.indexOf(group) + 1).find((g) => bars.includes(g));
    bars.splice(next ? bars.indexOf(next) : bars.length, 0, group);
  }
  return bars;
}

/** Moves `bar` to just before `target`, for drag and drop. */
export function moveBar(order: PlateGroup[], bar: PlateGroup, target: PlateGroup): PlateGroup[] {
  const without = orderBars(order).filter((g) => g !== bar);
  without.splice(without.indexOf(target), 0, bar);
  return without;
}

/**
 * The status an item's icon shows in the tables: the viewer's own, except that an open item its
 * board calls done shows as done, as the "finished" bar files it. Nothing is stored.
 *
 * @example
 *   shownStatus(entryOnDoneColumn, statusMap); // "done", though `entry.status` is "open"
 */
export function shownStatus(entry: Pick<Classified, "item" | "status">, statusMap: StatusMap): Status {
  return entry.status === "open" && workStatus(entry.item, statusMap) === "done" ? "done" : entry.status;
}

function plateGroup(entry: Classified, statusMap: StatusMap): PlateGroup {
  if (entry.updates) return "finished";
  if (entry.status === "snoozed") return "later";
  const work = workStatus(entry.item, statusMap);
  return work === "snoozed" ? "later" : work === "done" ? "finished" : work;
}

/**
 * When the viewer was last assigned to the item, and by whom, from its assignment events. Without
 * one (the events reach back only so far), the opening time stands in, with no one named.
 *
 * @example
 *   assignedAt(item, "octocat"); // { at: "2026-10-09T10:00:00Z", by: "bob" }
 */
export function assignedAt(item: Pick<Item, "activities" | "createdAt">, me: string): { at: string; by: string | null } {
  const last = item.activities.filter((a) => a.kind === "assigned" && sameLogin(a.assignee, me)).at(-1);
  return last && last.kind === "assigned" ? { at: last.at, by: last.actor } : { at: item.createdAt, by: null };
}

/**
 * The item as it looks once the viewer assigned themselves: in the assignees, with the reason
 * "assigned" and an assignment event by themselves, so it is never marked new.
 *
 * @example
 *   withSelfAssigned(item, "octocat", new Date().toISOString());
 */
export function withSelfAssigned(item: Item, me: string, at: string): Item {
  if (item.assignees.some((a) => sameLogin(a, me))) return item;
  return {
    ...item,
    assignees: [...item.assignees, me],
    reasons: item.reasons.includes("assigned") ? item.reasons : [...item.reasons, "assigned"],
    activities: [...item.activities, { kind: "assigned", at, actor: me, assignee: me }],
  };
}

/**
 * The item with GitHub's assignees after a write, and the reason "assigned" to match, so it is
 * in Assigned to me exactly when the viewer is among them, whatever a refresh in between left.
 *
 * @example
 *   withAssignees(item, ["alice"], "octocat"); // no longer assigned to octocat
 */
export function withAssignees(item: Item, assignees: string[], me: string): Item {
  const mine = assignees.some((a) => sameLogin(a, me));
  const others = item.reasons.filter((r) => r !== "assigned");
  return { ...item, assignees, reasons: mine ? [...others, "assigned"] : others };
}

/** Currently assigned, not closed, open, snoozed or with the viewer's part done, and not a pull request of the viewer's own. */
export function onPlate({ item, status, updates }: Pick<Classified, "item" | "status" | "updates">, me: string): boolean {
  const ownPr = item.kind === "pr" && sameLogin(item.author, me);
  return !item.closed && !ownPr && item.reasons.includes("assigned") && (status === "open" || status === "snoozed" || !!updates);
}

/**
 * An assignment the viewer has not opened since it was made. Assigning oneself is never new;
 * without an assignment event, only an item never opened is.
 *
 * @param seen  When the viewer last opened each item (`useInbox().seen`).
 *
 * @example
 *   isNewAssignment(entry, inbox.seen, "octocat"); // true until octocat opens it
 */
export function isNewAssignment(entry: Pick<Classified, "item" | "statusAt">, seen: Map<string, string>, me: string): boolean {
  const since = latest(seen.get(entry.item.id), entry.statusAt);
  const last = entry.item.activities.filter((a) => a.kind === "assigned" && sameLogin(a.assignee, me)).at(-1);
  if (!last || last.kind !== "assigned") return !since;
  return !sameLogin(last.actor, me) && (!since || since < last.at);
}

/** Someone else was active after the viewer last opened the item. */
export function hasNewActivity(entry: Pick<Classified, "item" | "statusAt">, seen: Map<string, string>, me: string): boolean {
  const since = seen.get(entry.item.id) ?? entry.statusAt;
  const last = lastOthersActivity(entry.item, me);
  return !!last && !!since && last > since;
}

/** The bars that ask for work now; planned, blocked and finished items are parked. */
export function isActiveBar(group: PlateGroup): boolean {
  return group !== "later" && group !== "finished";
}

/** The number for the sidebar: everything on the plate except the Later and Done bars. */
export function plateCount(groups: { group: PlateGroup; entries: Classified[] }[]): number {
  return groups.filter((g) => isActiveBar(g.group)).reduce((n, g) => n + g.entries.length, 0);
}

/** The local calendar date, e.g. "2026-10-23", which decides when "today" starts over. */
export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
