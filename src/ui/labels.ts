import { newestAsk, type Ask, type Classified } from "../classify";
import type { Update } from "../handoff";
import type { Bucket, Item, Status } from "../model";
import { lastReplyAt, sameLogin } from "../timeline";
import { lastOthersActivity, MOVES_UP_DEFAULT, onPlate, type MovesUp } from "./assignments";
import { dateLocale, lang, t, type Lang } from "./i18n";

/**
 * A sidebar view: a bucket, except "involved" and "done". What the viewer merely takes part in
 * (commented, edited, or answered long ago) shows nowhere until a mention, review request or
 * assignment; what they handled lately shows in the Done bar of the inbox (see `inDoneBar`).
 * "snoozed" is the Follow-up view, which lists every follow-up that waits, whatever its bucket.
 */
export type View = Exclude<Bucket, "involved" | "done">;

/**
 * The sidebar views on keys 1–5, in the order of a day's work: what asks for the viewer, what
 * they planned, what they wait on, their assignments, and what they opened. Titles are getters,
 * so they follow the language set at render time.
 */
export const VIEWS: { id: View; readonly title: string }[] = (["inbox", "planned", "snoozed", "assigned", "authored"] as const).map((id) => ({
  id,
  get title() {
    return t(`bucket.${id}`);
  },
}));

/**
 * The view an item shows in, for jumping to it from the palette, or null when it shows in none.
 * Mostly its bucket; the viewer's own pull requests assigned to them live in Created by me, and
 * an item outside the tables and the inbox shows only in the inbox's Done bar, if at all.
 *
 * @param inBar  The item sits in the Done bar (see `inDoneBar`).
 *
 * @example
 *   viewOf(entry, "octocat"); // "assigned"
 */
export function viewOf(entry: Classified, me: string, inBar = false): View | null {
  if (entry.bucket === "involved" || entry.bucket === "done") return inBar ? "inbox" : null;
  if (entry.bucket === "assigned" && !onPlate(entry, me)) return sameLogin(entry.item.author, me) ? "authored" : null;
  return entry.bucket;
}

export type KindFilter = "all" | Item["kind"];

export const KINDS: { id: KindFilter; readonly title: string }[] = (["all", "issue", "pr"] as const).map((id) => ({
  id,
  get title() {
    return t(`kind.${id}`);
  },
}));

/**
 * The option after `current` in a header switch, wrapping from the last back to the first; T
 * steps the visible filter switch with it. An unknown `current` gives the first option.
 *
 * @param options  The switch's options in display order.
 * @param current  The option chosen now.
 *
 * @example
 *   nextOf(KINDS.map((k) => k.id), "pr"); // "all"
 */
export function nextOf<T>(options: readonly T[], current: T): T {
  return options[(options.indexOf(current) + 1) % options.length];
}

/** `key` is the single-key shortcut that sets the status. */
export const STATUSES: { id: Status; readonly title: string; key: string }[] = (
  [
    ["open", "O"],
    ["snoozed", "F"],
    ["done", "D"],
  ] as const
).map(([id, key]) => ({
  id,
  key,
  get title() {
    return t(`status.${id}`);
  },
}));

const RELATIVE: Record<Lang, Intl.RelativeTimeFormat> = {
  en: new Intl.RelativeTimeFormat("en", { numeric: "auto" }),
  de: new Intl.RelativeTimeFormat("de", { numeric: "auto" }),
};
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "3 days ago", "yesterday", "just now", in the current language. */
export function ago(timestamp: string, now = Date.now()): string {
  const seconds = (new Date(timestamp).getTime() - now) / 1000;
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return RELATIVE[lang()].format(Math.round(seconds / size), unit);
  }
  return t("time.justNow");
}

/** German words that only read well on their own; English needs no such rewording. */
const IN_SENTENCE: Record<string, string> = {
  "letztes Jahr": "im letzten Jahr",
  "letzten Monat": "im letzten Monat",
  "letzte Woche": "vor einer Woche",
};

/**
 * Like `ago`, phrased to follow a verb in a sentence: German "eröffnet … im letzten Monat"
 * instead of "… letzten Monat". English comes back unchanged.
 *
 * @example
 *   agoInSentence("2026-09-10T00:00:00Z", Date.parse("2026-10-22T00:00:00Z")); // "im letzten Monat"
 */
export function agoInSentence(timestamp: string, now = Date.now()): string {
  const phrase = ago(timestamp, now);
  return lang() === "de" ? (IN_SENTENCE[phrase] ?? phrase) : phrase;
}

const COMPACT: [suffix: string, seconds: number][] = [
  ["Y", 31_536_000],
  ["M", 2_592_000],
  ["W", 604_800],
  ["D", 86_400],
  ["h", 3_600],
  ["min", 60],
];

/**
 * Elapsed time in one short token for tight columns, rounded down: "12min", "3h", "2D", "1W",
 * "4M", "1Y". Under a minute, and for future timestamps, it is "now" ("jetzt"). A month counts 30 days.
 *
 * @example
 *   compactAgo("2026-10-20T12:00:00Z", Date.parse("2026-10-22T13:00:00Z")); // "2D"
 */
export function compactAgo(timestamp: string, now = Date.now()): string {
  const seconds = (now - new Date(timestamp).getTime()) / 1000;
  for (const [suffix, size] of COMPACT) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${suffix}`;
  }
  return t("time.now");
}

/**
 * An opening date for a table row, next to the title: day and month this year ("Sep 12"), month
 * and year before ("Sep 2025"). Absolute, so it does not read like the relative time at the end.
 *
 * @example
 *   openedText("2025-09-12T10:00:00Z", new Date(2026, 9, 24)); // "Sep 2025"
 */
export function openedText(at: string, now = new Date()): string {
  const date = new Date(at);
  const options: Intl.DateTimeFormatOptions = date.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { month: "short", year: "numeric" };
  return date.toLocaleDateString(dateLocale(), options);
}

/**
 * What happened on an item whose part the viewer finished, in one phrase: closing, board moves
 * and new pull requests by name, posts counted with their authors.
 *
 * @example
 *   updateSummary(updates); // "Roadmap: Review → Done; 2 posts by bob, carol"
 */
export function updateSummary(updates: Update[]): string {
  const parts = updates.flatMap((u) => {
    if (u.kind === "closed") return [t(u.state === "merged" ? "update.merged" : "update.closed")];
    if (u.kind === "reopened") return [t("update.reopened")];
    if (u.kind === "board") return [t("update.board", { board: u.board, from: u.from ?? "–", to: u.to ?? "–" })];
    if (u.kind === "pr") return [t("update.pr", { number: u.number })];
    return [];
  });
  const posts = updates.flatMap((u) => (u.kind === "post" ? [u.by] : []));
  const people = [...new Set(posts)].join(", ");
  if (posts.length === 1) parts.push(t("update.post", { name: people }));
  if (posts.length > 1) parts.push(t("update.posts", { count: posts.length, names: people }));
  return parts.join("; ");
}

/**
 * One short line saying why an item concerns the viewer: who mentioned them, a note to self, an
 * answered or open review request and who asked, new commits since the viewer's review, an
 * assignment and who made it, or otherwise who posted last.
 *
 * @example
 *   rowContext(classified); // "@alice mentioned you"
 */
export function rowContext({ item, mention, answered, asks, updates, pushedBy, requestedBy, assignedBy, feedback, repliedBy, closedBy }: Pick<Classified, "item" | "mention" | "answered"> & Partial<Pick<Classified, "asks" | "updates" | "pushedBy" | "requestedBy" | "assignedBy" | "feedback" | "repliedBy" | "closedBy">>): string {
  if (asks?.includes("update") && updates) return t("row.update", { what: updateSummary(updates) });
  if (asks?.includes("closed") && closedBy) return t("row.closedBy", { name: closedBy });
  if (item.closed) return t(item.closed.state === "merged" ? "row.merged" : "row.closed");
  if (mention) return mention.self ? t("row.reminder") : t("row.mentioned", { name: mention.by });
  if (asks?.includes("feedback") && feedback) return t(`row.feedback.${feedback.kind}`, { name: feedback.by });
  if (asks?.includes("reply") && repliedBy) return t("row.replied", { name: repliedBy });
  if (asks?.includes("commits") && pushedBy) return t(pushedBy.length > 1 ? "row.commitsMany" : "row.commits", { name: pushedBy.at(-1)! });
  if (answered) return answered === "review" ? t("row.reviewAnswered") : t("row.answered");
  if (item.reasons.includes("review")) return requestedBy ? t("row.reviewRequestedBy", { name: requestedBy }) : t("row.reviewRequested");
  if (item.reasons.includes("assigned")) return assignedBy ? t("row.assignedBy", { name: assignedBy }) : t("row.assigned");
  const last = item.comments.at(-1);
  return last ? t("row.commented", { name: last.author }) : t("row.openedBy", { name: item.author });
}

/**
 * The first line of text in a Markdown body, without markup or HTML comments, to stand in for a
 * folded post.
 *
 * @example
 *   firstLine("<!-- report -->\n## 🌈 zizmor scan results\n…"); // "🌈 zizmor scan results"
 */
export function firstLine(body: string): string {
  const line = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((l) => l.replace(/^[#>*\-\s]+/, "").replace(/[*_`]/g, "").trim())
    .find(Boolean);
  return line ?? "";
}

/**
 * The statuses offered for an item. None for closed or merged items, which sit in Done whatever
 * is stored, so a choice would do nothing; only Done where it files the closing (`closedDone`).
 *
 * @param closedDone  D works on this closed item (see `doneAccess`).
 */
export function statusesFor(entry: Pick<Classified, "item">, closedDone = false) {
  return entry.item.closed ? (closedDone ? STATUSES.filter((s) => s.id === "done") : []) : STATUSES;
}

/**
 * The menus' second line for a status: what choosing it does. "handOff" is Done on an assignment
 * of the Assigned to me table, which ends only the viewer's part.
 *
 * @example
 *   statusHint("snoozed"); // "Out of the inbox while you wait for others" (English)
 */
export function statusHint(id: Status | "handOff" | "file" | "clear"): string {
  return t(`hint.status.${id}`);
}

export type LinkFormat = "url" | "ref" | "markdown";

/**
 * An item's link in one of the formats people paste: the URL, the reference GitHub links by
 * itself in comments, or a Markdown link with the title and number.
 *
 * @example
 *   itemLink(item, "ref");      // "octo-org/app#7"
 *   itemLink(item, "markdown"); // "[Add export (#7)](https://github.com/octo-org/app/pull/7)"
 */
export function itemLink(item: Pick<Item, "url" | "repo" | "number" | "title">, format: LinkFormat): string {
  if (format === "ref") return `${item.repo}#${item.number}`;
  if (format === "markdown") return `[${item.title} (#${item.number})](${item.url})`;
  return item.url;
}

/**
 * The time a list row is sorted, grouped and labelled by: the moment that defines its view.
 *
 * - Snoozed: when it comes back, else when you snoozed it.
 * - Done: when it was closed or merged on GitHub; else when you answered (your last reply, or
 *   your last review for a review request); else when you marked it done.
 * - Inbox and the rest: the newest ask (see `newestAsk`) when it is a mention, a reopen, the
 *   viewer's O or a due follow-up, else the last activity by someone else, which the other asks
 *   are made of. A mention older than another ask
 *   is old news.
 *
 * Wherever a view's own moment is missing, the last activity by someone else stands in, and
 * `createdAt` when there is none: `updatedAt` also moves on commits and the viewer's own posts.
 *
 * @param me       The viewer's login, to find their answer and leave out their own activity.
 * @param movesUp  Which activity counts besides posts and reviews by others (the "movesUp" setting).
 *
 * @example
 *   sortTime(snoozedEntry, "octocat", settings.movesUp); // its statusAt
 */
const OWN_TIME = new Set<Ask>(["mention", "reopened", "opened", "due"]);

export function sortTime(c: Classified, me: string, movesUp: MovesUp = MOVES_UP_DEFAULT): string {
  const { item } = c;
  const activity = () => lastOthersActivity(item, me, movesUp) ?? item.createdAt;
  if (c.bucket === "snoozed") return c.until ?? c.statusAt ?? activity();
  if (c.bucket === "done") {
    if (item.closed) return item.closed.at;
    if (c.answered === "review") {
      const mine = item.reviews.filter((r) => sameLogin(r.author, me)).map((r) => r.at).sort().at(-1);
      if (mine) return mine;
    }
    if (c.answered === "mention") {
      const reply = lastReplyAt(item, me);
      if (reply) return reply;
    }
    return c.statusAt ?? activity();
  }
  const newest = newestAsk(c);
  return newest && OWN_TIME.has(newest.ask) ? newest.at : activity();
}
