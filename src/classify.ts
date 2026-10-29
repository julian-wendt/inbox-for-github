import type { Bucket, Item, Reopen, Status, StoredStatus } from "./model";
import { REOPEN_DEFAULT, reopens, snoozeEnded } from "./reopen";
import { pushedSinceReview, reviewAnswered } from "./review";
import { RULES, type Rule } from "./rules";
import { lastReplyAt, mentionsOf, sameLogin, type Mention } from "./timeline";
import { updatesSince, type Update } from "./handoff";

/**
 * Why an item sits in the inbox; "reopened" is a stored "Offen" that revived an answered
 * request, set by the viewer (O) or written when a follow-up date passed, "update"
 * news on an item whose part the viewer finished (see `updatesSince`), until they tick it off,
 * "commits" a push by someone else to a pull request the viewer reviewed (see `pushedSinceReview`).
 */
export type Ask = "update" | "review" | "commits" | "mention" | "reopened";

export interface Classified {
  item: Item;
  bucket: Bucket;
  status: Status;
  /** The mention that puts the item into the inbox, if any. */
  mention: Mention | null;
  /** What the viewer answered, which puts the item under "done" without a stored status. */
  answered: "review" | "mention" | null;
  /** What keeps the item in the inbox; empty outside it. */
  asks: Ask[];
  /** When the viewer set the stored status, if any. */
  statusAt: string | null;
  /** Set for a follow-up with a date: when the item comes back on its own. */
  until?: string;
  /** Set once the viewer finished their part of it ("Mein Teil erledigt"): what happened since, maybe nothing. */
  updates?: Update[];
  /** Who last asked the viewer (or one of their teams) for a review, when the activities say. */
  requestedBy?: string;
  /** Who last assigned the viewer, unless they did it themselves; unknown when the activities do not say. */
  assignedBy?: string;
  /** With the "commits" ask: who pushed since the viewer's review, last pusher last. */
  pushedBy?: string[];
  /** The stored status fell back to "Offen" (see `reopens`); the caller should delete it. */
  statusReset: boolean;
}

/**
 * Sorts one item into a bucket, applying the enabled rules. Pure: nothing is fetched or written.
 *
 * 0. An item whose part the viewer finished (a stored "done" with a handoff) goes its own way
 *    while they stay assigned or it closes, see `classifyHandedOff`; once they are unassigned,
 *    the handoff no longer counts and the item sorts as if no status were stored.
 * 0b. An item closed or merged on GitHub is "done" when it was for the viewer (a review request
 *    or a mention), whatever the stored status says; other closed items show nowhere.
 * 1. A stored "Zurückgestellt" or "Erledigt" wins, unless `reopens` says the item needs the
 *    viewer again, or with `reviewOnCommits` someone else pushed to a pull request the viewer
 *    reviewed since; then it is discarded and `statusReset` is set. An item of the tables
 *    snoozes in place instead: it stays in its table until its date, and a mention since adds it
 *    to the inbox without ending the snooze.
 * 2. Otherwise the item goes to the inbox while someone waits for an answer: a review request is
 *    not answered yet (see `reviewAnswered`) or a mention is pending. A stored "Offen" (an
 *    explicit reopen, or the one written when a follow-up date passed) counts as a fresh request:
 *    what was answered before it asks again (`reopened`). With `reviewOnCommits`, a push by someone
 *    else since the viewer's last review or comment asks again (`commits`). An assignment alone
 *    is no such ask.
 * 2b. A plan (`plannedAt`: the item is pinned for today or planned for a day) answers the asks
 *    the viewer saw when they made it: only an ask that came later shows the item in the inbox.
 *    With none, the item stays in its table ("assigned", "authored") or goes to "planned", which
 *    only the Planned view shows; answering a later ask ends only the ask, never the plan.
 * 3. An item assigned to the viewer with nothing pending goes to "assigned".
 * 4. Once the viewer has answered every review request and mention, the item counts as "done"
 *    without a stored status, and `answered` says why.
 * 5. Everything else goes to "authored" when the viewer opened it, otherwise to "involved",
 *    where the viewer merely takes part.
 *
 * @param item      An item from `fetchItems`.
 * @param me        The viewer's login.
 * @param stored    The viewer's manual status for this item, if any.
 * @param switches  Rule id → enabled, as returned by `ruleSwitches`.
 * @param reopenOn  What brings a snoozed or done item back to "Offen" (the "reopenOn" setting).
 * @param reviewOnCommits  Pushes by others bring a reviewed pull request back (the "reviewOnCommits" setting).
 * @param plannedAt  When the viewer pinned the item for today or planned it for a day (ISO 8601), if they did
 *                   (the "plannedAt" setting); asks from before then do not put it into the inbox.
 *
 * @example
 *   classify(item, "octocat", { status: "done", changedAt: "2026-10-01T12:00:00Z" }, ruleSwitches());
 */
export function classify(
  item: Item,
  me: string,
  stored: StoredStatus | undefined,
  switches: Record<string, boolean>,
  reopenOn: Reopen = REOPEN_DEFAULT,
  now = Date.now(),
  reviewOnCommits = true,
  plannedAt?: string,
): Classified {
  const rules = RULES.filter((r) => switches[r.id]);
  const assigned = item.reasons.includes("assigned");
  const own = sameLogin(item.author, me);
  // Items of the tables wait in place: only their date ends it, a mention shows in the inbox besides.
  const inTable = assigned || own;
  if (stored?.status === "done" && stored.handoff) {
    if (assigned || item.closed) return classifyHandedOff(item, me, stored, rules);
    stored = undefined;
  }
  if (item.closed) {
    const forMe = item.reasons.includes("review") || mentionsOf(item, me).length > 0;
    return { item, mention: null, statusReset: false, statusAt: stored?.changedAt ?? null, bucket: forMe ? "done" : "involved", status: "done", answered: null, asks: [] };
  }
  const tableSnooze = inTable && stored?.status === "snoozed";
  const pushed = reviewOnCommits ? pushedSinceReview(item, me) : null;
  const pushedSinceStatus = !!pushed && !!stored && stored.status !== "open" && pushed.at > stored.changedAt;
  const statusReset = tableSnooze ? snoozeEnded(stored, now) : reopens(item, me, stored, reopenOn, now) || pushedSinceStatus;
  const effective = statusReset ? undefined : stored;
  const mention = pendingMention(item, rules, { me });
  const requestedBy = requesterOf(item, me);
  const assignedBy = assignerOf(item, me);
  const result = { item, mention, statusReset, statusAt: effective?.changedAt ?? null, ...(effective?.until && { until: effective.until }), ...(requestedBy && { requestedBy }), ...(assignedBy && { assignedBy }) };

  if (effective && tableSnooze) {
    const asks: Ask[] = mention && mention.at > effective.changedAt ? ["mention"] : [];
    return { ...result, mention: asks.length > 0 ? mention : null, bucket: asks.length > 0 ? "inbox" : assigned ? "assigned" : "authored", status: "snoozed", answered: null, asks };
  }
  if (effective && effective.status !== "open") {
    const { status } = effective;
    return { ...result, bucket: status, status, answered: null, asks: [] };
  }

  const reopenedAt = effective?.changedAt;
  const reviewed = item.reasons.includes("review");
  const mentioned = mentionsOf(item, me).length > 0;
  const reviewOpen = reviewed && !reviewAnswered(item, me, reopenedAt);
  const mentionOpen = mention !== null || (mentioned && !!reopenedAt && (lastReplyAt(item, me) ?? "") <= reopenedAt);
  const asks: Ask[] = [];
  if (reviewOpen) asks.push(reopenedAt && reviewAnswered(item, me) ? "reopened" : "review");
  else if (pushed) asks.push("commits");
  if (mention) asks.push("mention");
  else if (mentionOpen && !asks.includes("reopened")) asks.push("reopened");

  // The plan answers what the viewer saw when they made it; an ask of unknown time counts as seen.
  const askedAt = (ask: Ask): string | undefined =>
    ask === "mention" ? mention?.at : ask === "review" ? lastRequest(item, me)?.at : ask === "commits" ? pushed?.at : ask === "reopened" ? reopenedAt : undefined;
  const fresh = plannedAt ? asks.filter((ask) => (askedAt(ask) ?? "") > plannedAt) : asks;
  const parked = fresh.length < asks.length;
  const shown = parked ? { ...result, mention: fresh.includes("mention") ? mention : null } : result;

  if (fresh.length > 0) return { ...shown, bucket: "inbox", status: "open", answered: null, asks: fresh, ...(fresh.includes("commits") && { pushedBy: pushed!.by }) };
  if (assigned) return { ...shown, bucket: "assigned", status: "open", answered: null, asks: fresh };
  if (plannedAt) return { ...shown, bucket: own ? "authored" : "planned", status: "open", answered: null, asks: fresh };
  if (reviewed || mentioned) {
    return { ...result, bucket: "done", status: "done", answered: reviewed ? "review" : "mention", asks };
  }
  return { ...result, bucket: sameLogin(item.author, me) ? "authored" : "involved", status: "open", answered: null, asks };
}

/**
 * The viewer's part is done, but they follow the item: it sits in Assigned to me while they stay
 * assigned and it is open, and in the inbox while an update (closing included) or a mention since
 * then waits to be ticked off; closed and ticked off, it shows nowhere. Ticking off (D) stores a
 * fresh handoff, which moves "since".
 */
function classifyHandedOff(item: Item, me: string, stored: StoredStatus, rules: Rule[]): Classified {
  const since = stored.changedAt;
  const updates = updatesSince(item, me, since, stored.handoff!);
  const pending = pendingMention(item, rules, { me });
  const mention = pending && pending.at > since ? pending : null;
  const asks: Ask[] = [];
  if (updates.length > 0) asks.push("update");
  if (mention) asks.push("mention");
  const bucket: Bucket = asks.length > 0 ? "inbox" : !item.closed && item.reasons.includes("assigned") ? "assigned" : "involved";
  return { item, bucket, status: "done", mention, answered: null, asks, statusAt: since, statusReset: false, updates };
}

/** The last time the viewer, or one of their teams, was asked for a review, as the activities record it. */
function lastRequest(item: Item, me: string): { at: string; actor: string } | undefined {
  const last = item.activities.filter((a) => a.kind === "review-requested" && (sameLogin(a.reviewer, me) || a.reviewer.startsWith("team:"))).at(-1);
  return last?.kind === "review-requested" ? last : undefined;
}

function requesterOf(item: Item, me: string): string | null {
  return lastRequest(item, me)?.actor ?? null;
}

function assignerOf(item: Item, me: string): string | null {
  const last = item.activities.flatMap((a) => (a.kind === "assigned" && sameLogin(a.assignee, me) ? [a.actor] : [])).at(-1);
  return last && !sameLogin(last, me) ? last : null;
}

function pendingMention(item: Item, rules: Rule[], ctx: { me: string }): Mention | null {
  const deciders = rules.filter((r) => r.pendingMention);
  if (deciders.length === 0) return mentionsOf(item, ctx.me).at(-1) ?? null;
  for (const rule of deciders) {
    const mention = rule.pendingMention!(item, ctx);
    if (mention) return mention;
  }
  return null;
}
