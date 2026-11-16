import type { Reaction, ReactionContent } from "../../model";
import { t } from "../i18n";
import { REACTIONS, reactionLabel } from "../reactions";

/**
 * The emoji under a post, as on GitHub: one pill per emoji someone used, with its count, marked
 * when the viewer is among them. The tooltip says how many, and whether the viewer is one of
 * them; the app does not load who the others are.
 *
 * @param reactions  The used emoji, in GitHub's order; absent or empty shows nothing.
 * @param onToggle   Adds or takes back the viewer's reaction; without it the pills only show.
 *
 * @example
 *   <Reactions reactions={[{ content: "HEART", count: 2, mine: true }]} onToggle={(content) => react(post.id, content)} />
 */
export function Reactions({ reactions = [], onToggle }: { reactions?: Reaction[]; onToggle?: (content: ReactionContent) => void }) {
  if (reactions.length === 0) return null;
  return (
    <div className="reactions" role="group" aria-label={t("reaction.list")}>
      {reactions.map((r) => {
        const label = reactionLabel(r);
        return (
          <button key={r.content} className={`reaction${r.mine ? " mine" : ""}`} aria-pressed={r.mine} title={label} aria-label={label} disabled={!onToggle} onClick={() => onToggle?.(r.content)}>
            <span aria-hidden>{REACTIONS[r.content]}</span>
            <span className="reaction-count">{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}
