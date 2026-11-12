import { openUrl } from "@tauri-apps/plugin-opener";
import { ghToken } from "./github/token";
import { assignSelf, setOpen, unassignSelf, type CloseReason } from "./github/comment";
import { snapshotOf } from "./handoff";
import { queueWrite } from "./github/queue";
import { sameLogin } from "./timeline";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Classified } from "./classify";
import { handledStep } from "./handledUntil";
import type { Status, StatusChange, StatusExtra, WriteFailure } from "./model";
import { setLang, t, type MessageKey } from "./ui/i18n";
import { itemLink, statusHint, KINDS, nextOf, sortTime, statusesFor, viewOf, VIEWS, type KindFilter, type LinkFormat, type View } from "./ui/labels";
import { covers, setCovered } from "./rules/directOnly";
import { ContextMenu, type MenuEntry } from "./ui/parts/ContextMenu";
import { OrcaMark } from "./ui/parts/OrcaMark";
import { repoList } from "./ui/repoList";
import { keyMenuAt, paneCenter } from "./ui/paneCenter";
import { useOrbLogins } from "./ui/avatarKinds";
import { setOrbLooks } from "./ui/orbLookStore";
import { assignLooks } from "./ui/orbLooks";
import { CalendarDay } from "./ui/parts/CalendarDay";
import { findEvents, moveEvent, putEvent, removeEvent, writing, type CalendarEvent } from "./calendar";
import { onDay } from "./ui/calendarSlot";
import { SnoozeDatePicker } from "./ui/parts/SnoozeDatePicker";
import { followUpOn, untilText } from "./ui/snooze";
import { followUpExtra, followUpUnchanged, isWaiting } from "./ui/followUp";
import { canSwitchDemo, isDemo, rememberDemo } from "./demo/flag";
import { doneAccess, keepsItsPlan, needsAskChoice, planStatus, type Place } from "./ui/statusPlan";
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
import { useCalendarAccess } from "./ui/useCalendarAccess";
import { useCalendarSync } from "./ui/useCalendarSync";
import { useWindowFocus } from "./ui/useWindowFocus";
import { useInbox } from "./ui/useInbox";
import { useOrca } from "./ui/useOrca";
import { addToOrca, openInOrca, pathText } from "./orca";
import { useSelection } from "./ui/useSelection";
import { assignedAt, withAssignees, withoutLocalEvent, withSelfAssigned, groupByRepo, groupByType, groupPlate, isActiveBar, isTypeGroup, leaveClears, localDay, moveBar, moveTypeBar, plateCount, type PlateGroup, type TableGroup, type TableGrouping } from "./ui/assignments";
import { choiceKey, choiceText, closedPlans, datedAt, datedOf, datedText, dayChoices, dayText, isPinnable, keepsPlan, orphanLinks, planOf, replan, retouch, rollOver, todayOf, unplan, withEvent, withPin, withPlan, without, type Today } from "./ui/plan";
import { attributeOptions, combineAttributes, shownKeys, tableKeys } from "./ui/attributes";
import { useCollapsed } from "./ui/useCollapsed";
import { unseenSettings } from "./ui/newSettings";
import { useSeenSettings } from "./ui/useSeenSettings";
import { useSortOrders, type SortOrder } from "./ui/useSortOrders";
import { useViewLayout } from "./ui/useViewLayout";
import { groupBySnoozeEnd, groupByTime, type SnoozeGroup, type TimeGroup } from "./ui/timeGroups";
import { DONE_GROUP, handledAt, inDoneBar } from "./ui/doneBar";
import { matchesSprint, sprintChoices, type SprintFilter } from "./ui/sprints";
import { filterGroups, matchesText } from "./ui/textFilter";
import { AssignedTable } from "./ui/parts/AssignedTable";
import { pickRepo } from "./ui/repoSelection";
import { useStatusActions } from "./ui/useStatusActions";
import { authoredCount, groupAuthored } from "./ui/authored";
import { setLogContext } from "./log";
import { seenStep, unreadAssignment, unreadInInbox } from "./ui/unread";
import { ASK_FILTERS, ASK_VIEWS, matchesAsk, type AskFilter } from "./ui/inboxFilter";
import "./ui/styles/shell.css";
import "./ui/styles/inbox.css";
import "./ui/styles/detail.css";
import "./ui/styles/palette.css";

type Dialog = "settings" | "palette" | "help" | "rules" | "keys" | null;

const NO_HISTORY: StatusChange[] = [];
const NO_FAILURES: WriteFailure[] = [];

/** Group bars take part in the keyboard selection as "bar:<group>". */
const isBar = (id: string) => id.startsWith("bar:");

/** An item counts as seen once it has been open this long with the window in front, so skimming with the arrow keys or looking away does not. */
const SEEN_AFTER_MS = 2500;

/** No calendar links while no calendar is chosen; one object, so `dated` keeps its identity. */
const NO_LINKS: Record<string, string> = {};

/** A change with its undo, as the toasts take them. */
type Step = { run: () => void; undo: () => void };

export default function App() {
  const inbox = useInbox();
  const seenSettings = useSeenSettings();
  // Before any child renders, so every t() call of this render uses the chosen language.
  setLang(inbox.settings.language);
  const [chosen, setChosen] = useState<View>("inbox");
  const views = VIEWS;
  const bucket = chosen;
  const [plannedLayout, setPlannedLayout] = useViewLayout("planned");
  const [followUpLayout, setFollowUpLayout] = useViewLayout("snoozed");
  const byReturn = bucket === "planned" || bucket === "snoozed";
  const layout = bucket === "snoozed" ? followUpLayout : plannedLayout;
  const setLayout = bucket === "snoozed" ? setFollowUpLayout : setPlannedLayout;
  const table = bucket === "assigned" || bucket === "authored" || (byReturn && layout === "table");
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
  // The inbox, its Done bar included, switches between mentions and reviews instead of Issues/Pull Requests.
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
    closePopup();
  };
  // Each table keeps its own sprint filter while the viewer switches views.
  const [sprints, setSprints] = useState<Record<"assigned" | "authored" | "planned" | "snoozed", SprintFilter>>({ assigned: "all", authored: "all", planned: "all", snoozed: "all" });
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
  const bars = useCollapsed("assigned-collapsed", ["blocked", "later", "finished", `inbox:${DONE_GROUP}`], ["blocked", `inbox:${DONE_GROUP}`]);
  const sort = useSortOrders();
  const authoredAll = useMemo(() => groupAuthored(scoped, inbox.me ?? "", sort.of("authored")), [scoped, inbox.me, sort]);
  const authoredSprints = useMemo(() => sprintChoices(authoredAll.flatMap((g) => g.entries.map((c) => c.item)), hidden), [authoredAll, hidden]);
  const authoredByStatus = useMemo(() => filterGroups(bySprint(authoredAll, sprints.authored, authoredSprints), query), [authoredAll, sprints.authored, authoredSprints, bySprint, query]);
  const authored = useMemo((): { group: TableGroup; entries: Classified[] }[] => {
    if (inbox.settings.authoredGrouping !== "repo") return authoredByStatus;
    const open = authoredByStatus.filter((g) => g.group !== "later").flatMap((g) => g.entries);
    return [...groupByRepo(open, (c) => c.item.createdAt, sort.of("authored")), ...authoredByStatus.filter((g) => g.group === "later")];
  }, [authoredByStatus, inbox.settings.authoredGrouping, sort]);
  const plate = useMemo((): { group: TableGroup; entries: Classified[] }[] => {
    const order = sort.of("assigned");
    const byStatus = plateNewest.map((g) => ({ ...g, entries: oriented(g.entries, order) }));
    if (inbox.settings.tableGrouping === "status") return byStatus;
    // What waits and what is finished but open stay at the bottom, in every grouping.
    const parked = byStatus.filter((g) => !isActiveBar(g.group));
    const working = plateNewest.filter((g) => isActiveBar(g.group)).flatMap((g) => g.entries);
    if (inbox.settings.tableGrouping === "repo") return [...groupByRepo(working, (c) => assignedAt(c.item, inbox.me ?? "").at, order), ...parked];
    return [...groupByType(working, inbox.settings.statusMap, order, inbox.me ?? "", inbox.settings.typeOrder), ...parked];
  }, [plateNewest, sort, inbox.settings.tableGrouping, inbox.settings.statusMap, inbox.settings.typeOrder, inbox.me]);
  const tableGrouping: TableGrouping = bucket === "authored" ? inbox.settings.authoredGrouping : inbox.settings.tableGrouping;
  const setGrouping = (grouping: TableGrouping) =>
    void inbox.saveSettings(bucket === "authored" ? { ...inbox.settings, authoredGrouping: grouping === "repo" ? "repo" : "status" } : { ...inbox.settings, tableGrouping: grouping });
  /** Drag and drop of a bar in Assigned to me: the status bars by status, the type bars by type. */
  const moveTableBar = (bar: TableGroup, target: TableGroup) => {
    const { settings } = inbox;
    if (settings.tableGrouping === "status") return void inbox.saveSettings({ ...settings, plateOrder: moveBar(settings.plateOrder, bar as PlateGroup, target as PlateGroup) });
    if (!isTypeGroup(bar) || !isTypeGroup(target)) return;
    const shown = plate.map((g) => g.group).filter(isTypeGroup);
    void inbox.saveSettings({ ...settings, typeOrder: moveTypeBar(shown, settings.typeOrder, bar, target) });
  };
  /** The detail pop-up of the tables: closed, or how its row was reached, by a click or with the keyboard. */
  const [popup, setPopup] = useState<false | "pointer" | "keys">(false);
  const me = inbox.me ?? "";
  const unreadInboxIds = useMemo(
    () => new Set(inbox.classified.filter((c) => c.bucket === "inbox" && (inbox.unreadMarks.has(c.item.id) || unreadInInbox(c, inbox.seen, me, inbox.settings.movesUp))).map((c) => c.item.id)),
    [inbox.classified, inbox.seen, inbox.unreadMarks, inbox.settings.movesUp, me],
  );
  /** U: unread as its view counts it, or marked so by hand. */
  /** Unread as the rows of `view` draw it: Assigned to me judges every row as an assignment, the same as its count. */
  const isUnread = (c: Classified, view: View = bucket) =>
    inbox.unreadMarks.has(c.item.id) ||
    (view === "assigned" ? unreadAssignment(c, inbox.seen, me, true, inbox.settings.movesUp) : c.bucket === "inbox" ? unreadInInbox(c, inbox.seen, me, inbox.settings.movesUp) : unreadAssignment(c, inbox.seen, me, false, inbox.settings.movesUp));
  /** Marks the items read when any is unread, else unread, with undo that restores each item's read state exactly. */
  const toggleRead = (cs: Classified[]) => {
    const read = cs.some((c) => isUnread(c));
    const before = cs.map((c) => ({ id: c.item.id, seen: inbox.seen.get(c.item.id), mark: inbox.unreadMarks.get(c.item.id) }));
    for (const c of cs) void (read ? inbox.markSeen(c.item.id) : inbox.markUnread(c.item.id));
    const text = cs.length === 1 ? t(read ? "toast.markedRead" : "toast.markedUnread", { number: cs[0].item.number }) : t(read ? "marks.markedRead" : "marks.markedUnread", { count: cs.length });
    actions.announce(
      text,
      () => before.forEach((b) => void inbox.restoreRead(b.id, { seen: b.seen, mark: b.mark })),
      () => cs.forEach((c) => void (read ? inbox.markSeen(c.item.id) : inbox.markUnread(c.item.id))),
    );
  };
  /** The unread assignments that still ask for work: the bars Blocked, Follow-up and Finished are parked. */
  const unreadPlateIds = useMemo(
    () =>
      new Set(
        groupPlate(inbox.classified, inbox.settings.statusMap, [], me)
          .filter((g) => isActiveBar(g.group))
          .flatMap((g) => g.entries.filter((c) => inbox.unreadMarks.has(c.item.id) || unreadAssignment(c, inbox.seen, me, true, inbox.settings.movesUp)).map((c) => c.item.id)),
      ),
    [inbox.classified, inbox.seen, inbox.unreadMarks, inbox.settings.statusMap, inbox.settings.movesUp, me],
  );
  /** The items a view's count stands for, within the repository filter, whatever else narrows its list. */
  const itemsOfView = (view: View): Classified[] => {
    if (view === "assigned") return groupPlate(inRepos, inbox.settings.statusMap, [], me).filter((g) => isActiveBar(g.group)).flatMap((g) => g.entries);
    if (view === "authored") return groupAuthored(inRepos, me).filter((g) => g.group !== "later").flatMap((g) => g.entries);
    if (view === "planned") return inRepos.filter((c) => dated(c) !== null);
    if (view === "snoozed") return inRepos.filter(isWaiting);
    return inRepos.filter((c) => c.bucket === view);
  };
  const unreadCounts = useMemo(() => ({ inbox: unreadInboxIds.size, assigned: unreadPlateIds.size }), [unreadInboxIds, unreadPlateIds]);
  const movesUp = inbox.settings.movesUp;
  const rowTime = useCallback((c: Classified) => sortTime(c, me, movesUp), [me, movesUp]);
  // Planned lists everything with a date, soonest first; the sort button turns the dated ones around.
  const focus = inbox.settings.focus;
  const plans = inbox.settings.planned;
  // The local date, set with the rollover check rather than read during render; the rows' marks and Today's date follow it.
  const [today, setToday] = useState(localDay);
  const starts = useCalendarSync(inbox.ready, inbox.settings, inbox.updateSettings, actions.notify, (id) => inbox.classified.find((c) => c.item.id === id)?.item.number);
  const links = inbox.settings.calendarId ? inbox.settings.calendarEvents : NO_LINKS;
  const dated = useCallback((c: Classified) => withEvent(datedOf(c, focus, plans, today), links[c.item.id], starts), [focus, plans, today, links, starts]);
  const plannedAll = useMemo(() => scoped.filter((c) => datedOf(c, focus, plans, today) !== null), [scoped, focus, plans, today]);
  const doneIds = useMemo(
    () => new Set(inbox.classified.filter((c) => inDoneBar(c, inbox.handledUntil.get(c.item.id), me, inbox.now, datedOf(c, focus, plans, today) !== null)).map((c) => c.item.id)),
    [inbox.classified, inbox.handledUntil, me, inbox.now, focus, plans, today],
  );
  /** Where a status is chosen for an item: its row in the inbox's Done bar, or the current view. */
  const place = (c: Classified): Place => (bucket === "inbox" && doneIds.has(c.item.id) ? "done" : bucket);
  /** How D is offered for an item: as usual, or not at all (see `doneAccess`). */
  const doneIn = (c: Classified) => doneAccess(c, me, place(c));
  // Rows of the Done bar show when they were handled; every other row its own time (`sortTime`).
  const listTime = useCallback(
    (c: Classified) => (doneIds.has(c.item.id) ? (handledAt(c, inbox.handledUntil.get(c.item.id), me) ?? "") : rowTime(c)),
    [doneIds, inbox.handledUntil, me, rowTime],
  );
  // Activity on a planned item leaves it in Planned, unread there, unless it asks the viewer again.
  const unreadPlannedIds = useMemo(
    () => new Set(plannedAll.filter((c) => inbox.unreadMarks.has(c.item.id) || (c.bucket === "inbox" ? unreadInInbox(c, inbox.seen, me, inbox.settings.movesUp) : unreadAssignment(c, inbox.seen, me, false, inbox.settings.movesUp))).map((c) => c.item.id)),
    [plannedAll, inbox.seen, inbox.unreadMarks, inbox.settings.movesUp, me],
  );
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
  // Follow-up lists what waits, by the day it comes back, soonest first, those without a date last.
  const followUpAll = useMemo(() => scoped.filter(isWaiting), [scoped]);
  const followUpGroups = useMemo(
    () => (bucket === "snoozed" ? groupBySnoozeEnd(followUpAll.filter((c) => matchesText(c.item, query)), (c) => c.until, (c) => c.statusAt ?? "", sort.of("snoozed") === "oldest") : []),
    [bucket, followUpAll, query, sort],
  );
  const unreadFollowUpIds = useMemo(
    () => new Set(followUpAll.filter((c) => inbox.unreadMarks.has(c.item.id) || (c.bucket === "inbox" ? unreadInInbox(c, inbox.seen, me, inbox.settings.movesUp) : unreadAssignment(c, inbox.seen, me, false, inbox.settings.movesUp))).map((c) => c.item.id)),
    [followUpAll, inbox.seen, inbox.unreadMarks, inbox.settings.movesUp, me],
  );
  const followUpSprints = useMemo(() => sprintChoices(followUpAll.map((c) => c.item), hidden), [followUpAll, hidden]);
  const followUpTable = useMemo(
    (): { group: TableGroup; entries: Classified[] }[] => bySprint(followUpGroups.map((g) => ({ group: `day:${g.group}` as TableGroup, entries: g.entries })), sprints.snoozed, followUpSprints),
    [followUpGroups, bySprint, sprints.snoozed, followUpSprints],
  );
  const byReturnGroups = bucket === "snoozed" ? followUpGroups : plannedGroups;
  const listed = useMemo(
    () =>
      table
        ? []
        : byReturn
          ? byReturnGroups.flatMap((g) => g.entries)
          : oriented(sortByRecency((asking ? askBase.filter((c) => matchesAsk(c, ask, me)) : scoped.filter((c) => c.bucket === bucket)).filter((c) => matchesText(c.item, query)), rowTime), sort.of(bucket)),
    [scoped, askBase, asking, ask, query, me, bucket, byReturn, table, sort, rowTime, byReturnGroups],
  );
  const doneRows = useMemo(
    () => (bucket === "inbox" ? oriented(sortByRecency(scoped.filter((c) => doneIds.has(c.item.id) && matchesAsk(c, ask, me) && matchesText(c.item, query)), listTime), sort.of(bucket)) : []),
    [bucket, scoped, doneIds, ask, me, query, listTime, sort],
  );
  const timeGroups = useMemo(() => {
    if (table) return undefined;
    const heading = (group: TimeGroup | SnoozeGroup) => t(`time.group.${group}`);
    if (byReturn) return byReturnGroups.map((g) => ({ ...g, heading: heading(g.group) }));
    const bar = doneRows.length > 0 ? [{ group: DONE_GROUP, heading: t("bucket.done"), entries: doneRows }] : [];
    if (inbox.settings.groupByTime) return [...groupByTime(listed, rowTime, sort.of(bucket) === "oldest").map((g) => ({ ...g, heading: heading(g.group) })), ...bar];
    // Without time groups the rows stand under no bar ("") and only the Done bar's under theirs.
    return bar.length > 0 ? [{ group: "", heading: "", entries: listed }, ...bar] : undefined;
  }, [bucket, byReturn, table, listed, byReturnGroups, doneRows, inbox.settings.groupByTime, sort, rowTime]);
  // The bars of the current view: status or time bars of the table, or a list's time groups.
  // Lists remember their folded groups per view, so "Today" folded in Planned stays open in the inbox.
  const tableGroups = bucket === "assigned" ? plate : bucket === "planned" ? plannedTable : bucket === "snoozed" ? followUpTable : authored;
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
  /** Closing the pop-up lets go of a row reached by a click; one reached with the keyboard stays selected, as the cursor to move on from. */
  const closePopup = () => {
    setPopup(false);
    if (popup === "pointer") selection.select(null);
  };
  /** An undo reselects its item; an open pop-up belongs to the item it shows, so it closes first. */
  const takeBack = (id: string) => {
    closePopup();
    selection.select(id);
  };
  useEffect(() => {
    reselect.current = takeBack;
  });
  // A palette jump lands once the target view has rendered; a folded group around it opens first.
  const [reveal, setReveal] = useState<string | null>(null);
  useEffect(() => {
    if (!reveal) return;
    const group = viewGroups?.find((g) => g.entries.some((c) => c.item.id === reveal))?.group;
    if (group && folded(group)) return bars.toggle(barKey(group));
    if (ids.includes(reveal)) {
      selection.select(reveal);
      // A table row shows nothing of the item; its pop-up is what opens it, and marks it seen.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot: the jump lands once
      if (table) setPopup("keys");
    }
    setReveal(null);
  }, [reveal, viewGroups, folded, ids, bars, barKey, selection, table]);
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
  const step = (offset: number) => {
    selection.move(offset);
    keyboardOwnsPopup();
  };
  /** An open pop-up whose row the keyboard moved on (or a jump landed in) keeps that row selected when it closes. */
  const keyboardOwnsPopup = () => popup && setPopup("keys");
  // Assigned to me keeps its folded bars unprefixed, as stored before other tables existed.
  const tableFolded = useMemo(
    () => (bucket === "assigned" ? bars.collapsed : new Set([...bars.collapsed].filter((k) => k.startsWith(`${bucket}:`)).map((k) => k.slice(bucket.length + 1)))),
    [bars.collapsed, bucket],
  );

  const counts = useMemo(
    (): Record<View, number> => ({ inbox: inboxAll.length, planned: plannedAll.length, snoozed: followUpAll.length, assigned: plateCount(plateAll), authored: authoredCount(authoredAll) }),
    [inboxAll, plannedAll, followUpAll, plateAll, authoredAll],
  );
  // The picked repos narrow the sidebar's counts like the list; the other filters do not.
  const viewCounts = useMemo((): Record<View, number> => {
    const all = inRepos;
    return {
      inbox: all.filter((c) => c.bucket === "inbox").length,
      planned: all.filter((c) => datedOf(c, focus, plans, today) !== null).length,
      snoozed: all.filter(isWaiting).length,
      assigned: plateCount(groupPlate(all, inbox.settings.statusMap, [], me)),
      authored: authoredCount(groupAuthored(all, me)),
    };
  }, [inRepos, focus, inbox.settings.statusMap, plans, today, me]);
  const findable = useMemo(() => inbox.classified.filter((c) => viewOf(c, me, doneIds.has(c.item.id)) !== null), [inbox.classified, me, doneIds]);
  // The badge says there is something to do again, or still: unread inbox items and unread assignments, marks by hand included.
  const badgeIds = useMemo(() => new Set([...unreadInboxIds, ...unreadPlateIds]), [unreadInboxIds, unreadPlateIds]);
  const repos = useMemo(() => repoList(inbox.classified, me, inbox.settings.statusMap, (c) => doneIds.has(c.item.id)), [inbox.classified, me, inbox.settings.statusMap, doneIds]);

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
  const tableView = bucket === "authored" || bucket === "planned" || bucket === "snoozed" ? bucket : "assigned";
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
    setSprints({ assigned: "all", authored: "all", planned: "all", snoozed: "all" });
    setSearch(null);
  };
  /** A key for the selected item; with none selected it says so, since a click that closed a pop-up leaves none. */
  const withCurrent = (fn: (c: Classified) => void) => () => (current ? fn(current) : entries.length > 0 && actions.notify(t("noop.noSelection")));

  const pinnable = isPinnable;
  const toggleFocus = (c: Classified, extra: Step[] = []) => {
    const on = inbox.settings.focus.includes(c.item.id);
    const previous = todayOf(inbox.settings);
    const at = new Date().toISOString();
    const next = on ? { ...unplan(previous, [c.item.id]), focusDay: localDay() } : withPin(previous, c.item.id, localDay(), at);
    const steps = [todayStep([c.item.id], previous, next), ...(on ? eventEnds([c]) : [handled(c, at), ...seenOnOpen(c), ...followUpEnds(c), ...eventMoves(c, localDay())]), ...extra];
    for (const s of steps) s.run();
    actions.announce(
      on ? t("focus.removed", { number: c.item.number }) : replacing(t("focus.added", { number: c.item.number }), endedFollowUp(c)),
      () => steps.forEach((s) => s.undo()),
      () => steps.forEach((s) => s.run()),
    );
  };
  /** A change of Today to the items `ids` as a step: their part goes from `previous` to `next` and back, the rest of Today stays. */
  const todayStep = (ids: string[], previous: Today, next: Today) => ({
    run: () => void inbox.updateSettings((s) => ({ ...s, ...retouch(todayOf(s), ids, next) })),
    undo: () => void inbox.updateSettings((s) => ({ ...s, ...retouch(todayOf(s), ids, previous) })),
  });
  /** An item has one "when": a plan or Today pin on a follow-up ends it, as a step; none when there is no follow-up. */
  const followUpEnds = (c: Classified) => (isWaiting(c) ? [followUpStep(c)] : []);
  /** What a plan or pin ends for the toast: the item's follow-up, with its date when it has one. */
  const endedFollowUp = (c: Classified) => (c.status !== "snoozed" ? null : c.until ? t("replaced.followUpAt", { until: untilText(c.until) }) : t("replaced.followUp"));
  /** What a follow-up ends for the toast: the item's Today pin or its plan. */
  const endedPlan = (c: Classified) => {
    const when = dated(c);
    return when?.kind === "today" ? t("replaced.today") : when?.kind === "planned" ? t("replaced.plan", { day: dayText(when.day) }) : null;
  };
  /** A toast that also names the "when" the change replaced, so ⌘Z is one look away. */
  const replacing = (toast: string, replaced: string | null) => (replaced ? t("replaced.toast", { toast, replaced }) : toast);

  /** Plans an item for `day`, or takes the plan off with null; a plan takes it out of Today and ends its follow-up. */
  const planFor = (c: Classified, day: string | null, text: string, extra: Step[] = []) => {
    const previous = todayOf(inbox.settings);
    const at = new Date().toISOString();
    const next = withPlan(previous, c.item.id, day, at);
    const events = day ? eventMoves(c, day) : eventEnds([c]);
    const steps = [todayStep([c.item.id], previous, next), ...(day ? [handled(c, at), ...seenOnOpen(c), ...followUpEnds(c)] : []), ...events, ...extra];
    for (const s of steps) s.run();
    actions.announce(
      day ? replacing(t("plan.added", { number: c.item.number, day: text }), endedFollowUp(c)) : t(events.length > 0 ? "plan.removedEvent" : "plan.removed", { number: c.item.number }),
      () => steps.forEach((s) => s.undo()),
      () => steps.forEach((s) => s.run()),
    );
  };
  /** The days Plan and Follow-up both offer, under the same keys; `chosen` is checked, `pick` gets the day and its name. */
  const dayEntries = (pick: (day: string, text: string) => void, chosen?: string): MenuEntry[] =>
    dayChoices(new Date(), inbox.settings.workdays).map((choice) => ({ label: choiceText(choice), keys: choiceKey(choice), checked: choice.day === chosen, onSelect: () => pick(choice.day, choiceText(choice)) }));
  /** Keeps a plan through a new ask: the ask counts as seen, as when planned again, and the item leaves the inbox. */
  const keepPlan = (c: Classified, day: string | null) => {
    const previous = todayOf(inbox.settings);
    const at = new Date().toISOString();
    bulk(day ? t("plan.kept", { number: c.item.number, day }) : t("plan.keptToday", { number: c.item.number }), [todayStep([c.item.id], previous, { ...previous, plannedAt: { ...previous.plannedAt, [c.item.id]: at } }), handled(c, at), ...seenOnOpen(c)]);
  };
  /** The plan choices: "Keep plan" while a new ask shows a planned item in the inbox, Today (T), the days, a picked date and its removal (X). With a calendar, a day opens the day view on it, and "Today at a time" (A) joins. */
  const planEntries = (c: Classified): MenuEntry[] => {
    const day = inbox.settings.planned.find((p) => p.id === c.item.id)?.day;
    const when = dated(c);
    const kept = when && c.bucket === "inbox" ? datedText(when).text : null;
    const keepLabel = when?.kind === "today" ? t("plan.keepToday") : t("plan.keep", { day: kept ?? "" });
    const calendar = !!inbox.settings.calendarId;
    const pick = (d: string) => (calendar ? void openCalendar(c, d) : planFor(c, d, dayText(d)));
    return [
      ...(kept ? [{ label: keepLabel, hint: t("hint.plan.keep"), keys: "K", onSelect: () => keepPlan(c, when?.kind === "today" ? null : kept) }] : []),
      { label: t("menu.today"), hint: t("hint.menu.today"), keys: "T", checked: inbox.settings.focus.includes(c.item.id), divided: !!kept, onSelect: () => toggleFocus(c) },
      ...(calendar ? [{ label: t("plan.todayAt"), hint: t("hint.plan.todayAt"), keys: "A", onSelect: () => pick(localDay()) }] : []),
      ...dayEntries((d) => pick(d), day).map((e, i) => (i === 0 ? { ...e, divided: true } : e)),
      { label: t("snooze.pick"), keys: "D", divided: true, checked: !!day && !dayChoices(new Date(), inbox.settings.workdays).some((choice) => choice.day === day), onSelect: () => setPickingDate({ day: true, pick: (at) => pick(localDay(new Date(at))) }) },
      { label: t("plan.remove"), keys: "X", divided: true, disabled: !when, onSelect: () => planFor(c, null, "") },
    ];
  };
  /** Opens the calendar day view on `day`, else on the item's event's day, else on today; with the item's event when it still exists. */
  const openCalendar = async (c: Classified, day?: string) => {
    const id = inbox.settings.calendarEvents[c.item.id];
    const [linked] = id ? await findEvents([id]) : [];
    setCalendarFor({ c, linked: linked ?? null, day: day ?? (linked ? localDay(new Date(linked.start)) : localDay()) });
  };
  /** Plans the item for `day` without a time: today as a Today pin, another day as a plan, with `extra` in the same undo; when it already is, `extra` just runs. */
  const planOnDay = (c: Classified, day: string, extra: Step[] = []) => {
    const when = dated(c);
    if (day === localDay() ? when?.kind !== "today" : when?.kind !== "planned" || when.day !== day) {
      if (day === localDay()) toggleFocus(c, extra);
      else planFor(c, day, dayText(day), extra);
    } else {
      extra.forEach((s) => s.run());
      if (extra.length === 0) return;
      actions.announce(
        day === localDay() ? t("focus.added", { number: c.item.number }) : t("plan.added", { number: c.item.number, day: dayText(day) }),
        () => extra.forEach((s) => s.undo()),
        () => extra.forEach((s) => s.run()),
      );
    }
  };
  /** What a new event for the item says in its notes: its reference and link. */
  const eventDraft = (c: Classified, calendarId: string, title: string, start: number, end: number) => ({
    calendarId,
    title,
    url: c.item.url,
    notes: `${c.item.repo}#${c.item.number}\n${c.item.url}\n\n${t("calendarDay.createdWith")}`,
    start,
    end,
  });
  /** Links the item to its event, or unlinks it with null. */
  const linkEvent = (c: Classified, id: string | null) =>
    void inbox.updateSettings((s) => ({ ...s, calendarEvents: id ? { ...s.calendarEvents, [c.item.id]: id } : without(s.calendarEvents, c.item.id) }));
  /**
   * Puts the item into the chosen calendar, or changes its event, and plans it for that day. The
   * plan comes before the link, so no render shows a link without a plan. Undo deletes a new
   * event, or moves a changed one back; redo creates or moves it again.
   */
  const addToCalendar = async (c: Classified, linked: CalendarEvent | null, day: string, start: number, end: number, title: string) => {
    const draft = eventDraft(c, inbox.settings.calendarId, title, start, end);
    const changed = linked && (await putEvent({ ...draft, id: linked.id }));
    const saved = changed || (await putEvent(draft));
    if (!saved) throw new Error(t("calendarDay.failed"));
    let id = saved.id;
    let first = true;
    const made: Step =
      linked && changed
        ? { run: () => void (first ? (first = false) : moveEvent(id, start, end)), undo: () => void moveEvent(id, linked.start, linked.end) }
        : {
            run: () => {
              if (first) {
                first = false;
                return linkEvent(c, id);
              }
              void putEvent(draft).then((again) => again && ((id = again.id), linkEvent(c, id)));
            },
            undo: () => {
              linkEvent(c, null);
              void removeEvent(id).catch(() => undefined);
            },
          };
    planOnDay(c, day, [made]);
  };
  /** Moves the item's event to `day` at the same time of day, as a step; none without an event. Undo moves it back. */
  const eventMoves = (c: Classified, day: string): Step[] => {
    const id = inbox.settings.calendarEvents[c.item.id];
    if (!id || !inbox.settings.calendarId) return [];
    let before: CalendarEvent | undefined;
    let moved: Promise<unknown> = Promise.resolve();
    return [
      {
        run: () =>
          void (moved = writing(
            findEvents([id]).then(([event]) => {
              if (!event || localDay(new Date(event.start)) === day) return;
              before = event;
              const to = onDay(event, day);
              return moveEvent(id, to.start, to.end);
            }),
          ).catch(() => undefined)),
        undo: () => void writing(moved.then(() => before && moveEvent(id, before.start, before.end))).catch(() => undefined),
      },
    ];
  };
  /**
   * Ends the events of the items that have one, as one step each. With `remove` the event is
   * deleted and undo puts a new one at the same time with the same title, since a deleted event
   * cannot come back; without it only the link goes, the event stays, and undo restores the link.
   */
  const eventEnds = (cs: Classified[], remove = true): Step[] =>
    cs.flatMap((c) => {
      let id = inbox.settings.calendarEvents[c.item.id];
      if (!id || !inbox.settings.calendarId) return [];
      let removed: Promise<CalendarEvent | undefined> = Promise.resolve(undefined);
      return [
        {
          run: () => {
            linkEvent(c, null);
            if (remove) removed = writing(findEvents([id]).then(async ([event]) => (event && (await removeEvent(event.id)), event))).catch(() => undefined);
          },
          undo: () =>
            void removed.then(async (event) => {
              if (!remove) return linkEvent(c, id);
              const saved = event && (await putEvent(eventDraft(c, event.calendarId, event.title, event.start, event.end)));
              if (!saved) return;
              id = saved.id;
              linkEvent(c, id);
            }),
        },
      ];
    });
  /** P on an item: the plan choices open below its row, like the follow-up ones, or below the detail's Plan button. */
  const plan = (c: Classified, at?: DOMRect) =>
    pinnable(c) ? setMenu({ of: { id: c.item.id, kind: "plan" }, fit: true, ...(at ? { x: at.left, y: at.bottom + 4 } : { ...paneCenter(), centered: true }) }) : actions.notify(t("noop.notPlannable", { number: c.item.number }));

  /** Stops tracking an item for good, with undo; the settings list it for tracking again. */
  const untrack = (c: Classified) => {
    const entry = { id: c.item.id, repo: c.item.repo, number: c.item.number, title: c.item.title, url: c.item.url, at: new Date().toISOString() };
    const steps = [
      { run: () => void inbox.updateSettings((s) => ({ ...s, untracked: s.untracked.some((u) => u.id === entry.id) ? s.untracked : [...s.untracked, entry] })), undo: () => void inbox.updateSettings((s) => ({ ...s, untracked: s.untracked.filter((u) => u.id !== entry.id) })) },
      ...unplanStep([c]),
    ];
    for (const step of steps) step.run();
    actions.announce(
      t("untrack.done", { number: c.item.number }),
      () => steps.forEach((step) => step.undo()),
      () => steps.forEach((step) => step.run()),
    );
  };

  /** Swaps real and demo data: remembered for this window, then the app starts over on the other. */
  const switchDemo = () => {
    rememberDemo(!isDemo());
    window.location.reload();
  };
  const [menu, setMenu] = useState<{ entries?: MenuEntry[]; of?: { id: string; kind: "item" | "plan" }; x: number; y: number; centered?: boolean; centerX?: boolean; fit?: boolean } | null>(null);
  /** A menu of one item is built from the item as it is now, not as it was when the menu opened. */
  const menuItem = menu?.of ? inbox.classified.find((c) => c.item.id === menu.of?.id) : undefined;
  const [snoozeMenu, setSnoozeMenu] = useState<{ entry: Classified; x: number; y: number; centered?: boolean; centerX?: boolean } | null>(null);
  const snoozeItem = snoozeMenu ? inbox.classified.find((c) => c.item.id === snoozeMenu.entry.item.id) : undefined;
  // An item that left the list takes its menu along, so the menu cannot come back with it.
  if (menu?.of && !menuItem) setMenu(null);
  if (snoozeMenu && !snoozeItem) setSnoozeMenu(null);
  const [calendarFor, setCalendarFor] = useState<{ c: Classified; linked: CalendarEvent | null; day: string } | null>(null);
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
  };
  /** D on an item that only files its asks (see `planStatus`): the "filedAt" time and handled-until, with an undo that restores the earlier ones. */
  const fileStep = (c: Classified) => {
    const id = c.item.id;
    const previous = inbox.settings.filedAt[id];
    const at = new Date().toISOString();
    const handling = handled(c, at);
    return {
      run: () => (handling.run(), void inbox.updateSettings((s) => ({ ...s, filedAt: { ...s.filedAt, [id]: at } }))),
      undo: () => (handling.undo(), void inbox.updateSettings((s) => ({ ...s, filedAt: previous ? { ...s.filedAt, [id]: previous } : without(s.filedAt, id) }))),
    };
  };
  /** D in the inbox, P, T and F mark the item handled until `at`, as a step (see `handledStep`). */
  const handled = (c: Classified, at = new Date().toISOString()) => handledStep(c.item.id, inbox.handledUntil.get(c.item.id), at, inbox.setHandledUntil);
  /** P, T and F mark the item seen while it is open, as a step (see `seenStep`). */
  const seenOnOpen = (c: Classified) => seenStep(c.item.id, openedId, { seen: inbox.seen.get(c.item.id), mark: inbox.unreadMarks.get(c.item.id) }, inbox.markSeen, inbox.restoreRead);
  const statusStep = (c: Classified, status: Status, extra: StatusExtra = {}) => {
    const previous = inbox.statuses.get(c.item.id);
    return { run: () => void inbox.setStatus(c.item.id, status, extra), undo: () => void inbox.restoreStatus(c.item.id, previous) };
  };
  /** The choice D offers where open asks wait in the inbox: Enter keeps them, D files them with it. */
  const askChoiceEntries = (choose: (asks: "keep" | "file") => void): MenuEntry[] => [
    { label: t("askChoice.keep"), hint: t("hint.askChoice.keep"), onSelect: () => choose("keep") },
    { label: t("askChoice.file"), hint: t("hint.askChoice.file"), keys: "D", onSelect: () => choose("file") },
  ];
  const hasFollowUp = (c: Classified) => c.status === "snoozed";
  /** Takes the follow-up off an item; a finished part stays done (see `afterFollowUp`). Undo puts back exactly what was stored. */
  const followUpStep = (c: Classified) => {
    const previous = inbox.statuses.get(c.item.id);
    return { run: () => void inbox.endFollowUp(c.item.id), undo: () => void inbox.restoreStatus(c.item.id, previous) };
  };
  const removeFollowUp = (c: Classified) => bulk(t("toast.reminderRemoved", { number: c.item.number }), [followUpStep(c)]);
  /** X on one item: its plan or Today pin goes, else its follow-up. */
  const removeWhen = (c: Classified) =>
    dated(c) ? planFor(c, null, "") : hasFollowUp(c) ? removeFollowUp(c) : actions.notify(t("noop.noFollowUp", { number: c.item.number }));
  /**
   * Takes the plan or Today pin off the items that have one, as one step for all of them; none
   * when none has. Their events are deleted with `remove` (X), else only unlinked and left in the calendar.
   */
  const unplanStep = (cs: Classified[], remove = false) => {
    const { focus, planned } = inbox.settings;
    const ids = cs.map((c) => c.item.id).filter((id) => focus.includes(id) || planned.some((p) => p.id === id));
    return ids.length > 0 ? [todayStep(ids, todayOf(inbox.settings), unplan(todayOf(inbox.settings), ids)), ...eventEnds(cs.filter((c) => ids.includes(c.item.id)), remove)] : [];
  };
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
    const anyUnread = items.some((c) => isUnread(c, view));
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
        { label: t("sidebar.allUpdates"), hint: t("hint.sidebar.allUpdates"), icon: <Bell size={14} />, checked: !on, onSelect: () => void inbox.saveSettings({ ...inbox.settings, directOnly: setCovered(repo, scopes, false) }) },
        { label: t("sidebar.directOnly"), hint: t("hint.sidebar.directOnly"), icon: <UserCheck size={14} />, checked: on, onSelect: () => void inbox.saveSettings({ ...inbox.settings, directOnly: setCovered(repo, scopes, true) }) },
      ],
      x: e.clientX,
      y: e.clientY,
    });
  };
  /**
   * D moved the item into a parked bar of the same table or into the inbox's Done bar: the
   * selection goes on to the next open row instead of following it down, as when an item leaves
   * the list. A pop-up opened by click closes and leaves nothing selected; one opened by key shows
   * the next row.
   */
  const moveOn = (id: string) => {
    if (!viewGroups) return;
    const parked = (group: string) => (table ? !isActiveBar(group as PlateGroup) : group === DONE_GROUP);
    const open = viewGroups.filter((g) => !folded(g.group) && !parked(g.group)).flatMap((g) => g.entries.map((e) => e.item.id));
    const at = open.indexOf(id);
    if (at < 0) return;
    if (popup === "pointer") {
      setPopup(false);
      return selection.select(null);
    }
    if (selection.selected === id) selection.select(open[at + 1] ?? open[at - 1] ?? null);
  };
  /**
   * A status chosen for an item. "Done" means more where it has more to end: an update is
   * ticked off with a fresh snapshot; an assignment of the table becomes
   * "my part done", which follows its updates. "Open" on that takes it back into the work.
   */
  const applyStatus = (c: Classified, status: Status, asks?: "keep" | "file") => {
    const { id, number } = c.item;
    const previous = inbox.statuses.get(id);
    const plan = planStatus(c, status, me, place(c));
    if (!asks && needsAskChoice(c, status, me, place(c))) return setMenu({ entries: askChoiceEntries((choice) => applyStatus(c, status, choice)), fit: true, ...paneCenter(), centered: true });
    if (status === "done" && bucket === "inbox") moveOn(id);
    if (plan.do === "file" || plan.do === "tick-update") {
      const ticking = plan.do === "tick-update";
      // Ticking off an open item also takes a fresh snapshot, so board and pull request changes count from now.
      const snapshot = ticking && !c.item.closed ? previous?.handoff : undefined;
      const ends = plan.do === "file" && plan.unplan ? unplanStep([c]) : [];
      const steps = [fileStep(c), ...(snapshot ? [{ run: () => void inbox.setHandoff(id, snapshotOf(c.item)), undo: () => void inbox.setHandoff(id, snapshot) }] : []), ...ends];
      steps.forEach((s) => s.run());
      return actions.announce(
        ticking ? t("toast.updateDone", { number }) : replacing(t("toast.filed", { number }), ends.length > 0 ? endedPlan(c) : null),
        () => (steps.forEach((s) => s.undo()), takeBack(id)),
        () => steps.forEach((s) => s.run()),
      );
    }
    // D ends a plan too, in the same toast and undo, unless the item keeps it (see `keepsItsPlan`).
    const ends = status === "done" && !keepsItsPlan(plan) ? unplanStep([c]) : [];
    const change = (text: string, run: () => void, undoMore?: () => void) => {
      const again = () => (run(), ends.forEach((s) => s.run()));
      again();
      actions.announce(
        replacing(text, ends.length > 0 ? endedPlan(c) : null),
        () => (undoMore?.(), void inbox.restoreStatus(id, previous), ends.forEach((s) => s.undo()), takeBack(id)),
        again,
      );
    };
    const hand = () => void inbox.setStatus(id, "done", { handoff: snapshotOf(c.item) });
    switch (plan.do) {
      case "resume":
        // The work opens again; a follow-up stays, as work and when are apart.
        return change(t("toast.resumed", { number }), () => void (c.status === "snoozed" ? inbox.setStatus(id, "snoozed", c.until ? { until: c.until, ...(c.notify && { notify: true }) } : {}) : inbox.clearStatus(id)));
      case "hand-off": {
        moveOn(id);
        if (asks !== "file" || c.asks.length === 0) return change(t("toast.handedOff", { number }), hand);
        const filing = fileStep(c);
        return change(t("toast.handedOffFiled", { number }), () => (hand(), filing.run()), filing.undo);
      }
      case "clear": {
        if (bucket === "snoozed") return change(t("toast.reminderRemoved", { number }), () => void inbox.endFollowUp(id));
        const handling = handled(c);
        return change(t("toast.filed", { number }), () => (handling.run(), void inbox.clearStatus(id)), handling.undo);
      }
      case "blocked":
        return;
      case "set": {
        const handling = plan.status === "done" ? [handled(c)] : [];
        if (ends.length === 0) return actions.apply(c, plan.status, undefined, handling);
        if (c.item.closed) return actions.notify(t("closed.noStatus", { number }));
        return change(`#${number} → ${t(`status.${plan.status}`)}`, () => (void inbox.setStatus(id, plan.status), handling.forEach((s) => s.run())), () => handling.forEach((s) => s.undo()));
      }
      case "none":
        return c.updates ? actions.notify(t("toast.partAlreadyDone", { number })) : undefined;
    }
  };
  /** A follow-up for one item, with or without a date and with "Remind me" as `notify`; its plan or Today pin goes with it, since an item has one "when". */
  const followUp = (c: Classified, until: string, notify = false) => {
    if (c.item.closed) return actions.notify(t("closed.noStatus", { number: c.item.number }));
    if (followUpUnchanged(c, until, notify)) return;
    const steps = [...unplanStep([c]), statusStep(c, "snoozed", followUpExtra(c, until, notify)), handled(c), ...seenOnOpen(c)];
    for (const s of steps) s.run();
    actions.announce(
      replacing(until ? t("toast.snoozedUntil", { number: c.item.number, until: untilText(until) }) : t("toast.snoozed", { number: c.item.number }), endedPlan(c)),
      () => (steps.forEach((s) => s.undo()), takeBack(c.item.id)),
      () => steps.forEach((s) => s.run()),
    );
  };
  // "Remind me" as flipped in the open follow-up menu, until a choice stores it; else the item's own.
  const [notifyChoice, setNotifyChoice] = useState<{ id: string; on: boolean } | null>(null);
  /** The follow-up choices for one item: "Remind me" (R), the days of Plan at the "followUpTime", a picked date, none, and its removal (X). */
  const snoozeEntries = (c: Classified): MenuEntry[] => {
    const notify = notifyChoice?.id === c.item.id ? notifyChoice.on : !!c.notify;
    return [
      { label: t("snooze.notify"), hint: t("hint.snooze.notify"), keys: "R", checked: notify, keepOpen: true, onSelect: () => setNotifyChoice({ id: c.item.id, on: !notify }) },
      ...dayEntries((day) => followUp(c, followUpOn(day, inbox.settings.followUpTime), notify), c.status === "snoozed" && c.until ? localDay(new Date(c.until)) : undefined).map((e, i) => (i === 0 ? { ...e, divided: true } : e)),
      { label: t("snooze.pick"), keys: "D", divided: true, onSelect: () => setPickingDate({ pick: (until) => followUp(c, until, notify) }) },
      { label: t("snooze.none"), hint: t("hint.snooze.none"), keys: "F", checked: c.status === "snoozed" && !c.until, onSelect: () => followUp(c, "") },
      { label: t("reminder.remove"), keys: "X", divided: true, disabled: !hasFollowUp(c), onSelect: () => removeFollowUp(c) },
    ];
  };
  /** F on an item: the follow-up choices open below its row, also to move the date. */
  const snooze = (c: Classified) => {
    if (c.item.closed) return actions.apply(c, "snoozed");
    setSnoozeMenu({ entry: c, ...keyMenuAt(c.item.id) });
  };
  /** Right click: selects the row and opens its context menu. */
  const openMenu = (entry: Classified, e: React.MouseEvent) => {
    e.preventDefault();
    selection.select(entry.item.id);
    setMenu({ of: { id: entry.item.id, kind: "item" as const }, x: e.clientX, y: e.clientY });
  };
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => actions.notify(t("menu.copied")),
      () => actions.notify(t("menu.copyFailed")),
    );
  const [reloading, setReloading] = useState<string | null>(null);
  const assignable = (c: Classified) => !c.item.closed && !c.item.assignees.some((a) => sameLogin(a, me));
  /**
   * Adds the viewer to the item's assignees: at once here, which moves it into Assigned to me,
   * and then on GitHub, queued; GitHub's assignees replace the local guess. A failure puts the
   * item back where it was and says so.
   */
  const assignMe = (c: Classified, quiet = false) => {
    if (!assignable(c)) return quiet ? undefined : actions.notify(t("assign.nothing"));
    const { id, number, assignees, reasons } = c.item;
    const text = t("assign.done", { number });
    // Undo leaves again, on GitHub too, through the same queue and with the same rollback.
    if (quiet) actions.notify(text);
    else
      actions.announce(
        text,
        () => classifiedById(id) && leave(classifiedById(id)!, true, true),
        () => classifiedById(id) && assignMe(classifiedById(id)!, true),
      );
    const at = new Date().toISOString();
    inbox.updateItem(id, (item) => withSelfAssigned(item, me, at));
    void queueWrite(() =>
      ghToken()
        .then((token) => assignSelf(token, id))
        .then(
          (fresh) => inbox.updateItem(id, (item) => withAssignees(item, fresh, me)),
          (e) => {
            inbox.updateItem(id, (item) => withoutLocalEvent(item, { assignees, reasons }, at));
            void inbox.logWriteFailure(id, "assign", String(e));
            actions.notify(t("assign.failed", { number, error: String(e) }));
          },
        ),
    );
  };
  /** The item as classified right now; an undo that runs later must not see the list of the render that made it. */
  const classifiedById = (id: string) => inbox.classifiedNow().find((e) => e.item.id === id);
  const leavable = (c: Classified) => !c.item.closed && c.item.assignees.some((a) => sameLogin(a, me));
  /**
   * ⌃U: the viewer's part is done and they leave the assignees, here at once and then on GitHub,
   * queued. The item then sorts like any other they are not assigned to: nowhere, until a mention.
   * A failure puts them back as assignee, with the status they had, and says so. With `keepStatus`
   * (undoing an assignment, which wrote none) the stored status is left alone.
   */
  const leave = (c: Classified, quiet = false, keepStatus = false) => {
    if (!leavable(c)) return quiet ? undefined : actions.notify(t("unassign.nothing"));
    const { id, number, assignees, reasons } = c.item;
    const previous = inbox.statuses.get(id);
    const cleared = !keepStatus && leaveClears(previous);
    if (cleared) void inbox.clearStatus(id);
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
          if (cleared) void inbox.restoreStatus(id, previous);
          const now = classifiedById(id);
          if (now) assignMe(now, true);
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
            inbox.updateItem(id, (item) => withoutLocalEvent(item, { assignees, reasons }, at));
            if (cleared) void inbox.restoreStatus(id, previous);
            void inbox.logWriteFailure(id, "unassign", String(e));
            actions.notify(t("unassign.failed", { number, error: String(e) }));
          },
        ),
    );
  };
  /** After a comment, close or reopen went to GitHub: load the item again; a close or reopen can be undone with the opposite write, an undone close with the item's plan. */
  const replied = (id: string, change?: StateWrite) => {
    void inbox.reloadItem(id);
    const c = classifiedById(id);
    if (!change || !c) return;
    const reverse = change.action === "close" ? "reopen" : "close";
    const plan = planOf(todayOf(inbox.settings), id);
    // Only once the item is loaded open again, or the closed-plan effect drops the plan once more.
    const replace = () => void inbox.updateSettings((s) => ({ ...s, ...replan(todayOf(s), plan) }));
    const write = (action: "close" | "reopen", reason?: CloseReason, after?: () => void) => () =>
      void queueWrite(() =>
        ghToken()
          .then((token) => setOpen(token, { id, kind: c.item.kind }, action, reason))
          .then(() => inbox.reloadItem(id))
          .then(after)
          .catch((e: unknown) => actions.notify(String(e))),
      );
    actions.announce(t(change.action === "close" ? "toast.closed" : "toast.reopened", { number: c.item.number }), write(reverse, change.before, change.action === "close" ? replace : undefined), write(change.action, change.reason));
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
  /** What D means for the item, for its label and hint: "my part done", filing, or plain Done. */
  const doneKind = (id: Status, c: Classified): Status | "handOff" | "file" | "clear" => {
    if (id !== "done") return id;
    const { do: kind } = planStatus(c, id, me, place(c));
    return kind === "hand-off" ? "handOff" : kind === "file" ? "file" : kind === "clear" ? (bucket === "snoozed" ? "clear" : "file") : id;
  };
  /** The context menu of one item: the controls it has elsewhere, under the same shortcuts. */
  const menuEntries = (c: Classified): MenuEntry[] => {
    const { item } = c;
    const planned = dated(c) !== null;
    const statuses: MenuEntry[] = statusesFor(c, doneIn(c) === "closed")
      .filter((s) => !(s.id === "done" && doneIn(c) === "hidden"))
      .map((s) => ({
      label: doneKind(s.id, c) === "handOff" ? t("action.handOff") : doneKind(s.id, c) === "file" ? t("action.file") : doneKind(s.id, c) === "clear" ? t("reminder.remove") : s.title,
      hint: statusHint(doneKind(s.id, c)),
      keys: s.key,
      icon: <StatusIcon status={s.id} size={14} />,
      checked: c.status === s.id && !(planned && s.id === "open"),
      onSelect: () => applyStatus(c, s.id),
      // Snoozing offers its dates as a submenu, also to change the date; "Open" brings it back.
      ...(s.id === "snoozed" && { items: snoozeEntries(c) }),
    }));
    const planItem: MenuEntry[] = pinnable(c) ? [{ label: t("menu.plan"), hint: t("hint.menu.plan"), keys: "P", icon: <CalendarDays size={14} />, checked: planned, items: planEntries(c) }] : [];
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
      ...(orcaOffered(c) ? [{ label: t(orca.repoOf(item.repo) ? "orca.open" : "orca.addOpen"), hint: t(orca.repoOf(item.repo) ? "hint.orca.open" : "hint.orca.addOpen"), keys: "W", icon: <OrcaMark size={16} />, onSelect: () => runOrca(c) }] : []),
      { label: t("menu.copyLink"), keys: "C", icon: <Link size={14} />, onSelect: () => void copy(itemLink(item, "url")) },
      { label: t("menu.copyRef"), hint: t("hint.menu.copyRef"), icon: <Hash size={14} />, onSelect: () => void copy(itemLink(item, "ref")) },
      { label: t("menu.copyMarkdown"), hint: t("hint.menu.copyMarkdown"), icon: <Code size={14} />, onSelect: () => void copy(itemLink(item, "markdown")) },
      { label: t("action.refreshItem"), keys: "⌃R", icon: <RefreshCw size={14} />, divided: true, onSelect: () => reloadCurrent(c) },
      // Out of the way in a submenu, so it is not hit by accident; ⌘Z still takes it back.
      { label: t("menu.more"), icon: <Ellipsis size={14} />, items: [{ label: t("untrack.action"), hint: t("hint.untrack.action"), onSelect: () => untrack(c) }] },
    ];
  };

  // Each morning "Today" keeps what is unfinished and takes in what was planned for it: checked on start and every few minutes while the app stays open.
  const { settings, saveSettings, ready, classified } = inbox;
  useEffect(() => {
    // Before the items are loaded, plans due today cannot move in and the day would be stamped without them.
    if (!ready || classified.length === 0) return;
    const check = () => {
      const day = localDay();
      setToday(day);
      const pinnable = (id: string) => classified.some((c) => c.item.id === id && isPinnable(c));
      const keeps = (id: string) => classified.some((c) => c.item.id === id && keepsPlan(c));
      const next = rollOver(settings, day, pinnable, (id) => classified.some((c) => c.item.id === id), keeps);
      if (next) void saveSettings({ ...settings, ...next });
    };
    check();
    const timer = window.setInterval(check, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [ready, settings, saveSettings, classified, me]);

  // A plan of an item closed on GitHub goes at once, not with the next day.
  const changeSettings = inbox.updateSettings;
  useEffect(() => {
    const closed = new Set(classified.filter((c) => c.item.closed).map((c) => c.item.id));
    if (closedPlans(settings, (id) => closed.has(id)).length === 0) return;
    void changeSettings((s) => ({ ...s, ...unplan(todayOf(s), closedPlans(s, (id) => closed.has(id))) }));
  }, [settings, classified, changeSettings]);

  const calendarAccess = useCalendarAccess(settings.calendarId);

  // A link whose item lost its pin or plan without a step of its own (closed, dropped overnight) goes; the event stays. Judged on the latest settings.
  useEffect(() => {
    if (!ready || !settings.calendarId || orphanLinks(settings).length === 0) return;
    void changeSettings((s) => {
      const orphans = orphanLinks(s);
      return orphans.length === 0 ? s : { ...s, calendarEvents: Object.fromEntries(Object.entries(s.calendarEvents).filter(([id]) => !orphans.some(([gone]) => gone === id))) };
    });
  }, [ready, settings, changeSettings]);

  // The pop-up belongs to its item: when the item leaves the list, it closes instead of showing the next one.
  // Its item left the table (D, a follow-up, a refresh): the successor is a row the viewer did not pick by mouse.
  if (popup && selection.replaced) {
    if (popup === "pointer") selection.select(null);
    setPopup(false);
  }
  const showPopup = popup && table && current !== null && !selection.replaced;
  /** Enter or Space on a row: its pop-up, as a click opens it. */
  const openPopup = () => setPopup("keys");
  useEffect(() => setLogContext({ view: bucket, popup: showPopup }), [bucket, showPopup]);
  // In a table a selected row shows nothing of the item; only its pop-up counts as opened.
  const openedId = !table || showPopup ? current?.item.id : undefined;
  const openedUpdatedAt = current?.item.updatedAt;
  const markSeen = inbox.markSeen;
  const windowFocused = useWindowFocus();
  useEffect(() => {
    if (!openedId || !windowFocused) return;
    const openedAt = new Date().toISOString();
    const timer = window.setTimeout(() => void markSeen(openedId, openedAt), SEEN_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [openedId, openedUpdatedAt, windowFocused, markSeen]);

  /** ⌘G: Assigned to me steps through type, status and repository bars, Created by me switches between status and repository, the lists between time groups and none. */
  const toggleGrouping = () => {
    if (!table) void saveSettings({ ...settings, groupByTime: !settings.groupByTime });
    else if (bucket === "assigned") setGrouping(ASSIGNED_GROUPINGS[(ASSIGNED_GROUPINGS.indexOf(tableGrouping) + 1) % ASSIGNED_GROUPINGS.length]);
    else if (bucket === "authored") setGrouping(tableGrouping === "repo" ? "status" : "repo");
  };

  useHotkeys(
    {
      ArrowDown: () => step(1),
      ArrowUp: () => step(-1),
      d: withCurrent((c) => applyStatus(c, "done")),
      f: withCurrent(snooze),
      o: withCurrent((c) => applyStatus(c, "open")),
      x: withCurrent(removeWhen),
      t: withCurrent((c) => (pinnable(c) ? toggleFocus(c) : actions.notify(t("noop.notPinnable", { number: c.item.number })))),
      p: withCurrent(plan),
      u: withCurrent((c) => toggleRead([c])),
      r: withCurrent((c) => toggleRead([c])),
      "mod+z": actions.undo,
      "mod+y": actions.redo,
      "ctrl+o": withCurrent((c) => void openUrl(c.item.url)),
      w: withCurrent(runOrca),
      "ctrl+a": withCurrent(assignMe),
      "ctrl+u": withCurrent((c) => leave(c)),
      c: withCurrent((c) => void copy(itemLink(c.item, "url"))),
      // Closes and clears, innermost first; filters and the view stay (they reset from the palette).
      Escape: () => (showPopup ? closePopup() : search !== null ? setSearch(null) : selection.select(null)),
      Enter: () => (selectedBar ? toggleBar(selectedBar) : table && current && openPopup()),
      " ": () => (selectedBar ? toggleBar(selectedBar) : showPopup ? closePopup() : table && current && openPopup()),
      ArrowRight: () => selectedBar && setBar(selectedBar, true),
      ArrowLeft: () => (selectedBar ? setBar(selectedBar, false) : !showPopup && foldCurrent()),
      // The web view walks buttons whatever the Mac's "Keyboard navigation" says; the app's own switch decides, in text fields too.
      ...(settings.tabToButtons ? {} : { Tab: () => undefined }),
      // Switches of the app, not of an item, so they go with ⌘.
      "mod+t": () => (asking && !table ? setAsk((f) => nextOf(ASK_FILTERS, f)) : setKind((k) => nextOf(KINDS.map((o) => o.id), k))),
      "mod+g": toggleGrouping,
      // The selected item alone; ⌘R refreshes everything.
      "ctrl+r": withCurrent(reloadCurrent),
      "mod+r": () => void inbox.refresh(),
      "mod+shift+r": () => void inbox.refresh(true),
      "mod+,": () => setDialog("settings"),
      "mod+k": () => setDialog("palette"),
      "mod+f": () => {
        if (!searchRef.current) return setSearch("");
        searchRef.current.focus();
        searchRef.current.select();
      },
      "?": () => setDialog("keys"),
      ...Object.fromEntries(views.map((b, i) => [String(i + 1), () => setBucket(b.id)])),
    },
    dialog === null && !welcome && !calendarFor && !pickingDate,
  );

  /** Shows an item in its view with every filter cleared, so it cannot be hidden by one. */
  const jumpTo = (c: Classified) => {
    setRepoFilter([]);
    setSprints({ assigned: "all", authored: "all", planned: "all", snoozed: "all" });
    if (kind !== "all" && kind !== c.item.kind) setKind("all");
    setAsk("all");
    setBucket(viewOf(c, me, doneIds.has(c.item.id)) ?? "inbox");
    setReveal(c.item.id);
    keyboardOwnsPopup();
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

  const menuEntriesNow = menu?.entries ?? (menu?.of && menuItem ? (menu.of.kind === "plan" ? planEntries : menuEntries)(menuItem) : null);
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
        calendarAccess={calendarAccess}
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
        settingsNew={unseenSettings(seenSettings.seen).length > 0}
        onRules={() => setDialog("help")}
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
          grouping={tableGrouping}
          groupings={bucket === "assigned" ? ASSIGNED_GROUPINGS : bucket === "authored" ? AUTHORED_GROUPINGS : undefined}
          onGrouping={setGrouping}
          collapsed={tableFolded}
          selectedBar={selectedBar}
          onSelectBar={(group) => selection.select(`bar:${group}`)}
          onToggle={toggleBar}
          sprint={sprints[bucket]}
          sprints={bucket === "assigned" ? plateSprints : bucket === "planned" ? plannedSprints : bucket === "snoozed" ? followUpSprints : authoredSprints}
          layout={byReturn ? layout : undefined}
          onLayout={(next) => (closePopup(), setLayout(next))}
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
          onMove={moveTableBar}
          seen={inbox.seen}
          unreadMarks={inbox.unreadMarks}
          movesUp={inbox.settings.movesUp}
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
          onSelect={selection.select}
          onOpen={() => setPopup("pointer")}
        />
      ) : (
        <InboxList
          timeOf={listTime}
          unread={bucket === "planned" ? unreadPlannedIds : bucket === "snoozed" ? unreadFollowUpIds : unreadInboxIds}
          datedOf={dated}
          pinnedOn={inbox.settings.pinnedOn}
          today={today}
          layout={byReturn ? layout : undefined}
          onLayout={(next) => (closePopup(), setLayout(next))}
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
          onSelect={selection.select}
          onOpen={(c) => void openUrl(c.item.url)}
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
            done={current ? doneIn(current) : "on"}
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
        <div className="overlay" onMouseDown={closePopup}>
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
                done={current ? doneIn(current) : "on"}
            onCopy={(format: LinkFormat) => current && void copy(itemLink(current.item, format))}
            onReload={() => current && reloadCurrent(current)}
            onOrca={current && orcaOffered(current) ? () => runOrca(current) : undefined}
            orcaHint={current ? orcaHint(current) : undefined}
            onAssignMe={() => current && assignMe(current)}
            onPlan={(at: DOMRect) => current && plan(current, at)}
            onSnooze={(at: DOMRect) => current && setSnoozeMenu({ entry: current, x: at.left, y: at.bottom + 4 })}
            onRemoveFollowUp={() => current && removeFollowUp(current)}
            reloading={reloading === current?.item.id}
                onClose={closePopup}
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
      {menu && menuEntriesNow && <ContextMenu x={menu.x} y={menu.y} centered={menu.centered} centerX={menu.centerX} fit={menu.fit} entries={menuEntriesNow} onClose={() => (setMenu(null), setNotifyChoice(null))} />}
      {snoozeMenu && (
        <ContextMenu x={snoozeMenu.x} y={snoozeMenu.y} centered={snoozeMenu.centered} centerX={snoozeMenu.centerX} fit entries={snoozeEntries(snoozeItem ?? snoozeMenu.entry)} onClose={() => (setSnoozeMenu(null), setNotifyChoice(null))} />
      )}
      {calendarFor && (
        <CalendarDay
          title={calendarFor.c.item.title}
          day={calendarFor.day}
          minutes={inbox.settings.calendarMinutes}
          workdays={inbox.settings.workdays}
          linked={calendarFor.linked}
          onSave={(day, start, end, title) => addToCalendar(calendarFor.c, calendarFor.linked, day, start, end, title)}
          onPlanOnly={(day) => planOnDay(calendarFor.c, day)}
          onClose={() => setCalendarFor(null)}
        />
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
          doneOff={!!current && doneIn(current) === "hidden"}
          doneOnly={!!current && doneIn(current) === "closed"}
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
          onRefreshFull={() => void inbox.refresh(true)}
          onSettings={() => setDialog("settings")}
          onToggleTheme={toggleTheme}
          history={actions.history}
          onUndoSteps={actions.undoSteps}
          onRedoSteps={actions.redoSteps}
          onSwitchDemo={canSwitchDemo() ? switchDemo : undefined}
          demo={isDemo()}
          onHelp={() => setDialog("keys")}
          onRules={() => setDialog("rules")}
          onResetFilters={resetFilters}
        />
      )}
      {(dialog === "help" || dialog === "rules" || dialog === "keys") && (
        <Help
          tab={dialog === "help" ? "guide" : dialog}
          reopenOn={inbox.settings.reopenOn}
          refreshMinutes={inbox.settings.refreshMinutes}
          onClose={() => setDialog(null)}
        />
      )}
      {(dialog === "settings" || welcome) && (
        <SettingsDialog
          settings={inbox.settings}
          welcome={welcome}
          onSave={(s) => void inbox.updateSettings((current) => ({ ...current, ...s, notifyCollected: current.notifyCollected, notifyLastSummary: current.notifyLastSummary }))}
          onClose={() => setDialog(null)}
          boards={boards}
          memberOrgs={inbox.memberOrgs}
          me={inbox.me}
          usage={inbox.usage}
          attributes={attributes}
          statusCount={inbox.statuses.size}
          onResetStatuses={inbox.resetStatuses}
          seenSettings={seenSettings.seen}
          onSeen={seenSettings.markSeen}
        />
      )}
    </div>
  );
}

const ASSIGNED_GROUPINGS: readonly TableGrouping[] = ["type", "status", "repo"];
const AUTHORED_GROUPINGS: readonly TableGrouping[] = ["status", "repo"];

/** The list in the view's chosen direction; lists come newest first. */
function oriented<T>(list: T[], order: SortOrder): T[] {
  return order === "oldest" ? [...list].reverse() : list;
}

function sortByRecency(entries: Classified[], timeOf: (c: Classified) => string): Classified[] {
  return [...entries].sort((a, b) => timeOf(b).localeCompare(timeOf(a)));
}

