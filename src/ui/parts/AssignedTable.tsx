import { CalendarDays, ChevronRight, ChevronsDownUp, ChevronsUpDown, Columns3, GripVertical, IterationCw } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { useScrollIntoView, useScrollToBar } from "../useScrollIntoView";
import type { Classified } from "../../classify";
import type { Reopen } from "../../model";
import { assignedAt, hasNewActivity, isNewAssignment, isTypeGroup, shownStatus, type PlateGroup, type TableGroup, type TableGrouping } from "../assignments";
import { dateLocale, t, type MessageKey } from "../i18n";
import { compactAgo, KINDS, openedText, type KindFilter, type View } from "../labels";
import type { StatusMap } from "../../workStatus";
import type { SprintFilter } from "../sprints";
import type { SortOrder } from "../useSortOrders";
import { AttributeChips } from "./AttributeChips";
import { SortButton } from "./SortButton";
import { BucketInfo } from "./BucketInfo";
import { Elsewhere } from "./Elsewhere";
import { HeaderMenu } from "./HeaderMenu";
import { useGutter } from "../useGutter";
import { useSearchDock } from "../useSearchDock";
import { MarkedChip } from "./MarkedChip";
import { Highlight } from "./Highlight";
import { SearchField } from "./SearchField";
import { followUpWhen, rowWhen, type RowWhen } from "../followUp";
import { carriedText, datedText, dayLong, type Dated } from "../plan";
import type { Layout } from "../useViewLayout";
import { numberSpans, titleSpans } from "../textFilter";
import { EventMark, KindIcon, WhenIcon } from "./ItemMarks";
import { LayoutSwitch } from "./LayoutSwitch";

/** What a bar holds, in a quiet line after its count; type and time bars name themselves. */
const HINTS: Partial<Record<TableGroup, MessageKey>> = {
  review: "table.reviewHint",
  progress: "table.progressHint",
  todo: "table.todoHint",
  blocked: "table.blockedHint",
  later: "table.laterHint",
  finished: "table.finishedHint",
  pr: "table.prHint",
  unassigned: "table.unassignedHint",
  taken: "table.takenHint",
};

interface Props {
  /** The search bar ⌘F opens: null while closed, else the typed text; `searchRef` is its input. */
  search: string | null;
  onSearch: (search: string | null) => void;
  /** How many items match the search, for the bar. */
  searchCount: number;
  searchRef: RefObject<HTMLInputElement | null>;
  /** "assigned": Assigned to me, with stars, the new mark and the grouping switch. "authored": Created by me, with the opening time. "planned": Planned by day. "snoozed": Follow-up by the day it comes back. */
  mode: "assigned" | "authored" | "planned" | "snoozed";
  /** Planned: the layout menu in the header, list or table. */
  layout?: Layout;
  onLayout?: (layout: Layout) => void;
  title: string;
  reopenOn: Reopen;
  onShowRules: () => void;
  groups: { group: TableGroup; entries: Classified[] }[];
  /** What the bars are grouped by, and the choices of the switch; without choices there is no switch. Status bars of Assigned to me and its type bars are reorderable. */
  grouping: TableGrouping;
  groupings?: readonly TableGrouping[];
  onGrouping: (grouping: TableGrouping) => void;
  collapsed: Set<string>;
  onToggle: (group: TableGroup) => void;
  /** The sprint filter and the sprints to choose from; without sprints there is no filter. */
  sprint: SprintFilter;
  sprints: string[];
  onSprint: (sprint: SprintFilter) => void;
  /** Folds or unfolds every bar. */
  onToggleAll: (fold: boolean) => void;
  /** The keys of the attributes to show, in order (see `tableKeys`). */
  attributes: string[];
  /** Every attribute the table can show, with its name and switch, for the header menu. */
  columns: { key: string; name: string; shown: boolean }[];
  onColumn: (key: string, shown: boolean) => void;
  /** Assigned to me: the opening date after the title (the "created" switch of its header menu). */
  showOpened: boolean;
  hiddenBoards: string[];
  statusMap: StatusMap;
  /** The status bar selected with the keyboard, if any. */
  selectedBar: TableGroup | null;
  onSelectBar: (group: TableGroup) => void;
  /** Why an item has a date, if it has one (see `datedOf`): the star, the day after the title and, in Planned, the time at the end follow it. */
  datedOf: (entry: Classified) => Dated | null;
  /** Per pinned item, the day it came into Today; one before `today` marks the row as carried over. */
  pinnedOn: Record<string, string>;
  /** The local date ("2026-10-28"). */
  today: string;
  /** A bar dragged onto another: move it there. */
  onMove: (bar: TableGroup, target: TableGroup) => void;
  seen: Map<string, string>;
  /** Items marked unread by hand, printed bold like those with news. */
  unreadMarks: ReadonlyMap<string, string>;
  me: string;
  kind: KindFilter;
  sort: SortOrder;
  onSort: () => void;
  onKind: (kind: KindFilter) => void;
  selected: string | null;
  onSelect: (id: string) => void;
  /** Opens the item in the pop-up detail. */
  onOpen: (id: string) => void;
  /** Items marked for acting on several at once; ⌘-click toggles one (`range` false), ⇧-click a range. */
  marks: ReadonlySet<string>;
  onMark: (id: string, range: boolean) => void;
  onClearMarks: () => void;
  /** Right click on a row: selects it and opens its context menu at the pointer. */
  onMenu: (entry: Classified, e: React.MouseEvent) => void;
  /** Items per view for the current selection, to point an empty table to the other views. */
  counts: Record<View, number>;
  onJump: (bucket: View) => void;
}

/**
 * "Assigned to me" or "Created by me" as a full-width table: one collapsible bar per group (see
 * `groupPlate`, `groupAuthored`) and a compact row per item with its number, title, attribute
 * chips and one time at the end: when the viewer was assigned, or when the item was opened. In
 * Assigned to me the opening date can follow the title. A click selects and opens the item; the
 * detail shows as a pop-up above the table.
 *
 * @example
 *   <AssignedTable mode="assigned" groups={plate} collapsed={bars.collapsed} onToggle={bars.toggle} … />
 */
export function AssignedTable(props: Props) {
  const { groups, collapsed, onToggle, onMove, selectedBar, onSelectBar, attributes, hiddenBoards, statusMap, seen, me, selected, onSelect, onOpen, datedOf } = props;
  const assigned = props.mode === "assigned";
  const anyOpen = groups.some((g) => !collapsed.has(g.group));
  // One width for the whole end column, so the attribute chips end at the same place on every row.
  const whenColumn = props.mode === "planned" ? " when-days" : groups.some((g) => g.entries.some((e) => followUpWhen(e))) ? " when-times" : "";
  const row = (entry: Classified) => {
    const dated = datedOf(entry);
    const pinned = dated?.kind === "today";
    return (
      <Row
        query={props.search ?? ""}
        key={entry.item.id}
        entry={entry}
        me={me}
        attributes={attributes}
        hiddenBoards={hiddenBoards}
        statusMap={statusMap}
        fresh={{ assignment: assigned && isNewAssignment(entry, seen, me), activity: hasNewActivity(entry, seen, me), marked: props.unreadMarks.has(entry.item.id) }}
        selected={entry.item.id === selected}
        marked={props.marks.has(entry.item.id)}
        onMark={(range) => props.onMark(entry.item.id, range)}
        showOpened={props.showOpened}
        dated={props.mode === "planned" ? undefined : (dated ?? undefined)}
        event={dated ?? undefined}
        carriedSince={pinned && props.pinnedOn[entry.item.id] < props.today ? props.pinnedOn[entry.item.id] : undefined}
        when={rowWhen(entry, dated, props.mode === "planned")}
        assigned={assigned}
        onMenu={(e) => props.onMenu(entry, e)}
        onOpen={() => {
          onSelect(entry.item.id);
          onOpen(entry.item.id);
        }}
      />
    );
  };
  const [dragged, setDragged] = useState<TableGroup | null>(null);
  const [over, setOver] = useState<TableGroup | null>(null);
  const byStatus = assigned && props.grouping === "status";
  // By type, only the type bars move; Blocked, Follow-up and Finished stay at the bottom.
  const movable = (group: TableGroup) => assigned && (byStatus || isTypeGroup(group));
  const dotted = (color: string, text: string) => (
    <>
      <i className={`option-dot option-${color}`} aria-hidden />
      {text}
    </>
  );
  const label = (group: TableGroup, entries: Classified[]) => {
    if (group === "pr") return t("table.pr");
    if (group === "notype") return dotted("gray", t("table.noType"));
    if (group === "finished") return t("table.finished");
    if (group === "unassigned") return t("table.unassigned");
    if (group === "taken") return t("table.taken");
    if (group.startsWith("type:")) return dotted(entries[0]?.item.issueType?.color.toLowerCase() ?? "gray", group.slice(5));
    if (group.startsWith("repo:")) return group.slice(5);
    if (group.startsWith("day:")) return t(`time.group.${group.slice(4)}` as MessageKey);
    return t(`table.${group as PlateGroup}`);
  };
  const scroll = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  useGutter(() => scroll.current, () => section.current);
  const { body, shown } = useSearchDock(props.search !== null);
  useScrollToBar(scroll, selectedBar);
  const sprintLabel = props.sprint === "all" ? t("sprint.all") : props.sprint === "none" ? t("sprint.none") : props.sprint.slice("sprint:".length);
  const sprintEntries = [
    { label: t("sprint.all"), checked: props.sprint === "all", onSelect: () => props.onSprint("all") },
    { label: t("sprint.none"), checked: props.sprint === "none", onSelect: () => props.onSprint("none") },
    ...props.sprints.map((name, i) => ({ label: name, checked: props.sprint === `sprint:${name}`, divided: i === 0, onSelect: () => props.onSprint(`sprint:${name}`) })),
  ];
  return (
    <section className={`assigned${whenColumn}`} ref={section}>
      <header className="pane-header" data-tauri-drag-region>
        <h1>{props.title}</h1>
        <MarkedChip count={props.marks.size} onClear={props.onClearMarks} />
        <span className="header-controls" aria-hidden />
        <HeaderMenu icon={<IterationCw size={13} />} label={sprintLabel} title={t("sprint.title")} entries={sprintEntries} disabled={props.sprints.length === 0} />
        <div className="segmented compact" role="radiogroup" aria-label={t("list.kind")}>
          {KINDS.map((k) => (
            <button key={k.id} role="radio" aria-checked={props.kind === k.id} className={props.kind === k.id ? "on" : ""} onClick={() => props.onKind(k.id)}>
              {k.title}
            </button>
          ))}
        </div>
        {props.layout && props.onLayout && <LayoutSwitch layout={props.layout} onLayout={props.onLayout} />}
        {props.groupings && (
          <div className="segmented compact table-grouping" role="radiogroup" aria-label={t("table.groupBy")}>
            {props.groupings.map((g) => (
              <button key={g} role="radio" aria-checked={props.grouping === g} className={props.grouping === g ? "on" : ""} onClick={() => props.onGrouping(g)}>
                {t(`table.groupBy.${g}`)}
              </button>
            ))}
          </div>
        )}
        <HeaderMenu
          icon={<Columns3 size={13} />}
          title={t("table.columns")}
          entries={props.columns.map((c) => ({ label: c.name, checked: c.shown, keepOpen: true, onSelect: () => props.onColumn(c.key, !c.shown) }))}
        />
        <button className="chip-btn" disabled={groups.length === 0} onClick={() => props.onToggleAll(anyOpen)} title={t(anyOpen ? "table.collapseAll" : "table.expandAll")} aria-label={t(anyOpen ? "table.collapseAll" : "table.expandAll")}>
          {anyOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
        </button>
        <SortButton order={props.sort} onFlip={props.onSort} by={props.mode === "planned" || props.mode === "snoozed" ? "return" : undefined} />
        <BucketInfo key={props.mode} bucket={props.mode} reopenOn={props.reopenOn} onShowRules={props.onShowRules} />
      </header>
            <div className="dock-body" ref={body}>
        {shown && <SearchField value={props.search ?? ""} onChange={props.onSearch} count={props.searchCount} inputRef={props.searchRef} />}
        <div className="assigned-scroll" ref={scroll}>
          {groups.map(({ group, entries }) => (
            <div
              key={group}
              className={`bar-group${over === group && dragged !== group ? " drop-target" : ""}`}
              onDragOver={(e) => {
                if (!dragged || !movable(group)) return;
                e.preventDefault();
                setOver(group);
              }}
              onDragLeave={() => setOver((current) => (current === group ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged && dragged !== group && movable(group)) onMove(dragged, group);
                setDragged(null);
                setOver(null);
              }}
            >
              <button
                className={`bar${selectedBar === group ? " selected" : ""}`}
                aria-expanded={!collapsed.has(group)}
                onClick={() => {
                  onSelectBar(group);
                  onToggle(group);
                }}
                data-bar={group}
                draggable={movable(group)}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDragged(group);
                }}
                onDragEnd={() => {
                  setDragged(null);
                  setOver(null);
                }}
                title={movable(group) ? t("table.dragHint") : undefined}
              >
                <GripVertical size={16} className={`bar-grip${movable(group) ? "" : " hidden"}`} />
                <ChevronRight size={14} className="bar-chevron" />
                {label(group, entries)}
                <span>{entries.length}</span>
                {HINTS[group] && <small className="bar-hint">{t(HINTS[group])}</small>}
              </button>
              {!collapsed.has(group) && entries.map(row)}
            </div>
          ))}
          {groups.length === 0 && (
            <div className="assigned-empty">
              <p>{t(`list.empty.${props.mode}`)}</p>
              <Elsewhere counts={props.counts} current={props.mode} onJump={props.onJump} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface RowProps {
  /** The search text, to mark the matches in title and number. */
  query: string;
  entry: Classified;
  me: string;
  attributes: string[];
  hiddenBoards: string[];
  statusMap: StatusMap;
  /** Assigned since the viewer last opened it, and new activity by others since then. */
  /** New assignment, new activity, or marked unread by hand; any of them prints the row bold. */
  fresh: { assignment: boolean; activity: boolean; marked: boolean };
  selected: boolean;
  /** Marked with others; a click with ⌘ or ⇧ marks instead of opening. */
  marked: boolean;
  onMark: (range: boolean) => void;
  showOpened: boolean;
  /** Pinned for today or planned for a day: the day as a blue badge after the title; left out in Planned, whose end column names it. */
  dated?: Dated;
  /** The dated item in every view, Planned too: its calendar event gets a badge of its own. */
  event?: Dated;
  /** The day the item came into Today when that was before today: it carries over, marked. */
  carriedSince?: string;
  /** A row of Assigned to me, timed by the assignment; otherwise the row is timed by the opening. */
  assigned: boolean;
  /** Shown at the end instead of the time: in Planned, the day or the return time. */
  when?: RowWhen;
  onOpen: () => void;
  onMenu: (e: React.MouseEvent) => void;
}

function Row({ query, entry, me, attributes, hiddenBoards, statusMap, fresh, selected, marked, onMark, showOpened, dated, event, carriedSince, when, assigned, onOpen, onMenu }: RowProps) {
  const { item } = entry;
  const ref = useScrollIntoView<HTMLDivElement>(selected);
  const full =(at: string) => new Date(at).toLocaleString(dateLocale(), { dateStyle: "medium", timeStyle: "short" });
  const opened = t("table.openedOn", { date: full(item.createdAt) });
  const assignment = assigned ? assignedAt(item, me) : null;
  const assignedTitle = assignment && (assignment.by ? t("table.assignedBy", { name: assignment.by, date: full(assignment.at) }) : t("table.assignedOn", { date: full(assignment.at) }));
  const dotText = fresh.activity ? "plate.newDot" : fresh.assignment ? "plate.newAssignmentDot" : "row.unread";
  return (
    <div
      className={`table-row${selected ? " selected" : ""}${marked ? " marked" : ""}${fresh.assignment || fresh.activity || fresh.marked ? " unread" : ""}`}
      data-id={item.id}
      role="button"
      tabIndex={-1}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        if (!e.metaKey && !e.shiftKey) return onOpen();
        e.preventDefault();
        onMark(e.shiftKey);
      }}
      onContextMenu={onMenu}
      ref={ref}
    >
      {(fresh.activity || fresh.assignment || fresh.marked) && <span className="fresh-dot" title={t(dotText)} aria-label={t(dotText)} />}
      <KindIcon item={item} size={14} status={shownStatus(entry, statusMap)} />
      <span className="table-number">#<Highlight spans={numberSpans(item.number, query)} /></span>
      {fresh.assignment && (
        <span className="new-mark" title={t("table.newMarkHint")}>
          {t("table.newMark")}
        </span>
      )}
      <span className="table-title">
        <span className="table-title-text"><Highlight spans={titleSpans(item.title, query)} /></span>
        {carriedSince && (
          <span className="table-carried" title={t("focus.carriedHint", { date: dayLong(carriedSince) })}>
            {carriedText(carriedSince)}
          </span>
        )}
        {dated && (
          <span className="table-planned" title={datedText(dated).title}>
            <CalendarDays size={13} strokeWidth={1.75} aria-hidden />
            <span>{datedText(dated).text}</span>
          </span>
        )}
        {event && <EventMark dated={event} className="table-planned" />}
        {showOpened && (
          <span className="table-opened" title={opened}>
            {openedText(item.createdAt)}
          </span>
        )}
      </span>
      {/* One line high: attributes that do not fit wrap to a hidden second line, so the last ones go first. */}
      <span className="table-attrs">
        <AttributeChips keys={attributes} item={entry.item} me={me} hiddenBoards={hiddenBoards} statusMap={statusMap} />
      </span>
      <time className="table-update" title={when?.title ?? assignedTitle ?? opened}>
        {when && <WhenIcon when={when} />}
        {when?.text ?? compactAgo(assignment?.at ?? item.createdAt)}
      </time>
    </div>
  );
}
