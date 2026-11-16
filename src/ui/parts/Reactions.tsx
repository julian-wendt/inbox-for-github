import { SmilePlus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Reaction, ReactionContent } from "../../model";
import { t } from "../i18n";
import { menuPosition } from "../menuPosition";
import { REACTION_ORDER } from "../../github/fetch";
import { REACTIONS, reactionLabel } from "../reactions";

/**
 * The emoji under a post, as on GitHub: one pill per emoji someone used, with its count, marked
 * when the viewer is among them. The tooltip says how many, and whether the viewer is one of
 * them; the app does not load who the others are.
 *
 * With `onToggle`, a pill adds or takes back the viewer's reaction, and a smiley button after the
 * pills opens the eight emoji in a small pop-up below it, fixed to the window so the post's card
 * cannot clip it and nothing below moves. The pop-up closes on a choice, Escape, the smiley again,
 * a click elsewhere or a scroll; a choice and Escape give the focus back to the smiley. Opening
 * takes no focus: Tab walks on from the smiley into the emoji, and only focus from Tab keeps
 * Enter for the button (see `useHotkeys`).
 *
 * @param reactions  The used emoji, in GitHub's order; absent reads as none.
 * @param onToggle   Called with the emoji and whether the viewer's reaction is to be on; without
 *                   it the pills only show, and nothing shows for a post without reactions.
 *
 * @example
 *   <Reactions reactions={post.reactions} onToggle={(content, on) => onReact(post.id, content, on)} />
 */
export function Reactions({ reactions = [], onToggle }: { reactions?: Reaction[]; onToggle?: (content: ReactionContent, on: boolean) => void }) {
  const [picking, setPicking] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!picking) return;
    const close = (e: MouseEvent) => {
      if (!row.current?.contains(e.target as Node)) setPicking(false);
    };
    const scrolled = () => setPicking(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", scrolled, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", scrolled, true);
    };
  }, [picking]);

  useLayoutEffect(() => {
    if (!picking || !menu.current || !opener.current) return setPos(null);
    const token = (name: string) => parseFloat(getComputedStyle(menu.current!).getPropertyValue(name));
    const view = { width: window.innerWidth, height: window.innerHeight };
    setPos(menuPosition(menu.current.getBoundingClientRect(), { anchor: opener.current.getBoundingClientRect() }, view, token("--pop-gap"), token("--window-margin")));
  }, [picking]);

  if (reactions.length === 0 && !onToggle) return null;
  const mine = (content: ReactionContent) => reactions.some((r) => r.content === content && r.mine);
  const pick = (content: ReactionContent) => {
    setPicking(false);
    opener.current?.focus();
    onToggle?.(content, !mine(content));
  };

  return (
    <div
      ref={row}
      className="reactions"
      role="group"
      aria-label={t("reaction.list")}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !picking) return;
        // Keeps the window-wide Escape (reset view) from firing while the picker closes.
        e.stopPropagation();
        setPicking(false);
        opener.current?.focus();
      }}
    >
      {reactions.map((r) => {
        const label = reactionLabel(r);
        return (
          <button key={r.content} className={`reaction${r.mine ? " mine" : ""}`} aria-pressed={r.mine} title={label} aria-label={label} disabled={!onToggle} onClick={() => onToggle?.(r.content, !r.mine)}>
            <span aria-hidden>{REACTIONS[r.content]}</span>
            <span className="reaction-count">{r.count}</span>
          </button>
        );
      })}
      {onToggle && (
        <button ref={opener} className="reaction reaction-add" title={t("reaction.add")} aria-label={t("reaction.add")} aria-expanded={picking} onClick={() => setPicking(!picking)}>
          <SmilePlus size={14} aria-hidden />
        </button>
      )}
      {picking && (
        <div ref={menu} className="reaction-menu" style={pos ? { left: pos.x, top: pos.y } : { visibility: "hidden" }}>
          {REACTION_ORDER.map((content) => (
            <button key={content} className={`reaction-pick${mine(content) ? " mine" : ""}`} aria-pressed={mine(content)} title={t(`reaction.${content}`)} aria-label={t(`reaction.${content}`)} onClick={() => pick(content)}>
              {REACTIONS[content]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
