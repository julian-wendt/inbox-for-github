import { CalendarDays, Star } from "lucide-react";
import { motion } from "motion/react";
import { numberSpans, titleSpans } from "../textFilter";
import { Highlight } from "./Highlight";
import type { Classified } from "../../classify";
import { t } from "../i18n";
import { compactAgo, rowContext } from "../labels";
import { carriedText, dayLong, dayShort } from "../plan";
import { useScrollIntoView } from "../useScrollIntoView";
import { Avatar } from "./Avatar";
import { KindIcon } from "./ItemMarks";

interface Props {
  entry: Classified;
  selected: boolean;
  /** Marked with others; a click with ⌘ or ⇧ marks instead of selecting. */
  marked: boolean;
  /** Not opened since what put it here; the title prints bold. */
  unread: boolean;
  /** Pinned for today (T): a filled star in the context line. */
  pinned: boolean;
  /** Planned for a later day (P): that day in the context line. */
  plannedDay?: string;
  /** In Today since a day before today: carried over, marked since when. */
  carriedSince?: string;
  /** What the row shows at its end instead of the time: in Planned the day, for a follow-up when it comes back. */
  when?: { text: string; title: string };
  onMark: (range: boolean) => void;
  avatar: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onMenu: (e: React.MouseEvent) => void;
  /** When the row's view says it happened (`sortTime`). */
  time: string;
  /** The search text, to mark the matches in title and number. */
  query: string;
  /** The list is sliding for the search bar: the row's own layout animation stays off. */
  still: boolean;
}

export function InboxRow({ entry, selected, marked, unread, pinned, plannedDay, carriedSince, when, onMark, avatar, onSelect, onOpen, onMenu, time, query, still }: Props) {
  const { item, mention, status } = entry;
  const person = mention?.by ?? item.author;
  const ref = useScrollIntoView<HTMLLIElement>(selected);

  return (
    <motion.li
      layout={still ? false : "position"}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.16 } }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      className={`inbox-row${selected ? " selected" : ""}${marked ? " marked" : ""}${unread ? " unread" : ""}`}
      aria-selected={selected || marked}
      data-id={item.id}
      title={`${item.repo}#${item.number}`}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        if (!e.metaKey && !e.shiftKey) return onSelect();
        e.preventDefault();
        onMark(e.shiftKey);
      }}
      onDoubleClick={onOpen}
      onContextMenu={onMenu}
      ref={ref}
    >
      {unread && <span className="fresh-dot" title={t("row.unread")} aria-label={t("row.unread")} />}
      {avatar && <Avatar login={person} src={item.avatars[person]} size={34} />}
      <span className="row-main">
        <span className="row-title"><Highlight spans={titleSpans(item.title, query)} /></span>
        <span className={`row-context${mention?.self ? " reminder" : ""}`}>
          <KindIcon item={item} size={13} status={status} />
          {pinned && (
            <span className="row-mark today" title={t("menu.today")} aria-label={t("menu.today")}>
              <Star size={12} />
            </span>
          )}
          {carriedSince && (
            <span className="row-mark carried" title={t("focus.carriedHint", { date: dayLong(carriedSince) })}>
              {carriedText(carriedSince)}
            </span>
          )}
          {plannedDay && (
            <span className="row-mark" title={t("plan.on", { date: dayLong(plannedDay) })}>
              <CalendarDays size={12} />
              {dayShort(plannedDay)}
            </span>
          )}
          {/* "Assigned to you · app"; in Assigned to me the group heading names the repo already. */}
          <span>{`${rowContext(entry)} · ${item.repo.split("/")[1]}`}</span>
        </span>
      </span>
      <span className="row-end">
        {when ? <time title={when.title}>{when.text}</time> : <time>{compactAgo(time)}</time>}
        <span>#<Highlight spans={numberSpans(item.number, query)} /></span>
      </span>
    </motion.li>
  );
}
