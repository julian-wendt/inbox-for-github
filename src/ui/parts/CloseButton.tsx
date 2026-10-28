import { ChevronDown, CircleCheck, CircleDot, CircleSlash, GitPullRequestClosed } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CloseReason } from "../../github/comment";
import type { Item } from "../../model";
import { t } from "../i18n";

/** Room the reason menu needs below the button, with its gap; less than that opens it upward. */
const MENU_HEIGHT = 140;

/**
 * The button next to Comment, as on GitHub: "Close issue" with a menu for the reason (completed
 * or not planned, opening downward unless the window lacks room), "Close pull request", or "Reopen …" for a closed item; with text in the box
 * it reads "… with comment". Renders nothing for merged pull requests.
 *
 * @param item       The item to close or reopen.
 * @param withText   The comment box holds text, which is posted first.
 * @param busy       A request is running; disables the button.
 * @param onAction   Called with what to do.
 *
 * @example
 *   <CloseButton item={item} withText={!!text.trim()} busy={sending} onAction={(action, reason) => …} />
 */
export function CloseButton(props: { item: Item; withText: boolean; busy: boolean; onAction: (action: "close" | "reopen", reason?: CloseReason) => void }) {
  const { item, withText, busy, onAction } = props;
  const [menu, setMenu] = useState(false);
  const [upward, setUpward] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggleMenu = () => {
    const rect = root.current?.getBoundingClientRect();
    setUpward(!!rect && window.innerHeight - rect.bottom < MENU_HEIGHT);
    setMenu(!menu);
  };

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setMenu(false);
    };
    // Esc in the capture phase and stopped, so it closes the menu first and not also the selection behind it.
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMenu(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape, true);
    };
  }, [menu]);

  if (item.closed?.state === "merged") return null;
  const kind = item.kind === "pr" ? "pr" : "issue";
  const choose = (reason: CloseReason) => {
    setMenu(false);
    onAction("close", reason);
  };

  if (item.closed) {
    return (
      <button className="btn" disabled={busy} onClick={() => onAction("reopen")}>
        <CircleDot size={15} className="icon-open" />
        {withText ? t("close.reopenWithComment") : t(`close.reopen.${kind}`)}
      </button>
    );
  }

  const label = withText ? t("close.withComment") : t(`close.${kind}`);
  if (kind === "pr") {
    return (
      <button className="btn" disabled={busy} onClick={() => onAction("close")}>
        <GitPullRequestClosed size={15} className="icon-closed-pr" />
        {label}
      </button>
    );
  }
  return (
    <div className="split-btn" ref={root}>
      <button className="btn" disabled={busy} onClick={() => onAction("close", "COMPLETED")}>
        <CircleCheck size={15} className="icon-completed" />
        {label}
      </button>
      <button className="btn" disabled={busy} aria-haspopup="menu" aria-expanded={menu} aria-label={t("close.reasons")} onClick={toggleMenu}>
        <ChevronDown size={14} />
      </button>
      {menu && (
        <div className={`popover close-menu${upward ? " up" : ""}`} role="menu">
          <button role="menuitem" onClick={() => choose("COMPLETED")}>
            <CircleCheck size={15} className="icon-completed" />
            <span>
              <strong>{t("close.completed")}</strong>
              <small>{t("close.completedHint")}</small>
            </span>
          </button>
          <button role="menuitem" onClick={() => choose("NOT_PLANNED")}>
            <CircleSlash size={15} className="icon-muted" />
            <span>
              <strong>{t("close.notPlanned")}</strong>
              <small>{t("close.notPlannedHint")}</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
