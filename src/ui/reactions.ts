import type { Reaction, ReactionContent } from "../model";
import { t } from "./i18n";

/** GitHub's eight reactions with their emoji, in the order GitHub lists and shows them. */
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

export const REACTION_ORDER = Object.keys(REACTIONS) as ReactionContent[];

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
