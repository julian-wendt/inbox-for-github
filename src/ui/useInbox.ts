import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ghToken } from "../github/token";
import { classify, type Classified } from "../classify";
import { snoozeEnded } from "../reopen";
import { lastBudget, missingScopes, pointsSpent, RateLimitError, tokenScopes, type Budget, type Scope } from "../github/client";
import { canDelta, covers, decodeScope, DELTA_OVERLAP_MS, encodeScope, findTransfers, mergeDelta, mergeReloaded, transferCandidates, withinClosedWindow, type Coverage } from "../github/delta";
import { fetchBoards } from "../github/boards";
import { embedAvatar, fetchItem, fetchItems, fetchItemsById, fetchViewer } from "../github/fetch";
import { repoVisible } from "../repoFilter";
import { recentInput } from "./inputTrail";
import { snapshotOf } from "../handoff";
import { sameLogin } from "../timeline";
import type { Item, Org, Status, StatusChange, StoredStatus, StatusExtra, WriteFailure } from "../model";
import { ruleSwitches } from "../rules";
import { directOnly } from "../rules/directOnly";
import { log, logContext, setLogLevel } from "../log";
import { openStorage } from "../storage";
import { movedKeys, movedLists, movedSettings } from "../transfer";
import { DEFAULT_SETTINGS, type CachedFetch, type Persistence, type Settings } from "../store";


export interface Inbox {
  ready: boolean;
  loading: boolean;
  error: string | null;
  me: string | null;
  /** The viewer's display name from their GitHub profile, if set. */
  myName: string | null;
  /** The viewer's avatar as a data URL, kept with the cache; null until one was downloaded. */
  myAvatar: string | null;
  /** GitHub's GraphQL budget after the last refresh and what that refresh cost, in points. */
  usage: { budget: Budget | null; lastCost: number | null };
  /** Set while GitHub's hourly budget is nearly used up: automatic refreshes wait until then. */
  pausedUntil: Date | null;
  /** Required token scopes the current token lacks; empty when complete or unknown. */
  missingScopes: Scope[];
  /** Organizations the viewer belongs to, for the settings; empty until the first fetch. */
  memberOrgs: Org[];
  fetchedAt: Date | null;
  settings: Settings;
  classified: Classified[];
  /**
   * Loads what changed (a delta within an hour of the last full fetch), or with `full` everything,
   * which also catches what a delta misses. Resolves to true once the items are shown; false when
   * stopped, failed or not run.
   */
  refresh: (full?: boolean) => Promise<boolean>;
  /** Stops a running refresh; what was shown before stays. */
  stopRefresh: () => void;
  /** Reloads one item after the viewer changed it (comment, close, reopen), not the whole inbox; one GitHub no longer resolves leaves the cache (see `dropGone`). */
  reloadItem: (id: string) => Promise<void>;
  /** Reloads many items in few requests; resolves to how many came back. Those GitHub no longer resolves leave the cache, like in `reloadItem`. */
  reloadItems: (ids: string[]) => Promise<number>;
  /** Changes one item locally and in the cache, e.g. right after a write to GitHub. */
  updateItem: (id: string, change: (item: Item) => Item) => void;
  /** Item id → its status history, oldest first. */
  statusLog: Map<string, StatusChange[]>;
  /** Item id → when the viewer last opened it. */
  seen: Map<string, string>;
  /**
   * Records the item as opened now; it also takes back a mark as unread. With `openedAt`, an item
   * marked unread after that time stays unread, so a pending "seen" timer cannot undo the mark.
   */
  markSeen: (nodeId: string, openedAt?: string) => Promise<void>;
  /** Items the viewer marked unread by hand, with when, until they open them again. */
  unreadMarks: ReadonlyMap<string, string>;
  markUnread: (nodeId: string) => Promise<void>;
  /** Puts an item's read state back as it was (when it was last seen, when marked unread), for undoing U. */
  restoreRead: (nodeId: string, previous: { seen?: string; mark?: string }) => Promise<void>;
  /** Item id → the viewer's private note. */
  notes: Map<string, string>;
  saveNote: (nodeId: string, note: string) => Promise<void>;
  /** `extra.until` snoozes until a time. */
  setStatus: (nodeId: string, status: Status, extra?: StatusExtra) => Promise<void>;
  /** Drops an item's stored status, as if never set; it does not count as reopening. */
  clearStatus: (nodeId: string) => Promise<void>;
  /** Drops every stored status, so all items sort as if never filed; resolves to how many there were. */
  resetStatuses: () => Promise<number>;
  /** Puts back a stored status exactly as it was, or none; for undoing a change with extras. */
  restoreStatus: (nodeId: string, previous: StoredStatus | undefined) => Promise<void>;
  /** The classification as of now, for code that runs later (an undo) and must not see the render that scheduled it. */
  classifiedNow: () => Classified[];
  /** The stored statuses per item id. */
  statuses: Map<string, StoredStatus>;
  /** Failed writes to GitHub per item id, oldest first, for the timeline. */
  writeFailures: Map<string, WriteFailure[]>;
  logWriteFailure: (nodeId: string, kind: WriteFailure["kind"], error: string) => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  /** Saves a change built on the settings at the moment it runs; for callbacks that run later. */
  updateSettings: (change: (current: Settings) => Settings) => Promise<void>;
}

/**
 * Owns the app state: opens the local store, reads the token from the `gh` CLI, fetches the
 * items for the configured organizations and classifies them with the enabled rules.
 *
 * Statuses that a rule resets are deleted from the store as a side effect, so the reset sticks.
 * At start the last successful fetch comes from the store, so the list shows at once and also
 * without a connection; a failed fetch keeps it and sets `error`. Fetching starts once the store
 * is open and restarts whenever the organization list changes; it
 * repeats every `settings.refreshMinutes` minutes, or never when that is 0. Within an hour of a
 * full fetch for the same organizations, refreshes only load what changed (see `canDelta`). Narrowing
 * the closed window, the item limit or switching boards off filters the cached items instead of
 * refetching; widening them past what the cache covers fetches (switching boards on loads only them). When GitHub's hourly
 * GraphQL budget runs low, automatic refreshes wait for its reset (`pausedUntil`); ⌘R still works.
 *
 * @returns The current state and the actions the UI may call.
 */
/** Reloads the boards of all items alone (6 points per 50 items), e.g. after board fields were added to the cache. */
async function withBoards(token: string, items: Item[], signal: AbortSignal): Promise<Item[]> {
  const boards = await fetchBoards(token, items.map((i) => i.id), signal);
  return items.map((item) => ({ ...item, boards: boards.get(item.id) ?? [] }));
}

/** GraphQL points below which automatic refreshes wait for the hourly reset; one refresh costs about 100–300. */
const LOW_BUDGET = 400;

/** Page size for delta refreshes, which usually find only a handful of items. */
const DELTA_PAGE_SIZE = 20;

/** What a status change the viewer makes logs as its source: their latest input, or "unknown". */
const manualSource = () => recentInput() ?? "unknown";

/** `repo#number` for a log line; titles stay out of it. */
const ref = (item: Item) => `${item.repo}#${item.number}`;

/** Debug: a status change as `from → to`, whether a snooze date or handoff snapshot existed before and after, and its source. */
function logStatusChange(item: string, before: StoredStatus | undefined, after: StoredStatus | undefined, source: string | null): void {
  const state = (s: StoredStatus | undefined) => (s ? `${s.status}${s.until ? "+until" : ""}${s.handoff ? "+handoff" : ""}` : "none");
  log.debug("status change", { item, change: `${state(before)} → ${state(after)}`, source: source ?? "unknown", ...logContext(), build: __APP_COMMIT__ });
}

/** Verbose: which cached items a delta replaced, added or dropped. */
function logMerge(before: Item[], fetched: Item[], after: Item[]): void {
  const had = new Set(before.map((i) => i.id));
  const has = new Set(after.map((i) => i.id));
  log.verbose("delta merge", {
    replaced: fetched.filter((i) => had.has(i.id)).map(ref).join(","),
    added: fetched.filter((i) => !had.has(i.id)).map(ref).join(","),
    dropped: before.filter((i) => !has.has(i.id)).map(ref).join(","),
  });
}

/** Debug: which cached issues turned out to be transferred, as `old → new`. */
function logTransfers(before: Item[], fetched: Item[], moves: Map<string, string>): void {
  const refOf = (items: Item[], id: string) => {
    const found = items.find((i) => i.id === id);
    return found ? ref(found) : id;
  };
  log.debug("transferred", { items: [...moves].map(([from, to]) => `${refOf(before, from)} → ${refOf(fetched, to)}`).join(",") });
}

/** A "done" the viewer set on an open assignment before "my part done" existed, without a handoff. */
function legacyDone(c: Classified, viewer: string): boolean {
  const ownPr = c.item.kind === "pr" && sameLogin(c.item.author, viewer);
  return c.status === "done" && c.answered === null && !c.updates && !c.item.closed && !ownPr && c.item.reasons.includes("assigned");
}

export function useInbox(): Inbox {
  const [store, setStore] = useState<Persistence | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [statuses, setStatuses] = useState<Map<string, StoredStatus>>(new Map());
  const [writeFailures, setWriteFailures] = useState<Map<string, WriteFailure[]>>(new Map());
  const [statusLog, setStatusLog] = useState<Map<string, StatusChange[]>>(new Map());
  const [seen, setSeen] = useState<Map<string, string>>(new Map());
  const [unreadMarks, setUnreadMarks] = useState<Map<string, string>>(new Map());
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [items, setItems] = useState<Item[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [missing, setMissing] = useState<Scope[]>([]);
  const [paused, setPaused] = useState<Date | null>(null);
  const [usage, setUsage] = useState<Inbox["usage"]>({ budget: null, lastCost: null });
  const pausedRef = useRef<Date | null>(null);
  const pause = useCallback((until: Date | null) => {
    if (until && !pausedRef.current) log.debug("refreshes paused", { until: until.toISOString() });
    else if (!until && pausedRef.current) log.debug("refreshes resumed");
    pausedRef.current = until;
    setPaused(until);
  }, []);
  const noteBudget = useCallback(
    (budget: Budget | null) => pause(budget && budget.remaining < LOW_BUDGET && budget.resetAt.getTime() > Date.now() ? budget.resetAt : null),
    [pause],
  );
  // Read by `refresh` as a fallback without making it a dependency, which would refetch.
  const lastAvatar = useRef<string | null>(null);
  const [memberOrgs, setMemberOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const lastFetch = useRef<CachedFetch | null>(null);
  const storedStatuses = useRef(statuses);
  useEffect(() => {
    storedStatuses.current = statuses;
  }, [statuses]);
  useEffect(() => setLogLevel(settings.logging), [settings.logging]);
  /** Debug: one line per status change, with the state before and after (see `logStatusChange`). */
  const logChange = useCallback((nodeId: string, after: StoredStatus | undefined, source: string | null) => {
    const item = lastFetch.current?.items.find((i) => i.id === nodeId);
    logStatusChange(item ? ref(item) : nodeId, storedStatuses.current.get(nodeId), after, source);
  }, []);
  const running = useRef<AbortController | null>(null);
  // Read by `refresh` without being dependencies: narrowing them filters locally instead of refetching.
  const wanted = useRef<Coverage>({ closedDays: settings.closedDays, boards: settings.loadBoards, maxItems: settings.maxItems });
  useEffect(() => {
    wanted.current = { closedDays: settings.closedDays, boards: settings.loadBoards, maxItems: settings.maxItems };
  }, [settings.closedDays, settings.loadBoards, settings.maxItems]);

  const latestSettings = useRef(settings);
  useEffect(() => {
    latestSettings.current = settings;
  }, [settings]);

  /**
   * Carries the local state of transferred issues to their new ids, in the store; the returned
   * function moves the state, built on what it holds then, for the caller to run with the items.
   */
  const carryOver = useCallback(
    async (moves: ReadonlyMap<string, string>, items: Item[]) => {
      if (!store) return () => undefined;
      await store.moveItems(moves);
      const moved = movedSettings(latestSettings.current, moves, items);
      if (moved !== latestSettings.current) await store.saveSettings(moved);
      return () => {
        setSettings((current) => movedSettings(current, moves, items));
        setStatuses((current) => movedKeys(current, moves));
        setStatusLog((current) => movedLists(current, moves));
        setSeen((current) => movedKeys(current, moves));
        setUnreadMarks((current) => movedKeys(current, moves));
        setNotes((current) => movedKeys(current, moves));
        setWriteFailures((current) => movedLists(current, moves));
      };
    },
    [store],
  );

  const apply = (fetch: CachedFetch) => {
    const { viewer, items, fetchedAt } = fetch;
    lastFetch.current = fetch;
    setMe(viewer.login);
    setMyName(viewer.name);
    if (viewer.avatar) {
      lastAvatar.current = viewer.avatar;
      setMyAvatar(viewer.avatar);
    }
    setMemberOrgs(viewer.orgs);
    setItems(items);
    setFetchedAt(fetchedAt);
  };

  useEffect(() => {
    (async () => {
      const opened = await openStorage();
      const stored = await opened.settings();
      setLogLevel(stored.logging);
      log.debug("app started", { build: __APP_COMMIT__ });
      log.debug("store opened");
      setSettings(stored);
      setStatuses(await opened.statuses());
      setWriteFailures(await opened.writeFailures());
      setStatusLog(await opened.statusLog());
      setSeen(await opened.seen());
      setUnreadMarks(await opened.unreadMarks());
      setNotes(await opened.notes());
      const cached = await opened.cachedFetch();
      log.debug("cache loaded", { items: cached?.items.length ?? 0, fetchedAt: cached?.fetchedAt.toISOString(), fullAt: cached?.fullAt?.toISOString(), scope: cached?.scope });
      if (cached) apply(cached);
      setStore(opened);
    })().catch((e) => setError(String(e)));
  }, []);

  const refresh = useCallback(async (full = false): Promise<boolean> => {
    if (!store || settings.orgs.length === 0) return false;
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    const { signal } = controller;
    setLoading(true);
    setError(null);
    const mark = pointsSpent();
    const startedAt = Date.now();
    try {
      const token = await ghToken();
      void tokenScopes(token).then(
        (scopes) => {
          const lacking = missingScopes(scopes);
          log.debug("token scopes", { known: scopes !== null, missing: lacking.join(",") || "none" });
          setMissing(lacking);
        },
        () => undefined,
      );
      const viewer = await fetchViewer(token, signal);
      const want = wanted.current;
      const key = JSON.stringify([settings.orgs, viewer.login]);
      const last = lastFetch.current;
      const had = decodeScope(last?.scope);
      const delta = !full && !!last && had?.key === key && covers(had.coverage, want) && canDelta({ fullAt: last.fullAt, scope: had.key }, key);
      // A delta keeps what the cache covers, so a narrower setting does not shrink it; the view filters.
      const coverage: Coverage = delta ? { ...had.coverage, boards: want.boards } : want;
      const options = { limit: coverage.maxItems, closedDays: coverage.closedDays, me: viewer.login, boards: want.boards, signal };
      const fetched = delta
        ? await fetchItems(token, settings.orgs, { ...options, since: new Date(last.fetchedAt.getTime() - DELTA_OVERLAP_MS), pageSize: DELTA_PAGE_SIZE })
        : await fetchItems(token, settings.orgs, options);
      signal.throwIfAborted();
      const avatar = (await embedAvatar(viewer.avatarUrl, 40)) ?? lastAvatar.current ?? undefined;
      // Onto the items as they are now, so a change made while the refresh ran (e.g. assigning) stays.
      const before = lastFetch.current?.items ?? [];
      const moves = findTransfers(before, fetched);
      let items = (delta ? mergeDelta(before, fetched, coverage.closedDays) : fetched).filter((item) => !moves.has(item.id));
      if (delta) logMerge(before, fetched, items);
      if (moves.size > 0) logTransfers(before, fetched, moves);
      if (delta && want.boards && !had.coverage.boards) items = await withBoards(token, items, signal);
      const fetchedAt = new Date();
      const result: CachedFetch = {
        viewer: { ...viewer, avatar },
        items,
        fetchedAt,
        fullAt: delta ? last.fullAt : fetchedAt,
        scope: encodeScope(key, coverage),
      };
      const showMoved = moves.size > 0 ? await carryOver(moves, items) : null;
      showMoved?.();
      apply(result);
      await store.saveFetch(result);
      noteBudget(lastBudget());
      setUsage({ budget: lastBudget(), lastCost: pointsSpent() - mark });
      log.debug("refresh", { kind: delta ? "delta" : "full", fetched: fetched.length, items: items.length, ms: Date.now() - startedAt, cost: pointsSpent() - mark, remaining: lastBudget()?.remaining });
      log.debug("cache saved", { items: items.length });
      return true;
    } catch (e) {
      if (signal.aborted) return false;
      log.debug("refresh failed", { error: String(e), ms: Date.now() - startedAt });
      if (e instanceof RateLimitError) pause(e.until);
      setError(String(e));
      return false;
    } finally {
      if (running.current === controller) {
        running.current = null;
        setLoading(false);
      }
    }
  }, [store, settings.orgs, noteBudget, pause, carryOver]);

  const latestMarks = useRef(unreadMarks);
  useEffect(() => {
    latestMarks.current = unreadMarks;
  }, [unreadMarks]);
  const markSeen = useCallback(
    async (nodeId: string, openedAt?: string) => {
      if (!store) return;
      const marked = latestMarks.current.get(nodeId);
      if (openedAt && marked && marked > openedAt) return;
      const seenAt = await store.markSeen(nodeId);
      setSeen((current) => new Map(current).set(nodeId, seenAt));
      setUnreadMarks((current) => {
        if (!current.has(nodeId)) return current;
        const next = new Map(current);
        next.delete(nodeId);
        return next;
      });
    },
    [store],
  );

  const restoreRead = useCallback(
    async (nodeId: string, previous: { seen?: string; mark?: string }) => {
      if (!store) return;
      await store.restoreRead(nodeId, previous.seen, previous.mark);
      const put = (map: Map<string, string>, value: string | undefined) => {
        const next = new Map(map);
        if (value) next.set(nodeId, value);
        else next.delete(nodeId);
        return next;
      };
      setSeen((current) => put(current, previous.seen));
      setUnreadMarks((current) => put(current, previous.mark));
    },
    [store],
  );

  const markUnread = useCallback(
    async (nodeId: string) => {
      if (!store) return;
      const markedAt = await store.markUnread(nodeId);
      setUnreadMarks((current) => new Map(current).set(nodeId, markedAt));
    },
    [store],
  );

  const saveNote = useCallback(
    async (nodeId: string, note: string) => {
      if (!store) return;
      await store.saveNote(nodeId, note);
      setNotes((current) => {
        const next = new Map(current);
        if (note.trim()) next.set(nodeId, note);
        else next.delete(nodeId);
        return next;
      });
    },
    [store],
  );

  const stopRefresh = useCallback(() => {
    running.current?.abort();
    running.current = null;
    setLoading(false);
  }, []);

  /** Changes one cached item locally, e.g. right after a write, until the next fetch has it from GitHub. */
  const updateItem = useCallback(
    (id: string, change: (item: Item) => Item) => {
      const last = lastFetch.current;
      if (!store || !last) return;
      const next = { ...last, items: last.items.map((item) => (item.id === id ? change(item) : item)) };
      lastFetch.current = next;
      setItems(next.items);
      void store.saveFetch(next);
    },
    [store],
  );

  /**
   * Handles items GitHub no longer resolves and no cached item turned out to be their transferred
   * copy: a refresh first, which finds an issue transferred to a place not cached yet and carries
   * its state over, then what is still cached under these ids goes.
   * A refresh that fails or is stopped keeps them, so a later one can still pair them.
   */
  const dropGone = useCallback(
    async (ids: string[]) => {
      log.debug("items gone", { ids: ids.join(",") });
      if (!(await refresh())) return;
      const last = lastFetch.current;
      const gone = new Set(ids);
      if (!store || !last?.items.some((item) => gone.has(item.id))) return;
      const next = { ...last, items: last.items.filter((item) => !gone.has(item.id)) };
      lastFetch.current = next;
      setItems(next.items);
      await store.saveFetch(next);
    },
    [store, refresh],
  );

  /**
   * Puts items loaded by id into the cache, with everything GitHub's answer shows: an item that
   * names `transferredFrom` replaces its cached old copy and takes its state over. For ids GitHub
   * no longer resolves, cached issues that may be their transferred copy are loaded too (see
   * `transferCandidates`); what still has no new place goes through `dropGone`.
   */
  const takeReloaded = useCallback(
    async (token: string, ids: string[], loaded: Item[]) => {
      const last = lastFetch.current;
      if (!store || !last) return;
      let fresh = loaded;
      const missing = ids.filter((id) => !fresh.some((item) => item.id === id));
      const candidates = transferCandidates(last.items, missing).filter((id) => !ids.includes(id));
      if (candidates.length > 0) fresh = [...fresh, ...(await fetchItemsById(token, candidates, { me: last.viewer.login, boards: settings.loadBoards }))];
      const moves = findTransfers(last.items, fresh);
      if (moves.size > 0) logTransfers(last.items, fresh, moves);
      const showMoved = moves.size > 0 ? await carryOver(moves, fresh) : null;
      const current = lastFetch.current ?? last;
      const next = { ...current, items: mergeReloaded(current.items, fresh, moves) };
      lastFetch.current = next;
      showMoved?.();
      setItems(next.items);
      await store.saveFetch(next);
      const gone = missing.filter((id) => !moves.has(id));
      if (gone.length > 0) await dropGone(gone);
    },
    [store, settings.loadBoards, carryOver, dropGone],
  );

  const reloadItem = useCallback(
    async (id: string) => {
      const last = lastFetch.current;
      if (!store || !last) return;
      try {
        const token = await ghToken();
        const fresh = await fetchItem(token, id, { me: last.viewer.login, boards: settings.loadBoards });
        await takeReloaded(token, [id], fresh ? [fresh] : []);
      } catch (e) {
        if (e instanceof RateLimitError) pause(e.until);
        setError(String(e));
      }
    },
    [store, settings.loadBoards, pause, takeReloaded],
  );

  const reloadItems = useCallback(
    async (ids: string[]) => {
      const last = lastFetch.current;
      if (!store || !last || ids.length === 0) return 0;
      try {
        const token = await ghToken();
        const fresh = await fetchItemsById(token, ids, { me: last.viewer.login, boards: settings.loadBoards });
        await takeReloaded(token, ids, fresh);
        return fresh.length;
      } catch (e) {
        if (e instanceof RateLimitError) pause(e.until);
        setError(String(e));
        return 0;
      }
    },
    [store, settings.loadBoards, pause, takeReloaded],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on mount and on org changes is the point; the loading flag must flip at once
    void refresh();
  }, [refresh]);

  // Widening a setting past what the cache covers fetches; narrowing it only filters (`shown`).
  useEffect(() => {
    const had = decodeScope(lastFetch.current?.scope);
    const want = { closedDays: settings.closedDays, boards: settings.loadBoards, maxItems: settings.maxItems };
    if (!had || (covers(had.coverage, want) && (!want.boards || had.coverage.boards))) return;
     
    void refresh();
  }, [settings.closedDays, settings.loadBoards, settings.maxItems, refresh]);

  useEffect(() => {
    if (settings.refreshMinutes <= 0) return;
    const tick = () => {
      const until = pausedRef.current;
      if (!until || until.getTime() <= Date.now()) void refresh();
    };
    const timer = window.setInterval(tick, settings.refreshMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [refresh, settings.refreshMinutes]);

  // Snooze dates pass without any fetch; a minute's tick lets them bring items back on time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const classified = useMemo(() => {
    if (!me) return [];
    const switches = ruleSwitches(settings.rules);
    const untracked = new Set(settings.untracked.map((u) => u.id));
    // A plan counts while the item is pinned or planned; a time left behind by a dropped pin does not.
    const dated = new Set([...settings.focus, ...settings.planned.map((p) => p.id)]);
    // The cache may hold more than the settings ask for (see `Coverage`); show only that.
    return withinClosedWindow(items, settings.closedDays)
      .filter((item) => repoVisible(item.repo, settings.repoFilters) && !untracked.has(item.id))
      .map((item) => directOnly(item, me, settings.directOnly))
      .map((item) => (settings.loadBoards ? item : { ...item, boards: [] }))
      .map((item) => classify(item, me, statuses.get(item.id), switches, settings.reopenOn, now, settings.reviewOnCommits, dated.has(item.id) ? settings.plannedAt[item.id] : undefined));
  }, [items, me, statuses, settings.rules, settings.reopenOn, settings.reviewOnCommits, settings.repoFilters, settings.directOnly, settings.untracked, settings.closedDays, settings.loadBoards, settings.focus, settings.planned, settings.plannedAt, now]);

  const writeStatus = useCallback(
    async (nodeId: string, status: Status, automatic: boolean, extra: StatusExtra = {}, source = manualSource()) => {
      if (!store) return;
      const { stored, change } = await store.setStatus(nodeId, status, automatic, undefined, extra, source);
      logChange(nodeId, stored, source);
      setStatuses((current) => new Map(current).set(nodeId, stored));
      setStatusLog((current) => new Map(current).set(nodeId, [...(current.get(nodeId) ?? []), change]));
    },
    [store, logChange],
  );
  const setStatus = useCallback((nodeId: string, status: Status, extra: StatusExtra = {}) => writeStatus(nodeId, status, false, extra), [writeStatus]);

  /** Records a failed write to GitHub, which then shows in the item's timeline. */
  const logWriteFailure = useCallback(
    async (nodeId: string, kind: WriteFailure["kind"], error: string) => {
      if (!store) return;
      const failure = await store.addWriteFailure(nodeId, kind, error);
      setWriteFailures((current) => new Map(current).set(nodeId, [...(current.get(nodeId) ?? []), failure]));
    },
    [store],
  );

  /** Drops the stored status at the viewer's request, as if never set (see `Store.clearStatus`). */
  const clearStatus = useCallback(
    async (nodeId: string) => {
      if (!store) return;
      const source = manualSource();
      const change = await store.clearStatus(nodeId, undefined, source);
      logChange(nodeId, undefined, `clearStatus:${source}`);
      setStatuses((current) => {
        const next = new Map(current);
        next.delete(nodeId);
        return next;
      });
      setStatusLog((current) => new Map(current).set(nodeId, [...(current.get(nodeId) ?? []), change]));
    },
    [store, logChange],
  );

  /** Drops all stored statuses at the viewer's request (see `Store.resetStatuses`). */
  const resetStatuses = useCallback(async () => {
    if (!store) return 0;
    const cleared = await store.resetStatuses(undefined, "settings:reset");
    log.debug("statuses reset", { count: cleared.size, source: "settings:reset" });
    setStatuses(new Map());
    setStatusLog((current) => {
      const next = new Map(current);
      for (const [id, change] of cleared) next.set(id, [...(next.get(id) ?? []), change]);
      return next;
    });
    return cleared.size;
  }, [store]);

  /** Takes back the last status change exactly, extras and time included (see `Store.restoreStatus`). */
  const restoreStatus = useCallback(
    async (nodeId: string, previous: StoredStatus | undefined) => {
      if (!store) return;
      await store.restoreStatus(nodeId, previous);
      logChange(nodeId, previous, `restore:${manualSource()}`);
      setStatuses((current) => {
        const next = new Map(current);
        if (previous) next.set(nodeId, previous);
        else next.delete(nodeId);
        return next;
      });
      setStatusLog((current) => new Map(current).set(nodeId, (current.get(nodeId) ?? []).slice(0, -1)));
    },
    [store, logChange],
  );

  const converting = useRef(new Set<string>());

  useEffect(() => {
    for (const c of classified) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- writes the store first; state follows only after that await
      if (c.statusReset) void writeStatus(c.item.id, "open", true, {}, snoozeEnded(statuses.get(c.item.id), now) ? "auto:snooze-ended" : "auto:reopen");
      if (me && legacyDone(c, me) && !converting.current.has(c.item.id)) {
        // A "done" on an assignment from before "my part done" becomes one, from now on.
        converting.current.add(c.item.id);
        void writeStatus(c.item.id, "done", true, { handoff: snapshotOf(c.item) }, "auto:legacy-done");
      }
    }
  }, [classified, writeStatus, me, statuses, now]);

  const latestClassified = useRef(classified);
  useEffect(() => {
    latestClassified.current = classified;
  });
  const classifiedNow = useCallback(() => latestClassified.current, []);

  const logged = useRef(new Map<string, string>());
  useEffect(() => {
    for (const c of classified) {
      const why = `${c.bucket} asks=${c.asks.join("+") || "none"} status=${c.status} answered=${c.answered ?? "no"}${c.statusReset ? " reset" : ""}`;
      if (logged.current.get(c.item.id) === why) continue;
      logged.current.set(c.item.id, why);
      log.verbose("classify", { item: ref(c.item), why, reasons: c.item.reasons.join("+"), title: c.item.title });
    }
  }, [classified]);

  const saveSettings = useCallback(
    async (next: Settings) => {
      if (!store) return;
      await store.saveSettings(next);
      setSettings(next);
    },
    [store],
  );

  const updateSettings = useCallback(
    (change: (current: Settings) => Settings) => {
      // Set at once, so a second update in the same tick builds on this one instead of the last render.
      latestSettings.current = change(latestSettings.current);
      return saveSettings(latestSettings.current);
    },
    [saveSettings],
  );

  return {
    ready: store !== null,
    loading,
    error,
    me,
    myName,
    myAvatar,
    missingScopes: missing,
    pausedUntil: paused,
    usage,
    memberOrgs,
    fetchedAt,
    settings,
    classified,
    refresh,
    stopRefresh,
    reloadItem,
    reloadItems,
    updateItem,
    statusLog,
    seen,
    markSeen,
    unreadMarks,
    markUnread,
    restoreRead,
    classifiedNow,
    notes,
    saveNote,
    setStatus,
    clearStatus,
    resetStatuses,
    restoreStatus,
    statuses,
    writeFailures,
    logWriteFailure,
    saveSettings,
    updateSettings,
  };
}
