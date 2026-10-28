import { motion } from "motion/react";
import { numberSpans, titleSpans } from "../textFilter";
import { Highlight } from "./Highlight";
import type { Classified } from "../../classify";
import { t } from "../i18n";
import { compactAgo, rowContext } from "../labels";
import { reminderText, untilShort } from "../snooze";
import { useScrollIntoView } from "../useScrollIntoView";
import { Avatar } from "./Avatar";
import { KindIcon, FollowUpBell } from "./ItemMarks";

interface Props {
  entry: Classified;
  selected: boolean;
  /** Marked with others; a click with ⌘ or ⇧ marks instead of selecting. */
  marked: boolean;
  /** Not opened since what put it here; the title prints bold. */
  unread: boolean;
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

export function InboxRow({ entry, selected, marked, unread, onMark, avatar, onSelect, onOpen, onMenu, time, query, still }: Props) {
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
          <FollowUpBell entry={entry} />
          {/* "Assigned to you · app"; in Assigned to me the group heading names the repo already. */}
          <span>{`${rowContext(entry)} · ${item.repo.split("/")[1]}`}</span>
        </span>
      </span>
      <span className="row-end">
        {entry.bucket === "snoozed" && entry.until ? <time title={reminderText(entry.until)}>{untilShort(entry.until)}</time> : <time>{compactAgo(time)}</time>}
        <span>#<Highlight spans={numberSpans(item.number, query)} /></span>
      </span>
    </motion.li>
  );
}
