import { t } from "../i18n";

/**
 * Under a list whose filters hide every unread item it counts: how many, and a button that sets
 * the filters back to show them. Renders nothing for a count of 0.
 *
 * @param count   The unread items the filters hide (see `hiddenUnread`).
 * @param onShow  Sets the view's filters back to "all".
 *
 * @example
 *   <HiddenUnreadHint count={2} onShow={showAll} /> // "2 unread items are hidden by the filter. Show all"
 */
export function HiddenUnreadHint({ count, onShow }: { count: number; onShow: () => void }) {
  if (count === 0) return null;
  return (
    <p className="elsewhere hidden-unread">
      <span>{count === 1 ? t("hiddenUnread.one") : t("hiddenUnread.many", { count })}</span>
      <button className="link-btn" onClick={onShow}>
        {t("hiddenUnread.show")}
      </button>
    </p>
  );
}
