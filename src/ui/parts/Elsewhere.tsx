import { t } from "../i18n";
import { VIEWS, type View } from "../labels";

/**
 * Under an empty view: where the items of the current selection (repos, kind) are instead, as
 * links into those views. Renders nothing when every other view is empty too.
 *
 * @param counts   Items per view for the current selection, as the sidebar counts them.
 * @param current  The empty view itself, left out.
 *
 * @example
 *   <Elsewhere counts={{ inbox: 0, assigned: 4, done: 7, … }} current="inbox" onJump={setBucket} />
 */
export function Elsewhere({ counts, current, onJump }: { counts: Record<View, number>; current: View; onJump: (bucket: View) => void }) {
  const others = VIEWS.filter((b) => b.id !== current && counts[b.id] > 0);
  if (others.length === 0) return null;
  return (
    <p className="elsewhere">
      <span className="elsewhere-label">{t("list.elsewhere")}</span>
      {others.map((b) => (
        <button key={b.id} className="link-btn" onClick={() => onJump(b.id)}>
          {t("list.elsewhereIn", { count: counts[b.id], view: b.title })}
        </button>
      ))}
    </p>
  );
}
