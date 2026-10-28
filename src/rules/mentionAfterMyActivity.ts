import { lastReplyAt, mentionsOf } from "../timeline";
import type { Rule } from "./types";

export const mentionAfterMyActivity: Rule = {
  id: "mention-after-my-activity",
  defaultEnabled: true,
  pendingMention(item, { me }) {
    const repliedAt = lastReplyAt(item, me);
    const open = mentionsOf(item, me).filter((m) => repliedAt === null || m.at > repliedAt);
    return open.at(-1) ?? null;
  },
};
