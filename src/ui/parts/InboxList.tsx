import { ChevronRight, ChevronsDownUp, ChevronsUpDown, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, type RefObject } from "react";
import type { Classified } from "../../classify";
import type { Reopen } from "../../model";
import { t } from "../i18n";
import { ASK_FILTERS, ASK_VIEWS, type AskFilter } from "../inboxFilter";
import { KINDS, type KindFilter, type View } from "../labels";
import type { SortOrder } from "../useSortOrders";
import { BucketInfo } from "./BucketInfo";
import { Elsewhere } from "./Elsewhere";
import { SortButton } from "./SortButton";
import { useGutter } from "../useGutter";
import { useScrollToBar } from "../useScrollIntoView";
import { useSearchDock } from "../useSearchDock";
import { InboxRow } from "./InboxRow";
import { MarkedChip } from "./MarkedChip";
import { SearchField } from "./SearchField";

interface Props {
  /** The search bar ⌘F opens: null while closed, else the typed text; `searchRef` is its input. */
  search: string | null;
  onSearch: (search: string | null) => void;
  /** How many items match the search, for the bar. */
  searchCount: number;
  searchRef: RefObject<HTMLInputElement | null>;
  bucket: View;
  title: string;
  reopenOn: Reopen;
  onShowRules: () => void;
  entries: Classified[];
  kind: KindFilter;
  /** The mentions/reviews switch of the Inbox, Snoozed and Done, shown there instead of the kind; with the items each choice holds. */
  ask: AskFilter;
  askCounts: Record<AskFilter, number>;
  onAsk: (ask: AskFilter) => void;
  sort: SortOrder;
  /** Time groups over the entries, each a foldable bar. Absent: a plain list. */
  timeGroups?: { group: string; heading: string; entries: Classified[] }[];
  folded: (group: string) => boolean;
  onToggleGroup: (group: string) => void;
  /** Folds (true) or unfolds every group. */
  onToggleAll: (fold: boolean) => void;
  /** The group bar selected with the keyboard, if any. */
  selectedGroup: string | null;
  onSort: () => void;
  onKind: (kind: KindFilter) => void;
  selected: string | null;
  loading: boolean;
  avatars: boolean;
  onSelect: (id: string) => void;
  onOpen: (entry: Classified) => void;
  /** Items marked for acting on several at once; ⌘-click toggles one (`range` false), ⇧-click a range. */
  marks: ReadonlySet<string>;
  onMark: (id: string, range: boolean) => void;
  onClearMarks: () => void;
  /** Right click on a row: selects it and opens its context menu at the pointer. */
  onMenu: (entry: Classified, e: React.MouseEvent) => void;
  /** Items per view for the current selection, to point an empty view to the others. */
  counts: Record<View, number>;
  /** The time each row shows, as it is sorted (`sortTime`). */
  timeOf: (entry: Classified) => string;
  /** Ids of the unread items, printed bold. */
  unread: ReadonlySet<string>;
  onJump: (bucket: View) => void;
}

export function InboxList({ bucket, title, reopenOn, onShowRules, entries, kind, ask, askCounts, onAsk, sort, onSort, timeGroups, folded, onToggleGroup, onToggleAll, selectedGroup, onKind, selected, loading, avatars, onSelect, onOpen, onMenu, counts, onJump, timeOf, unread, marks, onMark, onClearMarks, search, onSearch, searchCount, searchRef }: Props) {
  const section = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const empty = useRef<HTMLDivElement>(null);

  // The empty state scrolls too, so the scrollbar's room, and with it the header, stays when the list empties.
  useGutter(() => list.current ?? empty.current, () => section.current);
  useScrollToBar(list, selectedGroup);

  const anyOpen = (timeGroups ?? []).some((g) => !folded(g.group));

  const { body, shown, moving } = useSearchDock(search !== null);

  return (
    <section className="inbox" ref={section}>
      <header className="pane-header" data-tauri-drag-region>
        <h1>{title}</h1>
        <MarkedChip count={marks.size} onClear={onClearMarks} />
        {ASK_VIEWS.includes(bucket) ? (
          <div className="segmented compact" role="radiogroup" aria-label={t("inbox.filter")}>
            {ASK_FILTERS.map((f) => (
              <button key={f} role="radio" aria-checked={ask === f} className={ask === f ? "on" : ""} onClick={() => onAsk(f)}>
                {t(`inbox.filter.${f}`)}
                {f !== "all" && <span className="segment-count">{askCounts[f]}</span>}
              </button>
            ))}
          </div>
        ) : (
          <div className="segmented compact" role="radiogroup" aria-label={t("list.kind")}>
            {KINDS.map((k) => (
              <button key={k.id} role="radio" aria-checked={kind === k.id} className={kind === k.id ? "on" : ""} onClick={() => onKind(k.id)}>
                {k.title}
              </button>
            ))}
          </div>
        )}
        {timeGroups && (
          <button
            className="chip-btn"
            onClick={() => onToggleAll(anyOpen)}
            disabled={timeGroups.length === 0}
            title={t(anyOpen ? "table.collapseAll" : "table.expandAll")}
            aria-label={t(anyOpen ? "table.collapseAll" : "table.expandAll")}
          >
            {anyOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
          </button>
        )}
        <SortButton order={sort} onFlip={onSort} by={bucket === "snoozed" ? "return" : undefined} />
        <BucketInfo key={bucket} bucket={bucket} reopenOn={reopenOn} onShowRules={onShowRules} />
      </header>
      <div className="dock-body" ref={body}>
        {shown && <SearchField value={search ?? ""} onChange={onSearch} count={searchCount} inputRef={searchRef} />}
        {entries.length === 0 ? (
          <div className="inbox-empty" ref={empty}>
            <span className={`inbox-empty-mark${loading ? " loading" : ""}`}>
              {loading ? <LoaderCircle size={20} className="spin" /> : "✓"}
            </span>
            <p>{loading ? t("list.loading") : t(bucket === "snoozed" ? "list.empty.snoozed" : bucket === "done" ? "list.empty.done" : "list.empty.inbox")}</p>
            {!loading && <Elsewhere counts={counts} current={bucket} onJump={onJump} />}
          </div>
        ) : (
          <ul ref={list} className="inbox-list" role="listbox" aria-label={title}>
            <AnimatePresence initial={false} mode="popLayout">
              {(timeGroups ?? [{ group: null, heading: "", entries }]).flatMap(({ group, heading, entries: rows }) => [
                ...(group
                  ? [
                      // Moves like the rows (see InboxRow), so rows never slide over a heading.
                      <motion.li
                        key={`g-${group}`}
                        className="list-bar"
                        role="presentation"
                        layout={moving ? false : "position"}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.16 } }}
                        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                      >
                        <button
                          className={`bar${selectedGroup === group ? " selected" : ""}`}
                          aria-expanded={!folded(group)}
                          onClick={() => onToggleGroup(group)}
                          data-bar={group}
                        >
                          <ChevronRight size={14} className="bar-chevron" />
                          {heading}
                          <span>{rows.length}</span>
                        </button>
                      </motion.li>,
                    ]
                  : []),
                ...(group && folded(group) ? [] : rows).map((entry) => (
                  <InboxRow
                    query={search ?? ""}
                    still={moving}
                    key={entry.item.id}
                    entry={entry}
                    selected={entry.item.id === selected}
                    marked={marks.has(entry.item.id)}
                    unread={bucket === "inbox" && unread.has(entry.item.id)}
                    onMark={(range) => onMark(entry.item.id, range)}
                    avatar={avatars}
                    onSelect={() => onSelect(entry.item.id)}
                    onOpen={() => onOpen(entry)}
                    onMenu={(e) => onMenu(entry, e)}
                    time={timeOf(entry)}
                  />
                )),
              ])}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  );
}
