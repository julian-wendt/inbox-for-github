import type { Classified } from "../classify";
import type { Update } from "../handoff";
import type { Bucket, Item, Status } from "../model";
import { lastReplyAt, sameLogin } from "../timeline";
import { onPlate } from "./assignments";
import { lang, t, type Lang, type MessageKey } from "./i18n";

/** Titles are getters, so they follow the language set at render time. */
/**
 * A sidebar view: a bucket, except "involved". What the viewer merely takes part in (commented,
 * edited, or answered long ago) shows nowhere until a mention, review request or assignment.
 */
export type View = Exclude<Bucket, "involved">;

/**
 * The sidebar's two sections: who waits for the viewer (mentions and reviews, with their snoozed
 * and done ones), and the viewer's own work (assigned to them, opened by them).
 */
export const VIEW_SECTIONS: { title: MessageKey; views: View[] }[] = [
  { title: "sidebar.asks", views: ["inbox", "snoozed", "done"] },
  { title: "sidebar.mine", views: ["assigned", "authored"] },
];

/** The sidebar views on keys 1–5, in the sections' order. */
export const VIEWS: { id: View; readonly title: string }[] = VIEW_SECTIONS.flatMap((s) => s.views).map((id) => ({
  id,
  get title() {
    return t(`bucket.${id}`);
  },
}));

/**
 * The view an item shows in, for jumping to it from the palette, or null when it shows in none.
 * Mostly its bucket; the viewer's own pull requests assigned to them live in Created by me.
 *
 * @example
 *   viewOf(entry, "octocat"); // "assigned"
 */
export function viewOf(entry: Classified, me: string): View | null {
  if (entry.bucket === "involved") return null;
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
  return date.toLocaleDateString(lang(), options);
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
 * answered or open review request, an assignment, or otherwise who posted last.
 *
 * @example
 *   rowContext(classified); // "@alice mentioned you"
 */
export function rowContext({ item, mention, answered, asks, updates }: Pick<Classified, "item" | "mention" | "answered"> & Partial<Pick<Classified, "asks" | "updates">>): string {
  if (asks?.includes("update") && updates) return t("row.update", { what: updateSummary(updates) });
  if (item.closed) return t(item.closed.state === "merged" ? "row.merged" : "row.closed");
  if (mention) return mention.self ? t("row.reminder") : t("row.mentioned", { name: mention.by });
  if (answered) return answered === "review" ? t("row.reviewAnswered") : t("row.answered");
  if (item.reasons.includes("review")) return t("row.reviewRequested");
  if (item.reasons.includes("assigned")) return t("row.assigned");
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
 * is stored, so a choice would do nothing.
 */
export function statusesFor(entry: Pick<Classified, "item">) {
  return entry.item.closed ? [] : STATUSES;
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
 * - Inbox, Watching and the rest: the pending mention, else the item's last update.
 *
 * @param me  The viewer's login, to find their answer.
 *
 * @example
 *   sortTime(snoozedEntry, "octocat"); // its statusAt
 */
export function sortTime(c: Classified, me: string): string {
  const { item } = c;
  if (c.bucket === "snoozed") return c.until ?? c.statusAt ?? item.updatedAt;
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
    return c.statusAt ?? item.updatedAt;
  }
  return c.mention?.at ?? item.updatedAt;
}
