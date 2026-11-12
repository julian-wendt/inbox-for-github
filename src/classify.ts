import type { Bucket, Item, Reopen, Status, StoredStatus } from "./model";
import { assignedAgain, REOPEN_DEFAULT, reopenedByOther, snoozeEnded } from "./reopen";
import { pushedSinceReview, reviewAnswered } from "./review";
import { RULES, type Rule } from "./rules";
import { closedByOther, feedbackSince, lastAnswerAt, threadReply, type Feedback, type FeedbackMode } from "./feedback";
import { lastPostByOthers, lastReplyAt, latest, mentionsOf, sameLogin, type Mention } from "./timeline";
import { updatesSince, type Update } from "./handoff";

/**
 * Why an item sits in the inbox; "opened" is a stored "Open" that revived an answered request,
 * set by the viewer (O), "reopened" someone else reopening it on GitHub, "post" any post by
 * someone else with the "Any post" setting, "due" a follow-up whose date passed, "update"
 * news on an item whose part the viewer finished (see `updatesSince`), until they tick it off,
 * "commits" a push by someone else to a pull request the viewer reviewed (see `pushedSinceReview`),
 * "feedback" a post or review by someone else on an item of the viewer's tables (see `feedbackSince`),
 * "reply" an answer in a review thread the viewer wrote in (see `threadReply`), and "closed" an own
 * item someone else closed without merging (see `closedByOther`).
 */
export type Ask = "update" | "review" | "commits" | "mention" | "opened" | "reopened" | "post" | "feedback" | "reply" | "closed" | "due";

/** Which further asks bring an item into the inbox (the settings of the same names). */
export interface AskRules {
  /** Feedback on the viewer's own items. */
  ownFeedback: FeedbackMode;
  /** Posts and reviews by others on the viewer's assignments. */
  assignedFeedback: boolean;
  /** Answers in review threads the viewer wrote in, on pull requests of others. */
  threadReplies: boolean;
  /** Own items closed by someone else without merging. */
  ownClosed: boolean;
}

export const ASK_RULES_DEFAULT: AskRules = { ownFeedback: "any", assignedFeedback: true, threadReplies: true, ownClosed: true };

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
  /** Set once the viewer finished their part of it ("My part done"): what happened since, maybe nothing. */
  updates?: Update[];
  /** Who last asked the viewer (or one of their teams) for a review, when the activities say. */
  requestedBy?: string;
  /** Who last assigned the viewer, unless they did it themselves; unknown when the activities do not say. */
  assignedBy?: string;
  /** With the "commits" ask: who pushed since the viewer's review, last pusher last. */
  pushedBy?: string[];
  /** With the "feedback" ask: the latest feedback since the viewer's last answer. */
  feedback?: Feedback;
  /** With the "reply" ask: who answered in the review thread. */
  repliedBy?: string;
  /** With the "closed" ask: who closed the viewer's item. */
  closedBy?: string;
  /** With the "reopened" ask: who reopened the item on GitHub. */
  reopenedBy?: string;
  /** With the "post" ask: who posted. */
  postedBy?: string;
  /** When each ask in `asks` came up, where it has a time (board moves and new pull requests have none); see `newestAsk`. */
  asked: Partial<Record<Ask, string>>;
}

/**
 * The ask that brought the item where it is: the newest of `asks` with a time. The row's age and
 * the first line of the explanation both follow it, so they cannot name different asks.
 *
 * @example
 *   newestAsk(entry); // { ask: "mention", at: "2026-11-10T09:00:00Z" }
 */
export function newestAsk({ asks, asked }: Pick<Classified, "asks" | "asked">): { ask: Ask; at: string } | null {
  let newest: { ask: Ask; at: string } | null = null;
  for (const ask of asks) {
    const at = asked[ask];
    if (at && (!newest || at > newest.at)) newest = { ask, at };
  }
  return newest;
}

function timesOf(asks: Ask[], at: (ask: Ask) => string | undefined): Partial<Record<Ask, string>> {
  return Object.fromEntries(asks.flatMap((ask) => (at(ask) ? [[ask, at(ask)]] : [])));
}

/**
 * Sorts one item into a bucket, applying the enabled rules. Pure: nothing is fetched or written.
 *
 * 0. An item whose part the viewer finished (a handoff, stored with "done", or with "snoozed"
 *    while it also waits for a follow-up) goes its own way while they stay assigned or it
 *    closes, see `classifyHandedOff`; once they are unassigned, the handoff no longer counts and
 *    the item sorts as if only its follow-up, if any, were stored.
 * 0b. An item closed or merged on GitHub is "done" when it was for the viewer (a review request
 *    or a mention), whatever the stored status says; other closed items show nowhere.
 * 1. Nothing a rule finds is written back: an item comes back only through an ask newer than
 *    handled-until (rule 2 of the behaviour model). A follow-up that waits keeps the item out of
 *    its list ("snoozed"), or in its table; an ask since adds it to the inbox and the follow-up
 *    keeps waiting. A "done" stored before D only filed counts like handled-until at its time.
 *    A new assignment by someone else drops a finished part, and keeps a follow-up.
 * 2. Otherwise the item goes to the inbox while someone waits for an answer: a follow-up came due
 *    (`due`, at its date, until the viewer handles it or replies), a review request is
 *    not answered yet (see `reviewAnswered`) or a mention is pending. A stored "Open" (O, or one
 *    written by older versions) counts as a fresh request: what was answered before it asks again
 *    (`opened`), and what was pending asks again at its time, handled-until or not; so does a
 *    due follow-up. A reopen on GitHub by someone else asks (`reopened`) on an item that was for
 *    the viewer (a mention, a review request, an item of the tables) when it is newer than
 *    handled-until and the viewer's last reply. With `reviewOnCommits`, a push by someone else
 *    since the viewer's last review or comment asks again (`commits`). With `reopenOn`
 *    "any-post", a post by someone else newer than handled-until and the viewer's last reply asks
 *    (`post`) outside the tables. An assignment alone is no such ask.
 * 2b. Handled-until (D, P, T and F set it) answers the asks from before it: only an ask that
 *    came later shows the item in the inbox. With none, a `planned` item stays in its table
 *    ("assigned", "authored") or goes to "planned", which only the Planned view shows; answering
 *    a later ask ends only the ask, never the plan.
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
 * @param reopenOn  With "any-post", any post by someone else outside the tables asks (the "reopenOn" setting).
 * @param reviewOnCommits  Pushes by others bring a reviewed pull request back (the "reviewOnCommits" setting).
 * @param handledUntil  The time up to which the viewer handled the item's asks (ISO 8601, see
 *                      `Store.handledUntil`); asks from before it, closing included, do not count.
 * @param askRules  Which feedback, thread replies and closings ask for the viewer (see `AskRules`).
 * @param planned   The item is pinned for today or planned for a day.
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
  handledUntil?: string,
  askRules: AskRules = ASK_RULES_DEFAULT,
  planned = false,
): Classified {
  const rules = RULES.filter((r) => switches[r.id]);
  const assigned = item.reasons.includes("assigned");
  const own = sameLogin(item.author, me);
  // Items of the tables ask with feedback; elsewhere "any post" stands in for it.
  const inTable = assigned || own;
  const handedOff = !!stored?.handoff && stored.status !== "open";
  // A new assignment by someone else starts the work anew; a follow-up stays (rule 2).
  const renewed = !!stored && (stored.status === "done" || handedOff) && assignedAgain(item, me, stored.changedAt);
  if (stored && handedOff && !renewed && (assigned || item.closed)) return classifyHandedOff(item, me, stored, rules, askRules, handledUntil, now);
  if (stored && (handedOff || renewed)) stored = stored.status === "snoozed" ? { status: "snoozed", changedAt: stored.changedAt, ...(stored.until && { until: stored.until }) } : undefined;
  if (item.closed) {
    const closer = own && askRules.ownClosed ? closedByOther(item, me) : null;
    if (closer && closer.at > (handledUntil ?? "")) {
      return { item, mention: null, statusAt: stored?.changedAt ?? null, bucket: "inbox", status: "done", answered: null, asks: ["closed"], asked: { closed: closer.at }, closedBy: closer.by };
    }
    const forMe = item.reasons.includes("review") || mentionsOf(item, me).length > 0;
    return { item, mention: null, statusAt: stored?.changedAt ?? null, bucket: forMe ? "done" : "involved", status: "done", answered: null, asks: [], asked: {} };
  }
  const passed = snoozeEnded(stored, now);
  const waiting = stored?.status === "snoozed" && !passed;
  const reopenedAt = stored?.status === "open" ? stored.changedAt : undefined;
  // A stored follow-up or done handled the item when it was set, as handled-until does.
  const handled = stored && stored.status !== "open" ? (latest(handledUntil, stored.changedAt) ?? undefined) : handledUntil;
  // The viewer's own reply answers a due follow-up, as D does.
  const dueAt = passed && stored!.until! > (latest(handled, lastReplyAt(item, me)) ?? "") ? stored!.until : undefined;
  // A reopen or a due follow-up newer than handled-until asks again what was pending (rule 2), so nothing is cut off.
  const seenAt = (reopenedAt && reopenedAt > (handled ?? "")) || dueAt ? undefined : handled;
  const pushed = reviewOnCommits ? pushedSinceReview(item, me) : null;
  const threadAnswer = !own && askRules.threadReplies ? threadReply(item, me) : null;
  const feedbackMode: FeedbackMode = own ? askRules.ownFeedback : assigned && askRules.assignedFeedback ? "any" : "off";
  const found = inTable ? feedbackSince(item, me, latest(lastAnswerAt(item, me), seenAt), feedbackMode) : null;
  // A mention is feedback too, but asks already as one.
  const feedback = found && !mentionsOf(item, me).some((m) => m.at === found.at) ? found : null;
  const reply = threadAnswer && !feedback && !mentionsOf(item, me).some((m) => m.at === threadAnswer.at) ? threadAnswer : null;
  const mention = pendingMention(item, rules, { me });
  const requestedBy = requesterOf(item, me);
  const assignedBy = assignerOf(item, me);
  const reviewed = item.reasons.includes("review");
  const mentioned = mentionsOf(item, me).length > 0;
  const answeredAt = latest(handled, lastReplyAt(item, me)) ?? "";
  const reopen = reviewed || mentioned || inTable ? reopenedByOther(item, me) : null;
  const ghReopen = reopen && reopen.at > answeredAt ? reopen : null;
  const posted = reopenOn === "any-post" && !inTable && handled ? lastPostByOthers(item, me) : null;
  const newPost = posted && posted.at > answeredAt && posted.at !== mention?.at ? posted : null;
  const statusAt = passed ? stored!.until! : (stored?.changedAt ?? null);
  const result = { item, mention, statusAt, ...(waiting && stored!.until && { until: stored!.until }), ...(requestedBy && { requestedBy }), ...(assignedBy && { assignedBy }) };

  const reviewOpen = reviewed && !reviewAnswered(item, me, reopenedAt);
  const mentionOpen = mention !== null || (mentioned && !!reopenedAt && (lastReplyAt(item, me) ?? "") <= reopenedAt);
  const asks: Ask[] = dueAt ? ["due"] : [];
  if (reviewOpen) asks.push(reopenedAt && reviewAnswered(item, me) ? "opened" : "review");
  else if (pushed) asks.push("commits");
  if (mention) asks.push("mention");
  else if (mentionOpen && !asks.includes("opened")) asks.push("opened");
  if (feedback) asks.push("feedback");
  if (reply && (!reopenedAt || reply.at > reopenedAt)) asks.push("reply");
  if (ghReopen) asks.push("reopened");
  if (newPost) asks.push("post");

  // Handled-until answers what came before it; an ask of unknown time counts as handled.
  const askedAt = (ask: Ask): string | undefined =>
    ask === "mention" ? mention?.at : ask === "review" ? lastRequest(item, me)?.at : ask === "commits" ? pushed?.at : ask === "opened" ? reopenedAt : ask === "reopened" ? ghReopen?.at : ask === "post" ? newPost?.at : ask === "feedback" ? feedback?.at : ask === "reply" ? reply?.at : ask === "due" ? dueAt : undefined;
  const fresh = seenAt ? asks.filter((ask) => (askedAt(ask) ?? "") > seenAt) : asks;
  const asked = timesOf(fresh, askedAt);
  const parked = fresh.length < asks.length;
  const shown = { ...(parked ? { ...result, mention: fresh.includes("mention") ? mention : null } : result), asked };

  if (fresh.length > 0) {
    return {
      ...shown,
      bucket: "inbox",
      status: waiting ? "snoozed" : "open",
      answered: null,
      asks: fresh,
      ...(fresh.includes("commits") && { pushedBy: pushed!.by }),
      ...(fresh.includes("feedback") && { feedback: feedback! }),
      ...(fresh.includes("reply") && { repliedBy: reply!.by }),
      ...(fresh.includes("reopened") && { reopenedBy: ghReopen!.by }),
      ...(fresh.includes("post") && { postedBy: newPost!.by }),
    };
  }
  if (waiting) return { ...shown, bucket: assigned ? "assigned" : own ? "authored" : "snoozed", status: "snoozed", answered: null, asks: fresh };
  // A done stored back when D still stored one keeps the item handled; on a table item `legacyDone` converts it.
  if (stored?.status === "done") return { ...shown, bucket: "done", status: "done", answered: null, asks: fresh };
  if (assigned) return { ...shown, bucket: "assigned", status: "open", answered: null, asks: fresh };
  if (planned) return { ...shown, bucket: own ? "authored" : "planned", status: "open", answered: null, asks: fresh };
  if (reviewed || mentioned) {
    return { ...shown, bucket: "done", status: "done", answered: reviewed ? "review" : "mention", asks: fresh };
  }
  return { ...shown, bucket: own ? "authored" : "involved", status: "open", answered: null, asks: fresh };
}

/**
 * The viewer's part is done, but they follow the item: it sits in Assigned to me while they stay
 * assigned and it is open, and in the inbox while an ask waits: an update (closing included)
 * since the hand-off, or what the open path would show (a pending mention, an open review
 * request, feedback, a thread reply; later ones are updates) until the viewer files it with D or plans it (`seenAt`, as in the open path) or answers.
 * Closed and ticked off, it shows nowhere. Ticking off (D) stores a fresh handoff, which moves
 * "since" for updates. Stored as "snoozed", it also waits for a follow-up while open and before
 * the date; after the date it is "done" again, with no write needed, and asks (`due`) until filed.
 */
function classifyHandedOff(item: Item, me: string, stored: StoredStatus, rules: Rule[], askRules: AskRules, seenAt: string | undefined, now: number): Classified {
  const since = stored.changedAt;
  const updates = updatesSince(item, me, latest(since, seenAt) ?? since, stored.handoff!);
  const unfiled = (at: string) => at > (seenAt ?? "");
  const pending = pendingMention(item, rules, { me });
  const mention = pending && unfiled(pending.at) ? pending : null;
  const open = !item.closed;
  const assigned = item.reasons.includes("assigned");
  const own = sameLogin(item.author, me);
  const request = open && item.reasons.includes("review") && !reviewAnswered(item, me) ? lastRequest(item, me) : undefined;
  const feedbackMode: FeedbackMode = own ? askRules.ownFeedback : assigned && askRules.assignedFeedback ? "any" : "off";
  const found = open ? feedbackSince(item, me, latest(lastAnswerAt(item, me), seenAt), feedbackMode) : null;
  const feedback = found && found.at <= since && !mentionsOf(item, me).some((m) => m.at === found.at) ? found : null;
  const threadAnswer = open && !own && askRules.threadReplies ? threadReply(item, me) : null;
  const reply = threadAnswer && !feedback && threadAnswer.at <= since && unfiled(threadAnswer.at) && !mentionsOf(item, me).some((m) => m.at === threadAnswer.at) ? threadAnswer : null;
  const dueAt = open && snoozeEnded(stored, now) && unfiled(stored.until!) && stored.until! > (lastReplyAt(item, me) ?? "") ? stored.until : undefined;
  const asks: Ask[] = dueAt ? ["due"] : [];
  const updatedAt = updates.flatMap((u) => ("at" in u ? [u.at] : [])).sort().at(-1);
  if (updates.length > 0) asks.push("update");
  if (request && unfiled(request.at)) asks.push("review");
  if (mention) asks.push("mention");
  if (feedback) asks.push("feedback");
  if (reply) asks.push("reply");
  const bucket: Bucket = asks.length > 0 ? "inbox" : open && assigned ? "assigned" : "involved";
  const waits = open && stored.status === "snoozed" && !snoozeEnded(stored, now);
  const asked = timesOf(asks, (ask) => (ask === "update" ? updatedAt : ask === "review" ? request?.at : ask === "mention" ? mention?.at : ask === "feedback" ? feedback?.at : ask === "reply" ? reply?.at : ask === "due" ? dueAt : undefined));
  return { item, bucket, status: waits ? "snoozed" : "done", ...(waits && stored.until && { until: stored.until }), mention, answered: null, asks, asked, statusAt: since, updates, ...(feedback && { feedback }), ...(reply && { repliedBy: reply.by }) };
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
