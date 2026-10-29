import { ChevronRight, ChevronsDownUp, ChevronsUpDown, ListFilter, LoaderCircle, Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, type RefObject } from "react";
import type { Classified } from "../../classify";
import type { Reopen } from "../../model";
import { t } from "../i18n";
import { ASK_FILTERS, ASK_VIEWS, type AskFilter } from "../inboxFilter";
import { KINDS, type KindFilter, type View } from "../labels";
import { followUpWhen } from "../followUp";
import { datedText, type Dated } from "../plan";
import { WAITING_GROUP } from "../timeGroups";
import type { Layout } from "../usePlannedLayout";
import type { SortOrder } from "../useSortOrders";
import { BucketInfo } from "./BucketInfo";
import { Elsewhere } from "./Elsewhere";
import { SortButton } from "./SortButton";
import { useGutter } from "../useGutter";
import { useScrollToBar } from "../useScrollIntoView";
import { useSearchDock } from "../useSearchDock";
import { InboxRow } from "./InboxRow";
import { MarkedChip } from "./MarkedChip";
import { LayoutSwitch } from "./LayoutSwitch";
import { HeaderMenu } from "./HeaderMenu";
import type { MenuEntry } from "./ContextMenu";
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
  /** Ids of the unread items, printed bold with a dot, in the inbox and in Planned. */
  unread: ReadonlySet<string>;
  /** Why an item has a date, if it has one (see `datedOf`): the rows' star, day and, in Planned, the time at the end follow it. */
  datedOf: (entry: Classified) => Dated | null;
  /** Per pinned item, the day it came into Today; one before `today` marks the row as carried over. */
  pinnedOn: Record<string, string>;
  /** The local date ("2026-10-28"). */
  today: string;
  /** Planned: the layout menu in the header, list or table. */
  layout?: Layout;
  onLayout?: (layout: Layout) => void;
  onJump: (bucket: View) => void;
}

export function InboxList({ bucket, title, reopenOn, onShowRules, entries, kind, ask, askCounts, onAsk, sort, onSort, timeGroups, folded, onToggleGroup, onToggleAll, selectedGroup, onKind, selected, loading, avatars, onSelect, onOpen, onMenu, counts, onJump, timeOf, unread, datedOf, pinnedOn, today, layout, onLayout, marks, onMark, onClearMarks, search, onSearch, searchCount, searchRef }: Props) {
  const section = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const empty = useRef<HTMLDivElement>(null);

  // The empty state scrolls too, so the scrollbar's room, and with it the header, stays when the list empties.
  useGutter(() => list.current ?? empty.current, () => section.current);
  useScrollToBar(list, selectedGroup);

  const anyOpen = (timeGroups ?? []).some((g) => g.group && !folded(g.group));
  const groups = timeGroups ?? [{ group: "", heading: "", entries }];
  // Nothing needs the viewer while only the waiting bar holds rows; it still shows, below the empty mark.
  const idle = groups.every((g) => g.group === WAITING_GROUP || g.entries.length === 0);
  const anyRows = groups.some((g) => g.entries.length > 0);

  const { body, shown, moving } = useSearchDock(search !== null);

  // In a narrow column the segmented filter gives way to a menu naming the choice, and the other
  // controls to a gear menu; the bulb stays on its own.
  const asking = ASK_VIEWS.includes(bucket);
  const filterEntries: MenuEntry[] = asking
    ? ASK_FILTERS.map((f) => ({ label: f === "all" ? t(`inbox.filter.${f}`) : `${t(`inbox.filter.${f}`)} · ${askCounts[f]}`, checked: ask === f, onSelect: () => onAsk(f) }))
    : KINDS.map((k) => ({ label: k.title, checked: kind === k.id, onSelect: () => onKind(k.id) }));
  const filterLabel = asking ? t(`inbox.filter.${ask}`) : KINDS.find((k) => k.id === kind)!.title;
  const orders = [
    { order: "newest", label: t(bucket === "planned" ? "sort.menu.soonest" : "sort.menu.newest") },
    { order: "oldest", label: t(bucket === "planned" ? "sort.menu.latest" : "sort.menu.oldest") },
  ] as const;
  const moreEntries: MenuEntry[] = [
    ...orders.map((o) => ({
      label: o.label,
      checked: sort === o.order,
      onSelect: () => {
        if (sort !== o.order) onSort();
      },
    })),
    ...(timeGroups ? [{ label: t(anyOpen ? "table.collapseAll" : "table.expandAll"), divided: true, onSelect: () => onToggleAll(anyOpen) }] : []),
    ...(layout && onLayout ? (["list", "table"] as const).map((l, i) => ({ label: t(`layout.${l}`), checked: layout === l, divided: i === 0, onSelect: () => onLayout(l) })) : []),
  ];

  return (
    <section className="inbox" ref={section}>
      <header className="pane-header" data-tauri-drag-region>
        <h1>{title}</h1>
        <MarkedChip count={marks.size} onClear={onClearMarks} />
        <span className="header-controls" aria-hidden />
        <span className="header-compact">
          <HeaderMenu icon={<ListFilter size={13} />} label={filterLabel} title={t(asking ? "inbox.filter" : "list.kind")} entries={filterEntries} />
        </span>
        <span className="header-full">
        {asking ? (
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
        {layout && onLayout && <LayoutSwitch layout={layout} onLayout={onLayout} />}
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
        <SortButton order={sort} onFlip={onSort} by={bucket === "planned" ? "return" : undefined} />
        </span>
        <span className="header-compact">
          <HeaderMenu icon={<Settings size={13} />} title={t("list.options")} entries={moreEntries} />
        </span>
        <BucketInfo key={bucket} bucket={bucket} reopenOn={reopenOn} onShowRules={onShowRules} />
      </header>
      <div className="dock-body" ref={body}>
        {shown && <SearchField value={search ?? ""} onChange={onSearch} count={searchCount} inputRef={searchRef} />}
        {idle && (
          <div className="inbox-empty" ref={empty}>
            <span className={`inbox-empty-mark${loading ? " loading" : ""}`}>
              {loading ? <LoaderCircle size={20} className="spin" /> : "✓"}
            </span>
            <p>{loading ? t("list.loading") : t(bucket === "planned" ? "list.empty.planned" : bucket === "done" ? "list.empty.done" : "list.empty.inbox")}</p>
            {!loading && <Elsewhere counts={counts} current={bucket} onJump={onJump} />}
          </div>
        )}
        {anyRows && (
          <ul ref={list} className={`inbox-list${idle ? " parked" : ""}`} role="listbox" aria-label={title}>
            <AnimatePresence initial={false} mode="popLayout">
              {groups.flatMap(({ group, heading, entries: rows }) => [
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
                ...(group && folded(group) ? [] : rows).map((entry) => {
                  const dated = datedOf(entry);
                  const pinned = dated?.kind === "today";
                  return (
                    <InboxRow
                      query={search ?? ""}
                      still={moving}
                      key={entry.item.id}
                      entry={entry}
                      selected={entry.item.id === selected}
                      marked={marks.has(entry.item.id)}
                      unread={(bucket === "inbox" || bucket === "planned") && unread.has(entry.item.id)}
                      dated={bucket === "planned" ? undefined : (dated ?? undefined)}
                      carriedSince={pinned && pinnedOn[entry.item.id] < today ? pinnedOn[entry.item.id] : undefined}
                      when={bucket === "planned" && dated ? datedText(dated) : followUpWhen(entry)}
                      onMark={(range) => onMark(entry.item.id, range)}
                      avatar={avatars}
                      onSelect={() => onSelect(entry.item.id)}
                      onOpen={() => onOpen(entry)}
                      onMenu={(e) => onMenu(entry, e)}
                      time={timeOf(entry)}
                    />
                  );
                }),
              ])}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  );
}
