import { REACTION_ORDER } from "../github/fetch";
import type { Item, Reaction, ReactionContent } from "../model";
import { t } from "./i18n";

/** The emoji of GitHub's eight reactions. */
export const REACTIONS: Record<ReactionContent, string> = {
  THUMBS_UP: "👍",
  THUMBS_DOWN: "👎",
  LAUGH: "😄",
  HOORAY: "🎉",
  CONFUSED: "😕",
  HEART: "❤️",
  ROCKET: "🚀",
  EYES: "👀",
};

/**
 * Who reacted, as far as the counts tell: the app loads no reactor names (see
 * `docs/reference/github-api.md`, "Reactions").
 *
 * @example
 *   reactionLabel({ content: "HEART", count: 3, mine: true }); // "You and 2 others reacted with ❤️"
 */
export function reactionLabel({ content, count, mine }: Reaction): string {
  const emoji = REACTIONS[content];
  if (!mine) return t(count === 1 ? "reaction.one" : "reaction.many", { count, emoji });
  if (count === 1) return t("reaction.you", { emoji });
  return t(count === 2 ? "reaction.youAndOne" : "reaction.youAndOthers", { count: count - 1, emoji });
}

/**
 * The item with the reactions of one post replaced: the description when `subject` is the item's
 * id, else the comment with that id. Other items and posts stay as they are.
 *
 * @example
 *   withReactions(item, comment.id, await setReaction(token, comment.id, "HEART", true));
 */
export function withReactions(item: Item, subject: string, reactions: Reaction[]): Item {
  if (subject === item.id) return { ...item, reactions };
  return { ...item, comments: item.comments.map((c) => (c.id === subject ? { ...c, reactions } : c)) };
}

/**
 * The item with the viewer's reaction on one post set, as GitHub will have it once the write is
 * through: the count moves by one and the pill is marked, a new emoji takes its place in GitHub's
 * order, one left at 0 goes. A post that already shows it stays as it is, so the change can be put
 * on a fetch again (see `withPending`).
 *
 * @param subject  The item's id for its description, or a comment's id.
 * @param on       True adds the viewer's reaction, false takes it back.
 *
 * @example
 *   withReaction(item, comment.id, "HEART", true); // its HEART pill counts one more and is marked
 */
export function withReaction(item: Item, subject: string, content: ReactionContent, on: boolean): Item {
  const before = (subject === item.id ? item.reactions : item.comments.find((c) => c.id === subject)?.reactions) ?? [];
  const found = before.find((r) => r.content === content);
  if ((found?.mine ?? false) === on) return item;
  const count = (found?.count ?? 0) + (on ? 1 : -1);
  const others = before.filter((r) => r.content !== content);
  const after = count > 0 ? [...others, { content, count, mine: on }] : others;
  return withReactions(item, subject, after.sort((a, b) => REACTION_ORDER.indexOf(a.content) - REACTION_ORDER.indexOf(b.content)));
}
