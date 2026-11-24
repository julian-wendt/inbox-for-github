import type { Item, Reaction, ReviewState } from "./model";

/** One authored text on an item: the opening post or a comment. */
export interface Post {
  author: string;
  body: string;
  at: string;
  where?: string;
  reviewState?: ReviewState;
  /** The node id to react to: the item's for the opening post; absent for comments cached before it was kept. */
  id?: string;
  reactions?: Reaction[];
}

/** A post that mentions the viewer, with a short excerpt around the mention. */
export interface Mention {
  by: string;
  at: string;
  excerpt: string;
  /** True when the viewer mentioned themselves as a note to self. */
  self: boolean;
  /** The viewer's team it mentions, `org/slug`, when it does not name the viewer. */
  team?: string;
}

const EXCERPT_RADIUS = 80;

/** Opening post followed by the loaded comments, oldest first. */
export function posts(item: Item): Post[] {
  return [
    { author: item.author, body: item.body, at: item.createdAt, id: item.id, reactions: item.reactions },
    ...item.comments.map((c) => ({ author: c.author, body: c.body, at: c.createdAt, where: c.where, reviewState: c.reviewState, id: c.id, reactions: c.reactions })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}

/** Removes fenced code, inline code and quoted lines, where a mention is not addressed to anyone. */
export function addressedText(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n");
}

function mentionPattern(login: string): RegExp {
  const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w/-])@${escaped}(?![\\w-])`, "i");
}

/**
 * Finds the mention of `login` in a post body, ignoring code and quotes.
 *
 * @returns An excerpt around the mention, or null when the post does not mention `login`.
 */
export function findMention(body: string, login: string): string | null {
  const text = addressedText(body);
  const match = mentionPattern(login).exec(text);
  if (!match) return null;
  const start = Math.max(0, match.index - EXCERPT_RADIUS);
  const end = Math.min(text.length, match.index + match[0].length + EXCERPT_RADIUS);
  const excerpt = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${excerpt}${end < text.length ? "…" : ""}`;
}

/**
 * All posts that mention `me`, or one of the viewer's teams in `item.teams`, oldest first. A team
 * the viewer mentions themselves is no ask for them, so their own posts count only with `me`.
 */
export function mentionsOf(item: Item, me: string): Mention[] {
  return posts(item).flatMap((post) => {
    const excerpt = findMention(post.body, me);
    if (excerpt !== null) return [{ by: post.author, at: post.at, excerpt, self: sameLogin(post.author, me) }];
    if (!item.teams?.length || sameLogin(post.author, me)) return [];
    for (const team of item.teams) {
      const found = findMention(post.body, team);
      if (found !== null) return [{ by: post.author, at: post.at, excerpt: found, self: false, team }];
    }
    return [];
  });
}

/**
 * The viewer's teams that a post of `item` mentions, for `Item.teams`.
 *
 * @param teams  Team handles, `org/slug`.
 * @example
 *   mentionedTeams(item, ["octo-org/platform", "octo-org/docs"]); // ["octo-org/platform"]
 */
export function mentionedTeams(item: Item, teams: readonly string[]): string[] {
  const bodies = posts(item).map((post) => post.body);
  return teams.filter((team) => bodies.some((body) => findMention(body, team) !== null));
}

/**
 * Time of the viewer's last post that counts as a reply. A post in which the viewer mentions
 * themselves is a note to self, not a reply, and is skipped.
 */
export function lastReplyAt(item: Item, me: string): string | null {
  const replies = posts(item).filter(
    (post) => sameLogin(post.author, me) && findMention(post.body, me) === null,
  );
  return replies.at(-1)?.at ?? null;
}

/** When a person other than `me` last posted, and who, if anyone did; bots do not count. */
export function lastPostByOthers(item: Item, me: string): { at: string; by: string } | null {
  const last = posts(item).filter((post) => !sameLogin(post.author, me) && !isBot(post.author)).at(-1);
  return last ? { at: last.at, by: last.author } : null;
}

/** Bot logins carry GitHub's "[bot]" suffix, added by `toItem`. */
export function isBot(login: string): boolean {
  return login.endsWith("[bot]");
}

export function sameLogin(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function latest(...timestamps: (string | null | undefined)[]): string | null {
  return timestamps.filter((t): t is string => !!t).sort().at(-1) ?? null;
}
