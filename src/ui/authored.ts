import type { Classified } from "../classify";
import type { Item } from "../model";
import { sameLogin } from "../timeline";
import { reviewersOf } from "./attributes";

/** A bar in "Created by me": nobody has taken the item on, someone has, or the viewer set a follow-up on it. */
export type AuthoredGroup = "unassigned" | "taken" | "later";

/** The bars in display order: what may be stuck first. */
export const AUTHORED_GROUPS: AuthoredGroup[] = ["unassigned", "taken", "later"];

/**
 * Nobody has taken the item on: an issue without assignees, or a pull request ready for review
 * that nobody was asked to review or has reviewed. A draft is still the author's own work.
 *
 * @example
 *   nobodyOnIt(issue); // true while it has no assignees
 */
export function nobodyOnIt(item: Pick<Item, "kind" | "draft" | "assignees" | "author" | "reviewRequests" | "reviews">): boolean {
  if (item.kind === "issue") return item.assignees.length === 0;
  return !item.draft && reviewersOf(item).length === 0;
}

/**
 * The viewer's own open items for "Created by me", in its bars: everything they opened that is
 * still open on GitHub and not marked done by hand, whatever else asks for them, in "unassigned"
 * (see `nobodyOnIt`) or "taken", and snoozed ones in "later". Each bar is sorted by when the item
 * was opened.
 *
 * @param entries    All classified items.
 * @param me         The viewer's login.
 * @param order      "newest" or "oldest" by the opening time.
 * @returns The non-empty bars in `AUTHORED_GROUPS` order.
 *
 * @example
 *   groupAuthored(classified, "octocat"); // [{ group: "unassigned", entries }, { group: "taken", entries }]
 */
export function groupAuthored(entries: Classified[], me: string, order: "newest" | "oldest" = "newest"): { group: AuthoredGroup; entries: Classified[] }[] {
  const groups = new Map<AuthoredGroup, Classified[]>(AUTHORED_GROUPS.map((g) => [g, []]));
  for (const entry of entries.filter((e) => isOwnOpen(e, me))) groups.get(authoredGroup(entry))!.push(entry);
  const opened = (a: Classified, b: Classified) => (order === "newest" ? b.item.createdAt.localeCompare(a.item.createdAt) : a.item.createdAt.localeCompare(b.item.createdAt));
  return AUTHORED_GROUPS.map((group) => ({ group, entries: groups.get(group)!.sort(opened) })).filter((g) => g.entries.length > 0);
}

/** The number for the sidebar: every item in the bars but the snoozed ones. */
export function authoredCount(groups: { group: AuthoredGroup; entries: Classified[] }[]): number {
  return groups.filter((g) => g.group !== "later").reduce((n, g) => n + g.entries.length, 0);
}

/** Opened by the viewer, open on GitHub, and not marked done by hand (an answer, or finishing one's own part, does not count). */
export function isOwnOpen({ item, status, answered, updates }: Pick<Classified, "item" | "status" | "answered" | "updates">, me: string): boolean {
  return sameLogin(item.author, me) && !item.closed && !(status === "done" && answered === null && !updates);
}

function authoredGroup(entry: Classified): AuthoredGroup {
  if (entry.status === "snoozed") return "later";
  return nobodyOnIt(entry.item) ? "unassigned" : "taken";
}
