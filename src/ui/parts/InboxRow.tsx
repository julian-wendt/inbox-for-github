import { motion } from "motion/react";
import { CalendarDays } from "lucide-react";
import { numberSpans, titleSpans } from "../textFilter";
import { Highlight } from "./Highlight";
import type { Classified } from "../../classify";
import { t } from "../i18n";
import { compactAgo, rowContext } from "../labels";
import { carriedText, datedText, dayLong, type Dated } from "../plan";
import { useScrollIntoView } from "../useScrollIntoView";
import { Avatar } from "./Avatar";
import { EventMark, KindIcon, WhenIcon } from "./ItemMarks";
import type { RowWhen } from "../followUp";

interface Props {
  entry: Classified;
  selected: boolean;
  /** Not opened since what put it here; the title prints bold. */
  unread: boolean;
  /** Pinned for today (T) or planned for a day (P): the day in the context line. */
  dated?: Dated;
  /** The dated item in every view, Planned too: its calendar event gets a mark of its own. */
  event?: Dated;
  /** In Today since a day before today: carried over, marked since when. */
  carriedSince?: string;
  /** What the row shows at its end instead of the time: in Planned the day, for a follow-up when it comes back. */
  when?: RowWhen;
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

export function InboxRow({ entry, selected, unread, dated, event, carriedSince, when, avatar, onSelect, onOpen, onMenu, time, query, still }: Props) {
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
      className={`inbox-row${selected ? " selected" : ""}${unread ? " unread" : ""}`}
      aria-selected={selected}
      data-id={item.id}
      title={`${item.repo}#${item.number}`}
      onMouseDown={(e) => e.button === 0 && onSelect()}
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
          {carriedSince && (
            <span className="row-mark carried" title={t("focus.carriedHint", { date: dayLong(carriedSince) })}>
              {carriedText(carriedSince)}
            </span>
          )}
          {dated && <DayMark dated={dated} />}
          {/* "Assigned to you · app"; in Assigned to me the group heading names the repo already. */}
          <span className="row-text">{`${rowContext(entry)} · ${item.repo.split("/")[1]}`}</span>
          {event && <span aria-hidden>·</span>}
          {event && <EventMark dated={event} className="row-mark" />}
        </span>
      </span>
      <span className="row-end">
        {when ? (
          <time className="row-when" title={when.title}>
            <WhenIcon when={when} />
            {when.text}
          </time>
        ) : (
          <time>{compactAgo(time)}</time>
        )}
        <span>#<Highlight spans={numberSpans(item.number, query)} /></span>
      </span>
    </motion.li>
  );
}

/** The day of a dated item in its context line: the plan's icon and "Today", "Tomorrow", the weekday or the date. */
function DayMark({ dated }: { dated: Dated }) {
  const { text, title } = datedText(dated);
  return (
    <span className="row-mark" title={title}>
      <CalendarDays size={14} strokeWidth={1.75} aria-hidden />
      {text}
    </span>
  );
}
