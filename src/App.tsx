import { openUrl } from "@tauri-apps/plugin-opener";
import { ghToken } from "./github/token";
import { assignSelf, setOpen, unassignSelf, type CloseReason } from "./github/comment";
import { snapshotOf } from "./handoff";
import { queueWrite } from "./github/queue";
import { sameLogin } from "./timeline";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Classified } from "./classify";
import type { Status, StatusChange, WriteFailure } from "./model";
import { setLang, t, type MessageKey } from "./ui/i18n";
import { itemLink, KINDS, nextOf, sortTime, statusesFor, viewOf, VIEWS, type KindFilter, type LinkFormat, type View } from "./ui/labels";
import { covers, setCovered } from "./rules/directOnly";
import { ContextMenu, type MenuEntry } from "./ui/parts/ContextMenu";
import { OrcaMark } from "./ui/parts/OrcaMark";
import { repoList } from "./ui/repoList";
import { paneCenter } from "./ui/paneCenter";
import { useOrbLogins } from "./ui/avatarKinds";
import { setOrbLooks } from "./ui/orbLookStore";
import { assignLooks } from "./ui/orbLooks";
import { SnoozeDatePicker } from "./ui/parts/SnoozeDatePicker";
import { followUpOn, untilText } from "./ui/snooze";
import { canSwitchDemo, isDemo, rememberDemo } from "./demo/flag";
import { planStatus } from "./ui/statusPlan";
import { StatusIcon } from "./ui/parts/StatusIcon";
import { Bell, CalendarDays, Code, Ellipsis, ExternalLink, Hash, Link, Mail, MailOpen, RefreshCw, UserCheck, UserMinus, UserPlus, X } from "lucide-react";
import { CommandPalette } from "./ui/parts/CommandPalette";
import { Detail } from "./ui/parts/Detail";
import { Help } from "./ui/parts/Help";
import type { StateWrite } from "./ui/parts/Reply";
import { InboxList } from "./ui/parts/InboxList";
import { SettingsDialog } from "./ui/parts/SettingsDialog";
import { Resizer } from "./ui/parts/Resizer";
import { Sidebar } from "./ui/parts/Sidebar";
import { Toast } from "./ui/parts/Toast";
import { useTheme } from "./ui/theme";
import { useAttention, type Pending } from "./ui/useAttention";
import { useColumnWidths } from "./ui/useColumnWidths";
import { useHotkeys } from "./ui/useHotkeys";
import { useWindowFocus } from "./ui/useWindowFocus";
import { useInbox } from "./ui/useInbox";
import { useOrca } from "./ui/useOrca";
import { addToOrca, openInOrca, pathText } from "./orca";
import { useSelection } from "./ui/useSelection";
import { withAssignees, withSelfAssigned, FOCUS_MAX, groupByType, groupPlate, isActiveBar, localDay, moveBar, onPlate, plateCount, type PlateGroup, type TableGroup } from "./ui/assignments";
import { choiceKey, choiceText, datedAt, datedOf, datedText, dayChoices, dayShort, isPinnable, rollOver, setPlan, todayOf, unplan, without, type Today } from "./ui/plan";
import { attributeOptions, combineAttributes, shownKeys, tableKeys } from "./ui/attributes";
import { useCollapsed } from "./ui/useCollapsed";
import { useSortOrders, type SortOrder } from "./ui/useSortOrders";
import { usePlannedLayout } from "./ui/usePlannedLayout";
import { groupBySnoozeEnd, groupByTime, WAITING_GROUP, type SnoozeGroup, type TimeGroup } from "./ui/timeGroups";
import { matchesSprint, sprintChoices, type SprintFilter } from "./ui/sprints";
import { filterGroups, matchesText } from "./ui/textFilter";
import { AssignedTable } from "./ui/parts/AssignedTable";
import { pickRepo } from "./ui/repoSelection";
import { useStatusActions } from "./ui/useStatusActions";
import { markedIn, markRange, toggleMark } from "./ui/marks";
import { authoredCount, groupAuthored } from "./ui/authored";
import { setLogContext } from "./log";
import { unreadAssignment, unreadInInbox } from "./ui/unread";
import { ASK_FILTERS, ASK_VIEWS, matchesAsk, type AskFilter } from "./ui/inboxFilter";
import "./ui/styles/shell.css";
import "./ui/styles/inbox.css";
import "./ui/styles/detail.css";
import "./ui/styles/palette.css";

type Dialog = "settings" | "palette" | "help" | "rules" | null;

const NO_HISTORY: StatusChange[] = [];
const NO_FAILURES: WriteFailure[] = [];

/** Group bars take part in the keyboard selection as "bar:<group>". */
const isBar = (id: string) => id.startsWith("bar:");

/** An item counts as seen once it has been open this long with the window in front, so skimming with the arrow keys or looking away does not. */
const SEEN_AFTER_MS = 2500;

export default function App() {
  const inbox = useInbox();
  // Before any child renders, so every t() call of this render uses the chosen language.
  setLang(inbox.settings.language);
  const [chosen, setChosen] = useState<View>("inbox");
  const views = VIEWS;
  const bucket = chosen;
  const [layout, setLayout] = usePlannedLayout();
  const table = bucket === "assigned" || bucket === "authored" || (bucket === "planned" && layout === "table");
  const [repoFilter, setRepoFilter] = useState<string[]>([]);
  const [kind, setKind] = useState<KindFilter>("all");
  const [ask, setAsk] = useState<AskFilter>("all");
  const [dialog, setDialog] = useState<Dialog>(null);
  /** Selects an item again after its change was undone; set once the selection exists. */
  const reselect = useRef<(id: string) => void>(() => undefined);
  const actions = useStatusActions(inbox.setStatus, inbox.restoreStatus, (id) => inbox.statuses.get(id), (id) => reselect.current(id));
  const columns = useColumnWidths();
  const orca = useOrca();
  const [cloning, setCloning] = useState<ReadonlySet<string>>(() => new Set());
  useTheme(inbox.settings.theme);

  const inRepos = useMemo(() => inbox.classified.filter((c) => repoFilter.length === 0 || repoFilter.includes(c.item.repo)), [inbox.classified, repoFilter]);
  const scoped = useMemo(() => inRepos.filter((c) => kind === "all" || c.item.kind === kind), [inRepos, kind]);
  const inboxAll = useMemo(() => inRepos.filter((c) => c.bucket === "inbox"), [inRepos]);
  // Inbox, Snoozed and Done switch between mentions and reviews instead of Issues/Pull Requests.
  const asking = ASK_VIEWS.includes(bucket);
  const askBase = useMemo(() => (asking ? inRepos.filter((c) => c.bucket === bucket) : []), [asking, inRepos, bucket]);
  const askCounts = useMemo(
    () => Object.fromEntries(ASK_FILTERS.map((f) => [f, askBase.filter((c) => matchesAsk(c, f, inbox.me ?? "")).length])) as Record<AskFilter, number>,
    [askBase, inbox.me],
  );
  const plateAll = useMemo(
    () => groupPlate(scoped, inbox.settings.statusMap, inbox.settings.plateOrder, inbox.me ?? ""),
    [scoped, inbox.settings.statusMap, inbox.settings.plateOrder, inbox.me],
  );
  const setBucket = (view: View) => {
    setChosen(view);
    setAsk("all");
    setKind("all");
    setSearch(null);
    setMarks(new Set());
  };
  // Each table keeps its own sprint filter while the viewer switches views.
  const [sprints, setSprints] = useState<Record<"assigned" | "authored" | "planned", SprintFilter>>({ assigned: "all", authored: "all", planned: "all" });
  // The free-text search over title and number: null while the search bar is closed, else the typed text.
  const [search, setSearch] = useState<string | null>(null);
  const query = search ?? "";
  const searchRef = useRef<HTMLInputElement>(null);
  const hidden = inbox.settings.hiddenBoards;
  const bySprint = useCallback(
    <G extends string>(groups: { group: G; entries: Classified[] }[], filter: SprintFilter, choices: string[]) =>
      filter === "all"
        ? groups
        : groups.map((g) => ({ ...g, entries: g.entries.filter((c) => matchesSprint(c.item, filter, choices, hidden)) })).filter((g) => g.entries.length > 0),
    [hidden],
  );
  const plateSprints = useMemo(() => sprintChoices(plateAll.flatMap((g) => g.entries.map((c) => c.item)), hidden), [plateAll, hidden]);
  const plateNewest = useMemo(() => filterGroups(bySprint(plateAll, sprints.assigned, plateSprints), query), [plateAll, sprints.assigned, plateSprints, bySprint, query]);
  const bars = useCollapsed("assigned-collapsed", ["later", "finished", `inbox:${WAITING_GROUP}`], [`inbox:${WAITING_GROUP}`]);
  const sort = useSortOrders();
  const authoredAll = useMemo(() => groupAuthored(scoped, inbox.me ?? "", sort.of("authored")), [scoped, inbox.me, sort]);
  const authoredSprints = useMemo(() => sprintChoices(authoredAll.flatMap((g) => g.entries.map((c) => c.item)), hidden), [authoredAll, hidden]);
  const authored = useMemo(() => filterGroups(bySprint(authoredAll, sprints.authored, authoredSprints), query), [authoredAll, sprints.authored, authoredSprints, bySprint, query]);
  const plate = useMemo((): { group: TableGroup; entries: Classified[] }[] => {
    const order = sort.of("assigned");
    const byStatus = plateNewest.map((g) => ({ ...g, entries: oriented(g.entries, order) }));
    if (inbox.settings.tableGrouping === "status") return byStatus;
    // What waits and what is finished but open stay at the bottom, in every grouping.
    const parked = byStatus.filter((g) => !isActiveBar(g.group));
    const working = plateNewest.filter((g) => isActiveBar(g.group)).flatMap((g) => g.entries);
    return [...groupByType(working, inbox.settings.statusMap, order, inbox.me ?? ""), ...parked];
  }, [plateNewest, sort, inbox.settings.tableGrouping, inbox.settings.statusMap, inbox.me]);
  const [popup, setPopup] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const hoverActs = inbox.settings.hoverActs;
  useEffect(() => {
    if (!hoverActs) return;
    // mousemove, not mouseover: rows scrolling under a resting pointer must not take the keys.
    const move = (e: MouseEvent) => {
      const row = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-id]") : null;
      setHovered(row?.dataset.id ?? null);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [hoverActs]);
  const me = inbox.me ?? "";
  const unreadInboxIds = useMemo(
    () => new Set(inbox.classified.filter((c) => c.bucket === "inbox" && (inbox.unreadMarks.has(c.item.id) || unreadInInbox(c, inbox.seen, me))).map((c) => c.item.id)),
    [inbox.classified, inbox.seen, inbox.unreadMarks, me],
  );
  /** U: unread as its view counts it, or marked so by hand. */
  const isUnread = (c: Classified) => inbox.unreadMarks.has(c.item.id) || (c.bucket === "inbox" ? unreadInInbox(c, inbox.seen, me) : unreadAssignment(c, inbox.seen, me));
  /** Marks the items read when any is unread, else unread, with undo that restores each item's read state exactly. */
  const toggleRead = (cs: Classified[]) => {
    const read = cs.some(isUnread);
    const before = cs.map((c) => ({ id: c.item.id, seen: inbox.seen.get(c.item.id), mark: inbox.unreadMarks.get(c.item.id) }));
    for (const c of cs) void (read ? inbox.markSeen(c.item.id) : inbox.markUnread(c.item.id));
    const text = cs.length === 1 ? t(read ? "toast.markedRead" : "toast.markedUnread", { number: cs[0].item.number }) : t(read ? "marks.markedRead" : "marks.markedUnread", { count: cs.length });
    actions.announce(
      text,
      () => before.forEach((b) => void inbox.restoreRead(b.id, { seen: b.seen, mark: b.mark })),
      () => cs.forEach((c) => void (read ? inbox.markSeen(c.item.id) : inbox.markUnread(c.item.id))),
    );
  };
  /** The unread assignments that still ask for work: the bars Planned, Later and Done are parked. */
  const unreadPlateIds = useMemo(
    () =>
      new Set(
        groupPlate(inbox.classified, inbox.settings.statusMap, [], me)
          .filter((g) => isActiveBar(g.group))
          .flatMap((g) => g.entries.filter((c) => inbox.unreadMarks.has(c.item.id) || unreadAssignment(c, inbox.seen, me)).map((c) => c.item.id)),
      ),
    [inbox.classified, inbox.seen, inbox.unreadMarks, inbox.settings.statusMap, me],
  );
  /** The items a view's count stands for, whatever filters narrow its list. */
  const itemsOfView = (view: View): Classified[] => {
    if (view === "assigned") return groupPlate(inbox.classified, inbox.settings.statusMap, [], me).filter((g) => isActiveBar(g.group)).flatMap((g) => g.entries);
    if (view === "authored") return groupAuthored(inbox.classified, me).filter((g) => g.group !== "later").flatMap((g) => g.entries);
    if (view === "planned") return inbox.classified.filter((c) => dated(c) !== null);
    return inbox.classified.filter((c) => c.bucket === view);
  };
  const unreadCounts = useMemo(() => ({ inbox: unreadInboxIds.size, assigned: unreadPlateIds.size }), [unreadInboxIds, unreadPlateIds]);
  const movesUp = inbox.settings.movesUp;
  const rowTime = useCallback((c: Classified) => sortTime(c, me, movesUp), [me, movesUp]);
  // Planned lists everything with a date, soonest first; the sort button turns the dated ones around.
  const focus = inbox.settings.focus;
  const plans = inbox.settings.planned;
  // The local date, set with the rollover check rather than read during render; the rows' marks and Today's date follow it.
  const [today, setToday] = useState(localDay);
  const dated = useCallback((c: Classified) => datedOf(c, focus, plans, today), [focus, plans, today]);
  const plannedAll = useMemo(() => scoped.filter((c) => datedOf(c, focus, plans, today) !== null), [scoped, focus, plans, today]);
  const plannedGroups = useMemo(
    () => (bucket === "planned" ? groupBySnoozeEnd(plannedAll.filter((c) => matchesText(c.item, query)), (c) => datedAt(datedOf(c, focus, plans, today)!), (c) => c.statusAt ?? "", sort.of("planned") === "oldest") : []),
    [bucket, plannedAll, query, focus, plans, today, sort],
  );
  // Planned as a table: the day bars, narrowed by its sprint filter like the other tables.
  const plannedSprints = useMemo(() => sprintChoices(plannedAll.map((c) => c.item), hidden), [plannedAll, hidden]);
  const plannedTable = useMemo(
    (): { group: TableGroup; entries: Classified[] }[] => bySprint(plannedGroups.map((g) => ({ group: `day:${g.group}` as TableGroup, entries: g.entries })), sprints.planned, plannedSprints),
    [plannedGroups, bySprint, sprints.planned, plannedSprints],
  );
  const listed = useMemo(
    () =>
      table
        ? []
        : bucket === "planned"
          ? plannedGroups.flatMap((g) => g.entries)
          : oriented(sortByRecency((asking ? askBase.filter((c) => matchesAsk(c, ask, me)) : scoped.filter((c) => c.bucket === bucket)).filter((c) => matchesText(c.item, query)), rowTime), sort.of(bucket)),
    [scoped, askBase, asking, ask, query, me, bucket, table, sort, rowTime, plannedGroups],
  );
  // The follow-ups that left the inbox wait in a bar at its bottom, soonest first, those without a date last.
  const waiting = useMemo(
    () => (bucket === "inbox" ? groupBySnoozeEnd(scoped.filter((c) => c.bucket === "snoozed" && matchesAsk(c, ask, me) && matchesText(c.item, query)), (c) => c.until, (c) => c.statusAt ?? "").flatMap((g) => g.entries) : []),
    [bucket, scoped, ask, me, query],
  );
  const timeGroups = useMemo(() => {
    if (table) return undefined;
    const heading = (group: TimeGroup | SnoozeGroup) => t(`time.group.${group}`);
    if (bucket === "planned") return plannedGroups.map((g) => ({ ...g, heading: heading(g.group) }));
    const bar = waiting.length > 0 ? [{ group: WAITING_GROUP, heading: t("table.later"), entries: waiting }] : [];
    if (inbox.settings.groupByTime) return [...groupByTime(listed, rowTime, sort.of(bucket) === "oldest").map((g) => ({ ...g, heading: heading(g.group) })), ...bar];
    // Without time groups the rows stand under no bar ("") and only the waiting ones under theirs.
    return bar.length > 0 ? [{ group: "", heading: "", entries: listed }, ...bar] : undefined;
  }, [bucket, table, listed, plannedGroups, waiting, inbox.settings.groupByTime, sort, rowTime]);
  // The bars of the current view: status or time bars of the table, or a list's time groups.
  // Lists remember their folded groups per view, so "Today" folded in Done stays open in the inbox.
  const tableGroups = bucket === "assigned" ? plate : bucket === "planned" ? plannedTable : authored;
  const viewGroups: { group: string; entries: Classified[] }[] | undefined = table ? tableGroups : timeGroups;
  const barKey = useCallback((group: string) => (bucket === "assigned" ? group : `${bucket}:${group}`), [bucket]);
  const folded = useCallback((group: string) => bars.collapsed.has(barKey(group)), [bars.collapsed, barKey]);
  const searchCount = useMemo(() => (viewGroups ? viewGroups.reduce((n, g) => n + g.entries.length, 0) : listed.length), [viewGroups, listed]);
  const entries = useMemo(() => (viewGroups ? viewGroups.filter((g) => !folded(g.group)).flatMap((g) => g.entries) : listed), [viewGroups, folded, listed]);
  // Bars take part in the keyboard selection too, as "bar:<group>".
  const ids = useMemo(
    () =>
      viewGroups
        ? viewGroups.flatMap((g) => [...(g.group ? [`bar:${g.group}`] : []), ...(folded(g.group) ? [] : g.entries.map((c) => c.item.id))])
        : entries.map((c) => c.item.id),
    [viewGroups, folded, entries],
  );
  const selection = useSelection(ids, isBar);
  useEffect(() => {
    reselect.current = selection.select;
  });
  // A palette jump lands once the target view has rendered; a folded group around it opens first.
  const [reveal, setReveal] = useState<string | null>(null);
  useEffect(() => {
    if (!reveal) return;
    const group = viewGroups?.find((g) => g.entries.some((c) => c.item.id === reveal))?.group;
    if (group && folded(group)) return bars.toggle(barKey(group));
    if (ids.includes(reveal)) selection.select(reveal);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot: clears the jump target once it has landed or cannot
    setReveal(null);
  }, [reveal, viewGroups, folded, ids, bars, barKey, selection]);
  const selectedBar = selection.selected?.startsWith("bar:") ? (selection.selected.slice(4) as TableGroup) : null;
  const toggleBar = (group: string) => bars.toggle(barKey(group));
  const setBar = (group: string, open: boolean) => folded(group) === open && toggleBar(group);
  /** ← on an item folds its bar and selects it, like a tree in the Finder. */
  const foldCurrent = () => {
    const group = viewGroups?.find((g) => g.entries.some((c) => c.item.id === selection.selected))?.group;
    if (!group) return;
    setBar(group, false);
    selection.select(`bar:${group}`);
  };
  const current = entries.find((c) => c.item.id === selection.selected) ?? null;
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const marked = useMemo(() => markedIn(marks, ids).flatMap((id) => entries.filter((c) => c.item.id === id)), [marks, ids, entries]);
  const clearMarks = () => marks.size > 0 && setMarks(new Set());
  /** ⌘-click toggles an item, ⇧-click marks the range from the selected one; marking starts from the selected item. */
  const mark = (id: string, range: boolean) => {
    const cursor = selection.selected;
    setMarks((m) => {
      const base = m.size === 0 && cursor && !isBar(cursor) && cursor !== id ? new Set([cursor]) : m;
      return range ? markRange(base, ids, cursor, id) : toggleMark(base, id);
    });
    selection.select(id);
  };
  /** ⇧↑/⇧↓: moves the selection and marks everything passed on the way. */
  const extend = (offset: number) => {
    const from = selection.selected;
    const at = from ? ids.indexOf(from) : -1;
    const to = ids[Math.max(0, Math.min(ids.length - 1, at + offset))];
    if (!to) return;
    setMarks((m) => markRange(m, ids, from, to));
    selection.select(to);
  };
  const step = (offset: number) => {
    clearMarks();
    selection.move(offset);
  };
  // Assigned to me keeps its folded bars unprefixed, as stored before other tables existed.
  const tableFolded = useMemo(
    () => (bucket === "assigned" ? bars.collapsed : new Set([...bars.collapsed].filter((k) => k.startsWith(`${bucket}:`)).map((k) => k.slice(bucket.length + 1)))),
    [bars.collapsed, bucket],
  );

  const counts = useMemo(
    () =>
      ({ ...countBy(scoped, (c) => c.bucket), inbox: inboxAll.length, planned: plannedAll.length, assigned: plateCount(plateAll), authored: authoredCount(authoredAll) }) as Record<View, number>,
    [scoped, inboxAll, plannedAll, plateAll, authoredAll],
  );
  // The picked repos narrow the sidebar's counts like the list; the other filters do not.
  const viewCounts = useMemo(() => {
    const all = inRepos;
    return {
      ...countBy(all, (c) => c.bucket),
      inbox: all.filter((c) => c.bucket === "inbox").length,
      planned: all.filter((c) => datedOf(c, focus, plans, today) !== null).length,
      assigned: plateCount(groupPlate(all, inbox.settings.statusMap, [], me)),
      authored: authoredCount(groupAuthored(all, me)),
    } as Record<View, number>;
  }, [inRepos, focus, inbox.settings.statusMap, plans, today, me]);
  const findable = useMemo(() => inbox.classified.filter((c) => viewOf(c, me) !== null), [inbox.classified, me]);
  // The badge says there is something to do again, or still: unread inbox items and unread assignments, marks by hand included.
  const badgeIds = useMemo(() => new Set([...unreadInboxIds, ...unreadPlateIds]), [unreadInboxIds, unreadPlateIds]);
  const repos = useMemo(() => repoList(inbox.classified, me), [inbox.classified, me]);

  const boards = useMemo(() => {
    const byId = new Map<string, { id: string; title: string; values: Set<string> }>();
    for (const b of inbox.classified.flatMap((c) => c.item.boards)) {
      const board = byId.get(b.id) ?? { id: b.id, title: b.title, values: new Set<string>() };
      if (b.status) board.values.add(b.status);
      byId.set(b.id, board);
    }
    return [...byId.values()].map((b) => ({ ...b, values: [...b.values].sort() })).sort((a, b) => a.title.localeCompare(b.title));
  }, [inbox.classified]);

  const attributes = useMemo(
    () => attributeOptions(inbox.classified.map((c) => c.item), inbox.settings.hiddenBoards),
    [inbox.classified, inbox.settings.hiddenBoards],
  );

  const combined = useMemo(
    () => combineAttributes(inbox.settings.tableAttributes, inbox.settings.detailAttributes, attributes),
    [inbox.settings.tableAttributes, inbox.settings.detailAttributes, attributes],
  );
  const detailKeys = useMemo(() => shownKeys(combined, "detail"), [combined]);
  const tableView = bucket === "authored" ? "authored" : bucket === "planned" ? "planned" : "assigned";
  const ownColumns = inbox.settings.tableColumns[tableView];
  const columnKeys = useMemo(() => tableKeys(combined, ownColumns), [combined, ownColumns]);
  // Assigned to me also switches the opening date after the title; Created by me times its rows by it.
  const showOpened = tableView === "assigned" && (ownColumns?.created ?? true);
  const tableColumns = useMemo(
    () => [
      ...(tableView === "assigned" ? [{ key: "created", name: t("attr.created"), shown: showOpened }] : []),
      ...combined.map((a) => {
        const option = attributes.find((o) => o.key === a.key)!;
        const name = option.field ? (option.board ? `${option.name} · ${option.board}` : option.name) : t(`attr.${a.key}` as MessageKey);
        return { key: a.key, name, shown: columnKeys.includes(a.key) };
      }),
    ],
    [combined, attributes, columnKeys, tableView, showOpened],
  );
  const setColumn = (key: string, shown: boolean) =>
    void inbox.updateSettings((s) => ({ ...s, tableColumns: { ...s.tableColumns, [tableView]: { ...s.tableColumns[tableView], [key]: shown } } }));

  const welcome = inbox.ready && inbox.settings.orgs.length === 0;
  const toggleTheme = () => {
    const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    void inbox.saveSettings({ ...inbox.settings, theme: dark ? "light" : "dark" });
  };
  /** Back to every repository, kind, mention and review, sprint and search; the view stays as it is. */
  const resetFilters = () => {
    setRepoFilter([]);
    setKind("all");
    setAsk("all");
    setSprints({ assigned: "all", authored: "all", planned: "all" });
    setSearch(null);
  };
  // With "hoverActs", keys act on the row under the mouse; the arrow keys and an open pop-up hand them back to the selection.
  const hoveredEntry = inbox.settings.hoverActs && !(popup && table) && hovered ? entries.find((c) => c.item.id === hovered) : undefined;
  const target = hoveredEntry ?? current;
  const withCurrent = (fn: (c: Classified) => void) => () => target && fn(target);

  const pinnable = isPinnable;
  const toggleFocus = (c: Classified) => {
    const focus = inbox.settings.focus.filter((id) => inbox.classified.some((e) => e.item.id === id && pinnable(e)));
    const on = focus.includes(c.item.id);
    if (!on && focus.length >= FOCUS_MAX) return actions.notify(t("focus.full"));
    const previous = todayOf(inbox.settings);
    const next: Today = {
      focus: on ? focus.filter((id) => id !== c.item.id) : [...focus, c.item.id],
      focusDay: localDay(),
      planned: setPlan(inbox.settings.planned, c.item.id, null),
      pinnedOn: on ? without(inbox.settings.pinnedOn, c.item.id) : { ...inbox.settings.pinnedOn, [c.item.id]: localDay() },
      plannedAt: on ? without(inbox.settings.plannedAt, c.item.id) : { ...inbox.settings.plannedAt, [c.item.id]: new Date().toISOString() },
    };
    const steps = [todayStep(previous, next), ...(on ? [] : followUpEnds(c))];
    for (const s of steps) s.run();
    actions.announce(
      on ? t("focus.removed", { number: c.item.number }) : replacing(t("focus.added", { number: c.item.number }), endedFollowUp(c)),
      () => steps.forEach((s) => s.undo()),
      () => steps.forEach((s) => s.run()),
    );
  };
  /** A change of Today as a step: the settings go from `previous` to `next` and back. */
  const todayStep = (previous: Today, next: Today) => ({ run: () => void inbox.updateSettings((s) => ({ ...s, ...next })), undo: () => void inbox.updateSettings((s) => ({ ...s, ...previous })) });
  /** An item has one "when": a plan or Today pin on a follow-up ends it, as a step; none when there is no follow-up. */
  const followUpEnds = (c: Classified) => (c.status === "snoozed" ? [followUpStep(c)] : []);
  /** What a plan or pin ends for the toast: the item's follow-up, with its date when it has one. */
  const endedFollowUp = (c: Classified) => (c.status !== "snoozed" ? null : c.until ? t("replaced.followUpAt", { until: untilText(c.until) }) : t("replaced.followUp"));
  /** What a follow-up ends for the toast: the item's Today pin or its plan. */
  const endedPlan = (c: Classified) => {
    const when = dated(c);
    return when?.kind === "today" ? t("replaced.today") : when?.kind === "planned" ? t("replaced.plan", { day: dayShort(when.day) }) : null;
  };
  /** A toast that also names the "when" the change replaced, so ⌘Z is one look away. */
  const replacing = (toast: string, replaced: string | null) => (replaced ? t("replaced.toast", { toast, replaced }) : toast);

  /** Plans an item for `day`, or takes the plan off with null; a plan takes it out of Today and ends its follow-up. */
  const planFor = (c: Classified, day: string | null, text: string) => {
    const previous = todayOf(inbox.settings);
    const next: Today = {
      focus: inbox.settings.focus.filter((id) => id !== c.item.id),
      focusDay: inbox.settings.focusDay,
      planned: setPlan(inbox.settings.planned, c.item.id, day),
      pinnedOn: without(inbox.settings.pinnedOn, c.item.id),
      plannedAt: day ? { ...inbox.settings.plannedAt, [c.item.id]: new Date().toISOString() } : without(inbox.settings.plannedAt, c.item.id),
    };
    const steps = [todayStep(previous, next), ...(day ? followUpEnds(c) : [])];
    for (const s of steps) s.run();
    actions.announce(
      day ? replacing(t("plan.added", { number: c.item.number, day: text }), endedFollowUp(c)) : t("plan.removed", { number: c.item.number }),
      () => steps.forEach((s) => s.undo()),
      () => steps.forEach((s) => s.run()),
    );
  };
  /** The days Plan and Follow-up both offer, under the same keys; `chosen` is checked, `pick` gets the day and its name. */
  const dayEntries = (pick: (day: string, text: string) => void, chosen?: string): MenuEntry[] =>
    dayChoices().map((choice) => ({ label: choiceText(choice), keys: choiceKey(choice), checked: choice.day === chosen, onSelect: () => pick(choice.day, choiceText(choice)) }));
  /** Keeps a plan through a new ask: the ask counts as seen, as when planned again, and the item leaves the inbox. */
  const keepPlan = (c: Classified, day: string) => {
    const previous = todayOf(inbox.settings);
    bulk(t("plan.kept", { number: c.item.number, day }), [todayStep(previous, { ...previous, plannedAt: { ...previous.plannedAt, [c.item.id]: new Date().toISOString() } })]);
  };
  /** The plan choices: "Keep plan" while a new ask shows a planned item in the inbox, Today (T), the days, a picked date and, with a plan, its removal (X). */
  const planEntries = (c: Classified): MenuEntry[] => {
    const day = inbox.settings.planned.find((p) => p.id === c.item.id)?.day;
    const when = dated(c);
    const kept = when && c.bucket === "inbox" ? datedText(when).text : null;
    return [
      ...(kept ? [{ label: t("plan.keep", { day: kept }), keys: "K", onSelect: () => keepPlan(c, kept) }] : []),
      { label: t("menu.today"), keys: "T", checked: inbox.settings.focus.includes(c.item.id), divided: !!kept, onSelect: () => toggleFocus(c) },
      ...dayEntries((d, text) => planFor(c, d, text), day).map((e, i) => (i === 0 ? { ...e, divided: true } : e)),
      { label: t("snooze.pick"), keys: "D", divided: true, checked: !!day && !dayChoices().some((choice) => choice.day === day), onSelect: () => setPickingDate({ day: true, pick: (at) => planFor(c, localDay(new Date(at)), dayShort(localDay(new Date(at)))) }) },
      ...(when ? [{ label: t("plan.remove"), keys: "X", onSelect: () => planFor(c, null, "") }] : []),
    ];
  };
  /** P on an item: the plan choices open in the middle of the pane, like the follow-up ones, or below the detail's Plan button. */
  const plan = (c: Classified, at?: DOMRect) =>
    pinnable(c) ? setMenu({ entries: planEntries(c), ...(at ? { x: at.left, y: at.bottom + 4 } : { ...paneCenter(), centered: true }) }) : actions.notify(t("noop.notPlannable", { number: c.item.number }));

  /** Stops tracking an item for good, with undo; the settings list it for tracking again. */
  const untrack = (c: Classified) => {
    const entry = { id: c.item.id, repo: c.item.repo, number: c.item.number, title: c.item.title, url: c.item.url, at: new Date().toISOString() };
    void inbox.updateSettings((s) => ({ ...s, untracked: [...s.untracked, entry] }));
    actions.announce(
      t("untrack.done", { number: c.item.number }),
      () => void inbox.updateSettings((s) => ({ ...s, untracked: s.untracked.filter((u) => u.id !== entry.id) })),
      () => void inbox.updateSettings((s) => ({ ...s, untracked: s.untracked.some((u) => u.id === entry.id) ? s.untracked : [...s.untracked, entry] })),
    );
  };

  /** Swaps real and demo data: remembered for this window, then the app starts over on the other. */
  const switchDemo = () => {
    rememberDemo(!isDemo());
    window.location.reload();
  };
  const [menu, setMenu] = useState<{ entries: MenuEntry[]; x: number; y: number; centered?: boolean } | null>(null);
  const [snoozeMenu, setSnoozeMenu] = useState<{ entry: Classified; x: number; y: number; centered?: boolean } | null>(null);
  const [pickingDate, setPickingDate] = useState<{ pick: (until: string) => void; day?: boolean } | null>(null);
  /** Runs one change on several items, with one toast and one undo for all of them. */
  const bulk = (text: string, steps: { run: () => void; undo: () => void }[]) => {
    if (steps.length === 0) return;
    for (const s of steps) s.run();
    actions.announce(
      text,
      () => steps.forEach((s) => s.undo()),
      () => steps.forEach((s) => s.run()),
    );
    clearMarks();
  };
  const statusStep = (c: Classified, status: Status, until?: string) => {
    const previous = inbox.statuses.get(c.item.id);
    return { run: () => void inbox.setStatus(c.item.id, status, until ? { until } : {}), undo: () => void inbox.restoreStatus(c.item.id, previous) };
  };
  const open = marked.filter((c) => !c.item.closed);
  /** What D or O chooses for one item, as a step with an exact undo; null where it would change nothing, as for a single item. */
  const planStep = (c: Classified, status: Status) => {
    const plan = planStatus(c, status, me);
    const previous = inbox.statuses.get(c.item.id);
    const undo = () => void inbox.restoreStatus(c.item.id, previous);
    switch (plan.do) {
      case "resume":
      case "clear":
        return { run: () => void inbox.clearStatus(c.item.id), undo };
      case "blocked":
        return null;
      case "tick-update":
      case "hand-off":
        return { run: () => void inbox.setStatus(c.item.id, "done", { handoff: snapshotOf(c.item) }), undo };
      case "set":
        return c.status === plan.status ? null : { run: () => void inbox.setStatus(c.item.id, plan.status), undo };
      case "none":
        return null;
    }
  };
  /** D or O on the marked items, each as it would be for the item alone (my part done, ticking off an update, back in the work). */
  const bulkStatus = (status: Status) => {
    const filed = open.filter((c) => planStep(c, status) !== null);
    const steps = [...filed.map((c) => planStep(c, status)!), ...(status === "done" ? unplanStep(filed) : [])];
    const blocked = open.filter((c) => planStatus(c, status, me).do === "blocked").length;
    if (steps.length === 0) return blocked > 0 ? actions.notify(t("marks.blocked", { count: blocked })) : undefined;
    const text = plural("marks.toastOne", "marks.toast", filed.length, { status: t(`status.${status}`) });
    bulk(blocked > 0 ? `${text} · ${t("marks.blocked", { count: blocked })}` : text, steps);
  };
  /** The text for one item or for several: `one` takes no count. */
  const plural = (one: MessageKey, many: MessageKey, count: number, params: Record<string, string | number> = {}) => t(count === 1 ? one : many, { count, ...params });
  const hasFollowUp = (c: Classified) => c.status === "snoozed";
  /** Takes the follow-up off an item, as if never set; undo puts back exactly what was stored. */
  const followUpStep = (c: Classified) => {
    const previous = inbox.statuses.get(c.item.id);
    return { run: () => void inbox.clearStatus(c.item.id), undo: () => void inbox.restoreStatus(c.item.id, previous) };
  };
  const removeFollowUp = (c: Classified) => bulk(t("toast.reminderRemoved", { number: c.item.number }), [followUpStep(c)]);
  /** X on one item: its plan or Today pin goes, else its follow-up. */
  const removeWhen = (c: Classified) =>
    dated(c) ? planFor(c, null, "") : hasFollowUp(c) ? removeFollowUp(c) : actions.notify(t("noop.noFollowUp", { number: c.item.number }));
  /** X on the marked items: every plan, Today pin and follow-up among them goes. */
  const removeMarkedFollowUps = () => {
    const waiting = marked.filter(hasFollowUp);
    const unplanned = marked.filter((c) => dated(c) !== null);
    const count = waiting.length + unplanned.length;
    const text = unplanned.length > 0 ? plural("marks.whenRemovedOne", "marks.whenRemoved", count) : plural("marks.reminderRemovedOne", "marks.reminderRemoved", count);
    bulk(text, [...waiting.map(followUpStep), ...unplanStep(unplanned)]);
  };
  /** Takes the plan or Today pin off the items that have one, as one step for all of them; none when none has. */
  const unplanStep = (cs: Classified[]) => {
    const { focus, planned } = inbox.settings;
    const ids = cs.map((c) => c.item.id).filter((id) => focus.includes(id) || planned.some((p) => p.id === id));
    return ids.length > 0 ? [todayStep(todayOf(inbox.settings), unplan(todayOf(inbox.settings), ids))] : [];
  };
  /** A time for the marked items: they wait until then. */
  const bulkLater = (until: string) => bulk(plural("marks.laterOne", "marks.later", open.length, { until: untilText(until) }), [...open.map((c) => statusStep(c, "snoozed", until)), ...unplanStep(open)]);
  const bulkTimes = (): MenuEntry[] => [
    ...dayEntries((day) => bulkLater(followUpOn(day, inbox.settings.followUpTime))),
    { label: t("snooze.pick"), keys: "D", divided: true, onSelect: () => setPickingDate({ pick: bulkLater }) },
    { label: t("snooze.none"), keys: "F", onSelect: () => bulk(plural("marks.toastOne", "marks.toast", open.length, { status: t("status.snoozed") }), [...open.map((c) => statusStep(c, "snoozed")), ...unplanStep(open)]) },
    ...(marked.some(hasFollowUp) ? [{ label: t("reminder.remove"), keys: "X", divided: true, onSelect: removeMarkedFollowUps }] : []),
  ];
  /** The context menu while several items are marked: what applies to all of them. */
  const bulkEntries = (): MenuEntry[] => [
    { label: t("status.done"), keys: "D", icon: <StatusIcon status="done" size={14} />, onSelect: () => bulkStatus("done") },
    { label: t("status.open"), keys: "O", icon: <StatusIcon status="open" size={14} />, onSelect: () => bulkStatus("open") },
    { label: t("status.snoozed"), keys: "F", icon: <Bell size={14} />, items: bulkTimes() },
    ...(open.some(assignable) ? [{ label: t("assign.action"), keys: "⌃A", icon: <UserPlus size={14} />, divided: true, onSelect: () => (assignAll(open), clearMarks()) }] : []),
    ...(open.some(leavable) ? [{ label: t("unassign.action"), keys: "⌃U", icon: <UserMinus size={14} />, onSelect: () => (leaveAll(open), clearMarks()) }] : []),
    ...(marked.some(hasFollowUp) || marked.some((c) => dated(c) !== null) ? [{ label: t(marked.some(hasFollowUp) ? "reminder.remove" : "plan.remove"), keys: "X", icon: <X size={14} />, onSelect: removeMarkedFollowUps }] : []),
    { label: marked.some(isUnread) ? t("menu.markRead") : t("menu.markUnread"), keys: "R", icon: marked.some(isUnread) ? <MailOpen size={14} /> : <Mail size={14} />, onSelect: () => (toggleRead(marked), clearMarks()) },
    { label: t("marks.clear"), divided: true, onSelect: () => setMarks(new Set()) },
  ];
  const refreshView = async (items: Classified[]) => {
    actions.notify(t("view.refreshing", { count: items.length }));
    const found = await inbox.reloadItems(items.map((c) => c.item.id));
    actions.notify(t("view.refreshed", { count: found }));
  };
  /** Right click on a view in the sidebar: what applies to all of its items. */
  const openViewMenu = (view: View, e: React.MouseEvent) => {
    const items = itemsOfView(view);
    if (items.length === 0) return;
    e.preventDefault();
    const anyUnread = items.some(isUnread);
    const reading = view === "inbox" || view === "assigned";
    setMenu({
      entries: [
        ...(reading ? [{ label: t(anyUnread ? "view.markAllRead" : "view.markAllUnread"), icon: anyUnread ? <MailOpen size={14} /> : <Mail size={14} />, onSelect: () => toggleRead(items) }] : []),
        { label: t("view.refresh"), icon: <RefreshCw size={14} />, onSelect: () => void refreshView(inbox.settings.refreshInRepos && repoFilter.length > 0 ? items.filter((c) => repoFilter.includes(c.item.repo)) : items) },
      ],
      x: e.clientX,
      y: e.clientY,
    });
  };
  /** Right click on a repo in the sidebar: all updates, or only what is addressed to the viewer. */
  const openRepoMenu = (repo: string, e: React.MouseEvent) => {
    e.preventDefault();
    const scopes = inbox.settings.directOnly;
    const on = covers(repo, scopes);
    setMenu({
      entries: [
        { label: t("sidebar.allUpdates"), icon: <Bell size={14} />, checked: !on, onSelect: () => void inbox.saveSettings({ ...inbox.settings, directOnly: setCovered(repo, scopes, false) }) },
        { label: t("sidebar.directOnly"), icon: <UserCheck size={14} />, checked: on, onSelect: () => void inbox.saveSettings({ ...inbox.settings, directOnly: setCovered(repo, scopes, true) }) },
      ],
      x: e.clientX,
      y: e.clientY,
    });
  };
  const openBulkTimes = () => setMenu({ entries: bulkTimes(), ...paneCenter(), centered: true });
  /**
   * A status chosen for an item. "Done" means more where it has more to end: an update is
   * ticked off with a fresh snapshot; an assignment of the table becomes
   * "my part done", which follows its updates. "Open" on that takes it back into the work.
   */
  const applyStatus = (c: Classified, status: Status) => {
    const { id, number } = c.item;
    const ends = status === "done" ? unplanStep([c]) : [];
    const step = ends.length > 0 ? planStep(c, status) : null;
    if (step) return bulk(replacing(`#${number} → ${t("status.done")}`, endedPlan(c)), [step, ...ends]);
    const previous = inbox.statuses.get(id);
    const undo = () => void inbox.restoreStatus(id, previous);
    const plan = planStatus(c, status, me);
    const handoff = { handoff: snapshotOf(c.item) };
    const hand = () => void inbox.setStatus(id, "done", handoff);
    switch (plan.do) {
      case "resume":
        void inbox.clearStatus(id);
        return actions.announce(t("toast.resumed", { number }), undo, () => void inbox.clearStatus(id));
      case "tick-update":
        hand();
        return actions.announce(t("toast.updateDone", { number }), undo, hand);
      case "hand-off":
        hand();
        return actions.announce(t("toast.handedOff", { number }), undo, hand);
      case "clear":
        void inbox.clearStatus(id);
        return actions.announce(t("toast.filed", { number }), undo, () => void inbox.clearStatus(id));
      case "blocked":
        return actions.notify(t("done.blocked", { number }));
      case "set":
        return actions.apply(c, plan.status);
      case "none":
        return;
    }
  };
  /** A follow-up for one item, with or without a date; its plan or Today pin goes with it, since an item has one "when". */
  const followUp = (c: Classified, until: string) => {
    const steps = unplanStep([c]);
    if (steps.length === 0) return actions.apply(c, "snoozed", until);
    if (c.item.closed) return actions.notify(t("closed.noStatus", { number: c.item.number }));
    steps.push(statusStep(c, "snoozed", until));
    for (const s of steps) s.run();
    actions.announce(
      replacing(until ? t("toast.snoozedUntil", { number: c.item.number, until: untilText(until) }) : t("toast.snoozed", { number: c.item.number }), endedPlan(c)),
      () => steps.forEach((s) => s.undo()),
      () => steps.forEach((s) => s.run()),
    );
  };
  /** The follow-up choices for one item: the days of Plan at the "followUpTime", a picked date, none, and its removal (X). */
  const snoozeEntries = (c: Classified): MenuEntry[] => [
    ...dayEntries((day) => followUp(c, followUpOn(day, inbox.settings.followUpTime)), c.status === "snoozed" && c.until ? localDay(new Date(c.until)) : undefined),
    { label: t("snooze.pick"), keys: "D", divided: true, onSelect: () => setPickingDate({ pick: (until) => followUp(c, until) }) },
    { label: t("snooze.none"), keys: "F", checked: c.status === "snoozed" && !c.until, onSelect: () => followUp(c, "") },
    ...(hasFollowUp(c) ? [{ label: t("reminder.remove"), keys: "X", divided: true, onSelect: () => removeFollowUp(c) }] : []),
  ];
  /** S on an item: the follow-up choices open in the middle of the detail, also to move the date. */
  const snooze = (c: Classified) => {
    if (c.item.closed) return actions.apply(c, "snoozed");
    setSnoozeMenu({ entry: c, ...paneCenter(), centered: true });
  };
  /** Right click: the marked items' menu on a marked row, else the row's own (which clears the marks). */
  const openMenu = (entry: Classified, e: React.MouseEvent) => {
    e.preventDefault();
    const several = marks.has(entry.item.id) && marked.length > 1;
    if (!several) clearMarks();
    selection.select(entry.item.id);
    setMenu({ entries: several ? bulkEntries() : menuEntries(entry), x: e.clientX, y: e.clientY });
  };
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => actions.notify(t("menu.copied")),
      () => actions.notify(t("menu.copyFailed")),
    );
  const [reloading, setReloading] = useState<string | null>(null);
  const assignable = (c: Classified) => !c.item.closed && !c.item.assignees.some((a) => sameLogin(a, me));
  /**
   * Adds the viewer to the items' assignees: at once here, which moves them into Assigned to me,
   * and then on GitHub, queued one after another; GitHub's assignees replace the local guess. A
   * failure puts that item back where it was and says so.
   */
  const assignAll = (entries: Classified[], quiet = false) => {
    const due = entries.filter(assignable);
    if (due.length === 0) return quiet ? undefined : actions.notify(t("assign.nothing"));
    const text = due.length === 1 ? t("assign.done", { number: due[0].item.number }) : t("assign.doneMany", { count: due.length });
    const ids = due.map((c) => c.item.id);
    // Undo leaves again, on GitHub too, through the same queue and with the same rollback.
    if (quiet) actions.notify(text);
    else
      actions.announce(
        text,
        () => ids.forEach((id) => classifiedById(id) && leave(classifiedById(id)!, true)),
        () => ids.forEach((id) => classifiedById(id) && assignAll([classifiedById(id)!], true)),
      );
    for (const c of due) {
      const { id, number, assignees, reasons, activities } = c.item;
      inbox.updateItem(id, (item) => withSelfAssigned(item, me, new Date().toISOString()));
      void queueWrite(() =>
        ghToken()
          .then((token) => assignSelf(token, id))
          .then(
            (fresh) => inbox.updateItem(id, (item) => withAssignees(item, fresh, me)),
            (e) => {
              inbox.updateItem(id, (item) => ({ ...item, assignees, reasons, activities }));
              void inbox.logWriteFailure(id, "assign", String(e));
              actions.notify(t("assign.failed", { number, error: String(e) }));
            },
          ),
      );
    }
  };
  const assignMe = (c: Classified) => assignAll([c]);
  /** The item as classified right now; an undo that runs later must not see the list of the render that made it. */
  const classifiedById = (id: string) => inbox.classifiedNow().find((e) => e.item.id === id);
  const leavable = (c: Classified) => !c.item.closed && c.item.assignees.some((a) => sameLogin(a, me));
  /**
   * ⌃U: the viewer's part is done and they leave the assignees, here at once and then on GitHub,
   * queued. The item then sorts like any other they are not assigned to: nowhere, until a mention.
   * A failure puts them back as assignee, with the status they had, and says so.
   */
  const leave = (c: Classified, quiet = false) => {
    if (!leavable(c)) return quiet ? undefined : actions.notify(t("unassign.nothing"));
    const { id, number, assignees, reasons, activities } = c.item;
    const previous = inbox.statuses.get(id);
    if (previous) void inbox.clearStatus(id);
    const at = new Date().toISOString();
    inbox.updateItem(id, (item) => ({
      ...item,
      assignees: item.assignees.filter((a) => !sameLogin(a, me)),
      reasons: item.reasons.filter((r) => r !== "assigned"),
      activities: [...item.activities, { kind: "unassigned", at, actor: me, assignee: me }],
    }));
    const text = t("unassign.done", { number });
    if (quiet) actions.notify(text);
    else
      actions.announce(
        text,
        () => {
          if (previous) void inbox.restoreStatus(id, previous);
          const now = classifiedById(id);
          if (now) assignAll([now], true);
        },
        () => {
          const now = classifiedById(id);
          if (now) leave(now, true);
        },
      );
    void queueWrite(() =>
      ghToken()
        .then((token) => unassignSelf(token, id))
        .then(
          (fresh) => inbox.updateItem(id, (item) => withAssignees(item, fresh, me)),
          (e) => {
            inbox.updateItem(id, (item) => ({ ...item, assignees, reasons, activities }));
            if (previous) void inbox.restoreStatus(id, previous);
            void inbox.logWriteFailure(id, "unassign", String(e));
            actions.notify(t("unassign.failed", { number, error: String(e) }));
          },
        ),
    );
  };
  /** ⌃U on the marked items: the viewer leaves all of them, with one toast and one undo for the lot. */
  const leaveAll = (entries: Classified[]) => {
    const due = entries.filter(leavable);
    if (due.length <= 1) return due.length === 1 ? leave(due[0]) : actions.notify(t("unassign.nothing"));
    const ids = due.map((c) => c.item.id);
    const before = new Map(ids.map((id) => [id, inbox.statuses.get(id)]));
    for (const c of due) leave(c, true);
    actions.announce(
      t("unassign.doneMany", { count: due.length }),
      () => {
        ids.forEach((id) => before.get(id) && void inbox.restoreStatus(id, before.get(id)));
        assignAll(ids.flatMap((id) => classifiedById(id) ?? []), true);
      },
      () => ids.forEach((id) => classifiedById(id) && leave(classifiedById(id)!, true)),
    );
  };
  /** After a comment, close or reopen went to GitHub: load the item again; a close or reopen can be undone with the opposite write. */
  const replied = (id: string, change?: StateWrite) => {
    void inbox.reloadItem(id);
    const c = classifiedById(id);
    if (!change || !c) return;
    const reverse = change.action === "close" ? "reopen" : "close";
    const write = (action: "close" | "reopen", reason?: CloseReason) => () =>
      void queueWrite(() =>
        ghToken()
          .then((token) => setOpen(token, { id, kind: c.item.kind }, action, reason))
          .then(() => inbox.reloadItem(id))
          .catch((e: unknown) => actions.notify(String(e))),
      );
    actions.announce(t(change.action === "close" ? "toast.closed" : "toast.reopened", { number: c.item.number }), write(reverse, change.before), write(change.action, change.reason));
  };
  const openOrca = (c: Classified, repoId: string) => {
    const { number } = c.item;
    actions.notify(t("orca.opening", { number }));
    void openInOrca(repoId, c.item)
      .then((outcome) => actions.notify(t(outcome === "created" ? "orca.created" : "orca.revealed", { number })))
      .catch((e: unknown) => actions.notify(t("orca.failed", { number, error: e instanceof Error ? e.message : String(e) })));
  };
  /** Where a repo Orca lacks is looked for and cloned: the setting, else where most of Orca's repos sit. */
  const repoFolder = inbox.settings.repoFolder.trim() || orca.home;
  /** Whether "Open in Orca" is offered: Orca has the repo, or runs and there is a folder to bring it in from. */
  const orcaOffered = (c: Classified) => !!orca.repoOf(c.item.repo) || (orca.available && !!repoFolder);
  /** Opens an item in Orca, cloning its repo into Orca first when Orca lacks it (see `addToOrca`); once per repo at a time. */
  const runOrca = (c: Classified) => {
    const { number, repo } = c.item;
    const repoId = orca.repoOf(repo);
    if (repoId) return openOrca(c, repoId);
    if (!orca.available || !repoFolder) return actions.notify(t("noop.noOrca", { number, repo }));
    if (cloning.has(repo)) return actions.notify(t("orca.stillAdding", { repo }));
    setCloning((now) => new Set([...now, repo]));
    actions.notify(t("orca.adding", { number, repo, home: pathText(repoFolder) }));
    void addToOrca(repo, repoFolder)
      .then(({ id }) => (orca.reload(), openOrca(c, id)))
      .catch((e: unknown) => actions.notify(t("orca.failed", { number, error: e instanceof Error ? e.message : String(e) })))
      .finally(() => setCloning((now) => new Set([...now].filter((r) => r !== repo))));
  };
  /** The tooltip line for an item whose repo Orca lacks: where it comes from. */
  const orcaHint = (c: Classified) => (orcaOffered(c) && repoFolder && !orca.repoOf(c.item.repo) ? t("orca.addHint", { repo: c.item.repo, home: pathText(repoFolder) }) : undefined);
  const reloadCurrent = (c: Classified) => {
    setReloading(c.item.id);
    void inbox.reloadItem(c.item.id).finally(() => setReloading(null));
  };
  /** The context menu of one item: the controls it has elsewhere, under the same shortcuts. */
  const menuEntries = (c: Classified): MenuEntry[] => {
    const { item } = c;
    const planned = dated(c) !== null;
    const statuses: MenuEntry[] = statusesFor(c).map((s) => ({
      label: s.id === "done" && onPlate(c, me) && !c.updates ? t("action.handOff") : s.title,
      keys: s.key,
      icon: <StatusIcon status={s.id} size={14} />,
      checked: c.status === s.id && !(planned && s.id === "open"),
      onSelect: () => applyStatus(c, s.id),
      // Snoozing offers its dates as a submenu, also to change the date; "Open" brings it back.
      ...(s.id === "snoozed" && { items: snoozeEntries(c) }),
    }));
    const planItem: MenuEntry[] = pinnable(c) ? [{ label: t("menu.plan"), keys: "P", icon: <CalendarDays size={14} />, checked: planned, items: planEntries(c) }] : [];
    return [
      ...statuses.slice(0, 1),
      ...planItem,
      ...statuses.slice(1),
      ...(leavable(c) ? [{ label: t("unassign.action"), keys: "⌃U", icon: <UserMinus size={14} />, onSelect: () => leave(c) }] : []),
      ...(hasFollowUp(c) ? [{ label: t("reminder.remove"), keys: "X", icon: <X size={14} />, onSelect: () => removeFollowUp(c) }] : []),
      ...(planned ? [{ label: t("plan.remove"), keys: "X", icon: <X size={14} />, onSelect: () => planFor(c, null, "") }] : []),
      { label: t(isUnread(c) ? "menu.markRead" : "menu.markUnread"), keys: "R", icon: isUnread(c) ? <MailOpen size={14} /> : <Mail size={14} />, onSelect: () => toggleRead([c]) },
      ...(assignable(c) ? [{ label: t("assign.action"), keys: "⌃A", icon: <UserPlus size={14} />, divided: true, onSelect: () => assignMe(c) }] : []),
      { label: t("action.openOnGitHub"), keys: "⌃O", icon: <ExternalLink size={14} />, divided: !assignable(c), onSelect: () => void openUrl(item.url) },
      ...(orcaOffered(c) ? [{ label: t(orca.repoOf(item.repo) ? "orca.open" : "orca.addOpen"), keys: "W", icon: <OrcaMark size={16} />, onSelect: () => runOrca(c) }] : []),
      { label: t("menu.copyLink"), keys: "C", icon: <Link size={14} />, onSelect: () => void copy(itemLink(item, "url")) },
      { label: t("menu.copyRef"), icon: <Hash size={14} />, onSelect: () => void copy(itemLink(item, "ref")) },
      { label: t("menu.copyMarkdown"), icon: <Code size={14} />, onSelect: () => void copy(itemLink(item, "markdown")) },
      { label: t("action.refreshItem"), keys: "⌃R", icon: <RefreshCw size={14} />, divided: true, onSelect: () => reloadCurrent(c) },
      // Out of the way in a submenu, so it is not hit by accident; ⌘Z still takes it back.
      { label: t("menu.more"), icon: <Ellipsis size={14} />, items: [{ label: t("untrack.action"), onSelect: () => untrack(c) }] },
    ];
  };

  // Each morning "Today" keeps what is unfinished and takes in what was planned for it: checked on start and every few minutes while the app stays open.
  // A plan of an item closed on GitHub goes at once, not with the next day.
  const { settings, saveSettings, ready, classified } = inbox;
  useEffect(() => {
    if (!ready) return;
    const check = () => {
      const day = localDay();
      setToday(day);
      const pinnable = (id: string) => classified.some((c) => c.item.id === id && isPinnable(c));
      const closed = [...settings.focus, ...settings.planned.map((p) => p.id)].filter((id) => classified.some((c) => c.item.id === id && c.item.closed));
      const open = closed.length > 0 ? { ...settings, ...unplan(todayOf(settings), closed) } : settings;
      const next = rollOver(open, day, pinnable, (id) => classified.some((c) => c.item.id === id));
      if (next || open !== settings) void saveSettings({ ...open, ...next });
    };
    check();
    const timer = window.setInterval(check, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [ready, settings, saveSettings, classified, me]);

  const showPopup = popup && table && current !== null;
  useEffect(() => setLogContext({ view: bucket, popup: showPopup }), [bucket, showPopup]);
  const openedId = current?.item.id;
  const openedUpdatedAt = current?.item.updatedAt;
  const markSeen = inbox.markSeen;
  const windowFocused = useWindowFocus();
  useEffect(() => {
    if (!openedId || !windowFocused) return;
    const openedAt = new Date().toISOString();
    const timer = window.setTimeout(() => void markSeen(openedId, openedAt), SEEN_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [openedId, openedUpdatedAt, windowFocused, markSeen]);

  /** G: Assigned to me switches between type and status bars, the lists between time groups and none. */
  const toggleGrouping = () => {
    if (!table) void saveSettings({ ...settings, groupByTime: !settings.groupByTime });
    else if (bucket === "assigned") void saveSettings({ ...settings, tableGrouping: settings.tableGrouping === "status" ? "type" : "status" });
  };

  useHotkeys(
    {
      ArrowDown: (e) => (setHovered(null), e.shiftKey ? extend(1) : step(1)),
      ArrowUp: (e) => (setHovered(null), e.shiftKey ? extend(-1) : step(-1)),
      // With items marked, D, O, F, X, U, R, ⌃A and ⌃U act on all of them.
      d: marked.length > 0 ? () => bulkStatus("done") : withCurrent((c) => applyStatus(c, "done")),
      f: marked.length > 0 ? openBulkTimes : withCurrent(snooze),
      o: marked.length > 0 ? () => bulkStatus("open") : withCurrent((c) => applyStatus(c, "open")),
      x: marked.length > 0 ? removeMarkedFollowUps : withCurrent(removeWhen),
      t: withCurrent((c) => (pinnable(c) ? toggleFocus(c) : actions.notify(t("noop.notPinnable", { number: c.item.number })))),
      p: withCurrent(plan),
      u: marked.length > 0 ? () => toggleRead(marked) : withCurrent((c) => toggleRead([c])),
      r: marked.length > 0 ? () => toggleRead(marked) : withCurrent((c) => toggleRead([c])),
      "mod+z": actions.undo,
      "mod+y": actions.redo,
      "ctrl+o": withCurrent((c) => void openUrl(c.item.url)),
      w: withCurrent(runOrca),
      "ctrl+a": marked.length > 0 ? () => (assignAll(open), clearMarks()) : withCurrent(assignMe),
      "ctrl+u": marked.length > 0 ? () => (leaveAll(open), clearMarks()) : withCurrent((c) => leave(c)),
      c: withCurrent((c) => void copy(itemLink(c.item, "url"))),
      // Closes and clears, innermost first; filters and the view stay (they reset from the palette).
      Escape: () => (showPopup ? setPopup(false) : search !== null ? setSearch(null) : marks.size > 0 ? setMarks(new Set()) : selection.select(null)),
      Enter: () => (selectedBar ? toggleBar(selectedBar) : table && current && setPopup(true)),
      " ": () => (selectedBar ? toggleBar(selectedBar) : table && current && setPopup(!popup)),
      ArrowRight: () => selectedBar && setBar(selectedBar, true),
      ArrowLeft: () => (selectedBar ? setBar(selectedBar, false) : !showPopup && foldCurrent()),
      // Switches of the app, not of an item, so they go with ⌘.
      "mod+t": () => (asking && !table ? setAsk((f) => nextOf(ASK_FILTERS, f)) : setKind((k) => nextOf(KINDS.map((o) => o.id), k))),
      "mod+g": toggleGrouping,
      // The selected item alone, as #17 decided; with nothing selected, everything, as before.
      "ctrl+r": withCurrent(reloadCurrent),
      "mod+r": () => void inbox.refresh(),
      "mod+,": () => setDialog("settings"),
      "mod+k": () => setDialog("palette"),
      "mod+f": () => {
        if (!searchRef.current) return setSearch("");
        searchRef.current.focus();
        searchRef.current.select();
      },
      "?": () => setDialog("help"),
      ...Object.fromEntries(views.map((b, i) => [String(i + 1), () => setBucket(b.id)])),
    },
    dialog === null && !welcome,
  );

  /** Shows an item in its view with every filter cleared, so it cannot be hidden by one. */
  const jumpTo = (c: Classified) => {
    setRepoFilter([]);
    setSprints({ assigned: "all", authored: "all", planned: "all" });
    if (kind !== "all" && kind !== c.item.kind) setKind("all");
    setAsk("all");
    setBucket(viewOf(c, me) ?? "inbox");
    setReveal(c.item.id);
  };
  /** A click on a notification: its item, or the inbox for the summary of several. */
  const openNotified = (itemId: string | null) => {
    const entry = itemId ? inbox.classified.find((c) => c.item.id === itemId) : undefined;
    if (entry) jumpTo(entry);
    else setBucket("inbox");
  };
  const { notifyDelivery, notifyCollected, notifyLastSummary } = inbox.settings;
  const notifyOptions = { on: inbox.settings.notifications, reasons: inbox.settings.notifyOn, inFront: inbox.settings.notifyInFront, delivery: notifyDelivery };
  const pending = { collected: notifyCollected, lastSummary: notifyLastSummary };
  const savePending = (change: (current: Pending) => Pending) =>
    void inbox.updateSettings((s) => {
      const next = change({ collected: s.notifyCollected, lastSummary: s.notifyLastSummary });
      return { ...s, notifyCollected: next.collected, notifyLastSummary: next.lastSummary };
    });
  useAttention(inbox.classified, badgeIds, notifyOptions, inbox.settings.dockBadge, openNotified, pending, savePending);

  const orbLogins = useOrbLogins();
  const { orbLooks } = inbox.settings;
  useLayoutEffect(() => setOrbLooks(orbLooks), [orbLooks]);
  const { ready: inboxReady, updateSettings } = inbox;
  useEffect(() => {
    if (!inboxReady || assignLooks(orbLogins, orbLooks) === orbLooks) return;
    void updateSettings((current) => ({ ...current, orbLooks: assignLooks(orbLogins, current.orbLooks) }));
  }, [inboxReady, updateSettings, orbLogins, orbLooks]);

  if (!inbox.ready) return <div className="boot" data-tauri-drag-region />;

  return (
    <div className={`shell${table ? " wide" : ""}`} style={{ "--sidebar-w": `${columns.widths.sidebar}px`, "--list-w": `${columns.widths.list}px` } as React.CSSProperties}>
      <Sidebar
        bucket={bucket}
        views={views}
        counts={viewCounts}
        unread={unreadCounts}
        repos={repos}
        viewCounts={inbox.settings.viewCounts}
        repoCounts={inbox.settings.repoCounts}
        repoFilter={repoFilter}
        me={inbox.me}
        myName={inbox.myName}
        myAvatar={inbox.myAvatar}
        missingScopes={inbox.missingScopes}
        loading={inbox.loading}
        fetchedAt={inbox.fetchedAt}
        error={inbox.error}
        pausedUntil={inbox.pausedUntil}
        usage={inbox.usage}
        refreshMinutes={inbox.settings.refreshMinutes}
        onBucket={setBucket}
        onViewMenu={openViewMenu}
        onRepoMenu={openRepoMenu}
        isDirectOnly={(repo) => covers(repo, inbox.settings.directOnly)}
        onRepo={(name, add) => setRepoFilter((current) => (name ? pickRepo(current, name, add) : []))}
        onSearch={() => setDialog("palette")}
        onRefresh={() => void inbox.refresh()}
        onStop={inbox.stopRefresh}
        onSettings={() => setDialog("settings")}
        onRules={() => setDialog("rules")}
      />
      {table ? (
        <AssignedTable
          mode={bucket}
          onMenu={openMenu}
          counts={counts}
          onJump={setBucket}
          title={VIEWS.find((b) => b.id === bucket)!.title}
          reopenOn={inbox.settings.reopenOn}
          onShowRules={() => setDialog("rules")}
          groups={tableGroups}
          grouping={inbox.settings.tableGrouping === "status" ? "status" : "type"}
          onGrouping={(tableGrouping) => void inbox.saveSettings({ ...inbox.settings, tableGrouping })}
          collapsed={tableFolded}
          selectedBar={selectedBar}
          onSelectBar={(group) => selection.select(`bar:${group}`)}
          onToggle={toggleBar}
          sprint={sprints[bucket]}
          sprints={bucket === "assigned" ? plateSprints : bucket === "planned" ? plannedSprints : authoredSprints}
          layout={bucket === "planned" ? layout : undefined}
          onLayout={setLayout}
          onSprint={(filter) => setSprints((current) => ({ ...current, [bucket]: filter }))}
          onToggleAll={(fold) => bars.setAll(tableGroups.map((g) => barKey(g.group)), fold)}
          hiddenBoards={inbox.settings.hiddenBoards}
          statusMap={inbox.settings.statusMap}
          attributes={columnKeys}
          columns={tableColumns}
          onColumn={setColumn}
          showOpened={showOpened}
          datedOf={dated}
          pinnedOn={inbox.settings.pinnedOn}
          today={today}
          onFocus={toggleFocus}
          onMove={(bar, target) => void inbox.saveSettings({ ...inbox.settings, plateOrder: moveBar(inbox.settings.plateOrder, bar as PlateGroup, target as PlateGroup) })}
          seen={inbox.seen}
          unreadMarks={inbox.unreadMarks}
          me={inbox.me ?? ""}
          search={search}
          onSearch={setSearch}
          searchCount={searchCount}
          searchRef={searchRef}
          kind={kind}
          onKind={setKind}
          sort={sort.of(bucket)}
          onSort={() => sort.flip(bucket)}
          selected={selection.selected}
          onSelect={(id) => {
            clearMarks();
            selection.select(id);
          }}
          onOpen={() => setPopup(true)}
          marks={marks}
          onMark={mark}
          onClearMarks={() => setMarks(new Set())}
        />
      ) : (
        <InboxList
          timeOf={rowTime}
          unread={unreadInboxIds}
          datedOf={dated}
          pinnedOn={inbox.settings.pinnedOn}
          today={today}
          layout={bucket === "planned" ? layout : undefined}
          onLayout={setLayout}
          onMenu={openMenu}
          counts={counts}
          onJump={setBucket}
          bucket={bucket}
          title={VIEWS.find((b) => b.id === bucket)!.title}
          reopenOn={inbox.settings.reopenOn}
          onShowRules={() => setDialog("rules")}
          entries={listed}
          search={search}
          onSearch={setSearch}
          searchCount={searchCount}
          searchRef={searchRef}
          kind={kind}
          onKind={setKind}
          ask={ask}
          askCounts={askCounts}
          onAsk={setAsk}
          sort={sort.of(bucket)}
          onSort={() => sort.flip(bucket)}
          timeGroups={timeGroups}
          folded={folded}
          onToggleGroup={(group) => {
            selection.select(`bar:${group}`);
            toggleBar(group);
          }}
          onToggleAll={(fold) => bars.setAll((timeGroups ?? []).filter((g) => g.group).map((g) => barKey(g.group)), fold)}
          selectedGroup={selectedBar}
          selected={selection.selected}
          loading={inbox.loading}
          avatars={inbox.settings.avatars}
          onSelect={(id) => {
            clearMarks();
            selection.select(id);
          }}
          onOpen={(c) => void openUrl(c.item.url)}
          marks={marks}
          onMark={mark}
          onClearMarks={() => setMarks(new Set())}
        />
      )}
      <div className="resizer-slot sidebar-edge">
        <Resizer label={t("pane.sidebar")} width={columns.widths.sidebar} onResize={(w) => columns.resize("sidebar", w)} onReset={() => columns.reset("sidebar")} />
      </div>
      {!table && (
        <>
          <div className="resizer-slot list-edge">
            <Resizer label={t("pane.list")} width={columns.widths.list} onResize={(w) => columns.resize("list", w)} onReset={() => columns.reset("list")} />
          </div>
          <Detail
            entry={current}
            me={inbox.me ?? ""}
            reopenOn={inbox.settings.reopenOn}
            datedOf={dated}
            hiddenBoards={inbox.settings.hiddenBoards}
            history={(current && inbox.statusLog.get(current.item.id)) ?? NO_HISTORY}
            failures={(current && inbox.writeFailures.get(current.item.id)) ?? NO_FAILURES}
            seenAt={current ? (inbox.seen.get(current.item.id) ?? null) : null}
            note={current ? (inbox.notes.get(current.item.id) ?? "") : ""}
            onNote={(id, note) => void inbox.saveNote(id, note)}
            attributes={detailKeys}
            statusMap={inbox.settings.statusMap}
            recentComments={inbox.settings.recentComments}
            botComments={inbox.settings.botComments}
            stickyReply={inbox.settings.stickyReply}
            openAt={inbox.settings.openAt}
            descriptionMode={inbox.settings.descriptionMode}
            onReplied={replied}
            onStatus={(s) => current && applyStatus(current, s)}
            onCopy={(format: LinkFormat) => current && void copy(itemLink(current.item, format))}
            onReload={() => current && reloadCurrent(current)}
            onOrca={current && orcaOffered(current) ? () => runOrca(current) : undefined}
            orcaHint={current ? orcaHint(current) : undefined}
            onAssignMe={() => current && assignMe(current)}
            onPlan={(at: DOMRect) => current && plan(current, at)}
            onSnooze={(at: DOMRect) => current && setSnoozeMenu({ entry: current, x: at.left, y: at.bottom + 4 })}
            onRemoveFollowUp={() => current && removeFollowUp(current)}
            reloading={reloading === current?.item.id}
          />
        </>
      )}
      {showPopup && (
        <div className="overlay" onMouseDown={() => setPopup(false)}>
          <div className="item-popup" role="dialog" aria-label={current.item.title} onMouseDown={(e) => e.stopPropagation()}>
              <Detail
                entry={current}
                me={inbox.me ?? ""}
                reopenOn={inbox.settings.reopenOn}
                datedOf={dated}
                hiddenBoards={inbox.settings.hiddenBoards}
                history={(current && inbox.statusLog.get(current.item.id)) ?? NO_HISTORY}
                failures={(current && inbox.writeFailures.get(current.item.id)) ?? NO_FAILURES}
                seenAt={current ? (inbox.seen.get(current.item.id) ?? null) : null}
                note={current ? (inbox.notes.get(current.item.id) ?? "") : ""}
                onNote={(id, note) => void inbox.saveNote(id, note)}
                attributes={detailKeys}
                statusMap={inbox.settings.statusMap}
                recentComments={inbox.settings.recentComments}
                botComments={inbox.settings.botComments}
                stickyReply={inbox.settings.stickyReply}
                openAt={inbox.settings.openAt}
                descriptionMode={inbox.settings.descriptionMode}
                onReplied={replied}
                onStatus={(s) => current && applyStatus(current, s)}
            onCopy={(format: LinkFormat) => current && void copy(itemLink(current.item, format))}
            onReload={() => current && reloadCurrent(current)}
            onOrca={current && orcaOffered(current) ? () => runOrca(current) : undefined}
            orcaHint={current ? orcaHint(current) : undefined}
            onAssignMe={() => current && assignMe(current)}
            onPlan={(at: DOMRect) => current && plan(current, at)}
            onSnooze={(at: DOMRect) => current && setSnoozeMenu({ entry: current, x: at.left, y: at.bottom + 4 })}
            onRemoveFollowUp={() => current && removeFollowUp(current)}
            reloading={reloading === current?.item.id}
                onClose={() => setPopup(false)}
              />
          </div>
        </div>
      )}

      {inbox.error && !inbox.fetchedAt && (
        <div className="error-bar" role="alert">
          {inbox.error}
        </div>
      )}
      <Toast toast={actions.toast} />
      {menu && <ContextMenu x={menu.x} y={menu.y} centered={menu.centered} entries={menu.entries} onClose={() => setMenu(null)} />}
      {snoozeMenu && (
        <ContextMenu x={snoozeMenu.x} y={snoozeMenu.y} centered={snoozeMenu.centered} entries={snoozeEntries(snoozeMenu.entry)} onClose={() => setSnoozeMenu(null)} />
      )}
      {pickingDate && (
        <SnoozeDatePicker
          onPick={pickingDate.pick}
          day={pickingDate.day}
          onClose={() => setPickingDate(null)}
        />
      )}
      {dialog === "palette" && (
        <CommandPalette
          views={views}
          me={me}
          entries={findable}
          current={current}
          onClose={() => setDialog(null)}
          onStatus={(s) => current && applyStatus(current, s)}
            onUntrack={() => current && untrack(current)}
            unread={!!current && isUnread(current)}
            onToggleRead={() => current && toggleRead([current])}
            onToday={current && pinnable(current) ? () => toggleFocus(current) : undefined}
            onPlan={current && pinnable(current) ? () => plan(current) : undefined}
            onCopy={(format: LinkFormat) => current && void copy(itemLink(current.item, format))}
            onReload={() => current && reloadCurrent(current)}
            onOrca={current && orcaOffered(current) ? () => runOrca(current) : undefined}
            onAssignMe={() => current && assignMe(current)}
            onFollowUp={() => current && snooze(current)}
            onRemoveFollowUp={current && hasFollowUp(current) ? () => removeFollowUp(current) : undefined}
            onRemovePlan={current && dated(current) ? () => planFor(current, null, "") : undefined}
            onLeave={current && leavable(current) ? () => leave(current) : undefined}
          onOpenCurrent={() => current && void openUrl(current.item.url)}
          onBucket={setBucket}
          onJump={jumpTo}
          onRefresh={() => void inbox.refresh()}
          onSettings={() => setDialog("settings")}
          onToggleTheme={toggleTheme}
          history={actions.history}
          onUndoSteps={actions.undoSteps}
          onRedoSteps={actions.redoSteps}
          onSwitchDemo={canSwitchDemo() ? switchDemo : undefined}
          demo={isDemo()}
          onHelp={() => setDialog("help")}
          onRules={() => setDialog("rules")}
          onResetFilters={resetFilters}
        />
      )}
      {(dialog === "help" || dialog === "rules") && (
        <Help
          tab="basics"
          reopenOn={inbox.settings.reopenOn}
          refreshMinutes={inbox.settings.refreshMinutes}
          onClose={() => setDialog(null)}
        />
      )}
      {(dialog === "settings" || welcome) && (
        <SettingsDialog
          settings={inbox.settings}
          welcome={welcome}
          onSave={(s) => void inbox.updateSettings((current) => ({ ...s, notifyCollected: current.notifyCollected, notifyLastSummary: current.notifyLastSummary }))}
          onClose={() => setDialog(null)}
          boards={boards}
          memberOrgs={inbox.memberOrgs}
          me={inbox.me}
          usage={inbox.usage}
          attributes={attributes}
          statusCount={inbox.statuses.size}
          onResetStatuses={inbox.resetStatuses}
        />
      )}
    </div>
  );
}

/** The list in the view's chosen direction; lists come newest first. */
function oriented<T>(list: T[], order: SortOrder): T[] {
  return order === "oldest" ? [...list].reverse() : list;
}

function sortByRecency(entries: Classified[], timeOf: (c: Classified) => string): Classified[] {
  return [...entries].sort((a, b) => timeOf(b).localeCompare(timeOf(a)));
}

function countBy<T>(list: T[], key: (t: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of list) counts[key(entry)] = (counts[key(entry)] ?? 0) + 1;
  return counts;
}

