import type { ReactionContent } from "../model";

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
