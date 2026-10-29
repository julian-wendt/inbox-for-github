import Database from "@tauri-apps/plugin-sql";
import type { Viewer } from "./github/fetch";
import type { LogLevel } from "./log";
import type { Handoff, Item, Reopen, Status, StatusChange, StoredStatus, StatusExtra, WriteFailure } from "./model";
import { REOPEN_DEFAULT } from "./reopen";
import type { RepoFilter } from "./repoFilter";
import { MOVES_UP_DEFAULT, type MovesUp, type PlateGroup } from "./ui/assignments";
import type { Planned } from "./ui/plan";
import type { NotifyReason } from "./ui/attention";
import type { AttributeSetting } from "./ui/attributes";
import { DEFAULT_DELIVERY, type Delivery } from "./ui/delivery";
import type { Lang } from "./ui/i18n";
import type { Theme } from "./ui/theme";
import type { StatusMap } from "./workStatus";

/** Lives in the app's config directory, `~/Library/Application Support/<bundle id>/` on macOS. */
const DB_URL = "sqlite:tracker.db";

/** Bump when `Item` changes shape, so a cache in the old shape is ignored instead of misread. */
const CACHE_VERSION = 2;

/** The last successful fetch, kept to show something at start and while GitHub is unreachable. */
export interface CachedFetch {
  viewer: Viewer;
  items: Item[];
  fetchedAt: Date;
  /** The last full fetch; later fetches up to an hour on may be deltas (see `canDelta`). */
  fullAt?: Date;
  /** The settings the items were fetched for; other settings need a full fetch. */
  scope?: string;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS item_status (
     node_id    TEXT PRIMARY KEY,
     status     TEXT NOT NULL,
     changed_at TEXT NOT NULL,
     until      TEXT,
     due        INTEGER NOT NULL DEFAULT 0,
     handoff    TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS status_log (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     node_id    TEXT NOT NULL,
     status     TEXT NOT NULL,
     changed_at TEXT NOT NULL,
     automatic  INTEGER NOT NULL DEFAULT 0,
     source     TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS status_log_node ON status_log (node_id)`,
  `CREATE TABLE IF NOT EXISTS item_cache (
     id         INTEGER PRIMARY KEY CHECK (id = 1),
     version    INTEGER NOT NULL,
     viewer     TEXT NOT NULL,
     items      TEXT NOT NULL,
     fetched_at TEXT NOT NULL,
     full_at    TEXT,
     scope      TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS item_seen (
     node_id TEXT PRIMARY KEY,
     seen_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS item_unread (
     node_id   TEXT PRIMARY KEY,
     marked_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS item_note (
     node_id    TEXT PRIMARY KEY,
     note       TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS item_write_failure (
     id      INTEGER PRIMARY KEY AUTOINCREMENT,
     node_id TEXT NOT NULL,
     kind    TEXT NOT NULL,
     at      TEXT NOT NULL,
     error   TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
];

/**
 * Removes what databases of earlier builds still hold and nothing reads any more: the reminders
 * table, the `keep_open` column of `item_status` and the settings `snoozeAuthored` and `orbSeeds`. Does nothing
 * on a database created by `SCHEMA`, so it is safe on every start.
 *
 * @example
 *   for (const statement of SCHEMA) await db.execute(statement);
 *   await dropLeftovers(db);
 */
async function dropLeftovers(db: Database): Promise<void> {
  await db.execute("DROP TABLE IF EXISTS item_reminder");
  await db.execute("DELETE FROM settings WHERE key IN ('snoozeAuthored', 'orbSeeds')");
  const statusColumns = await db.select<{ name: string }[]>("PRAGMA table_info(item_status)");
  if (statusColumns.some((c) => c.name === "keep_open")) await db.execute("ALTER TABLE item_status DROP COLUMN keep_open");
}

/** Where an opened item starts: at the top, at the relevant spot (see `DetailBody`), or at the latest entries. */
export type OpenAt = "top" | "relevant" | "latest";

/** How the detail shows an item's description: only its header (opens on a click), the whole text, or a fixed height that fades out with "Show more". */
export type DescriptionMode = "collapsed" | "full" | "expandable";

/** Bot comments start folded to their first line, open, or are left out. */
export type BotComments = "folded" | "open" | "hidden";

export interface Settings {
  /** Owner logins to watch: organizations, and the viewer's own login for their personal repositories. */
  orgs: string[];
  /** Rule id → enabled; missing ids fall back to the rule's default. */
  rules: Record<string, boolean>;
  theme: Theme;
  /** Show the relevant person's avatar at the start of each list row. */
  /** The interface language; English unless chosen otherwise. */
  language: Lang;
  avatars: boolean;
  /** Project ids of boards whose status and sprint stay out of the detail. */
  hiddenBoards: string[];
  /** Organization login → which of its repos to show; organizations without an entry show all. */
  repoFilters: Record<string, RepoFilter>;
  /** Organization login → names of the repos where review requests that came only through a team are ignored. */
  directOnly: Record<string, string[]>;
  /** What brings a "Wartet auf andere" or "Erledigt" item back to "Offen". */
  reopenOn: Reopen;
  /** A pull request the viewer reviewed comes back into the inbox when someone else pushes to it (see `pushedSinceReview`). */
  reviewOnCommits: boolean;
  /** Which activity besides others' posts and reviews moves an item up in its list. */
  movesUp: MovesUp;
  /** Minutes between automatic refreshes; 0 refreshes only on demand. */
  refreshMinutes: number;
  /** A native notification for each item that newly enters the inbox. */
  notifications: boolean;
  /** Reason → whether it notifies (see `notifyReason`); reasons without an entry do. */
  notifyOn: Partial<Record<NotifyReason, boolean>>;
  /** Also notify while the app's window is in front; off, the list shows new items anyway. */
  notifyInFront: boolean;
  /** When notifications may arrive: at once, within working hours, or as summaries at fixed times. */
  notifyDelivery: Delivery;
  /** Ids of the items collected while notifications waited for their summary; kept across restarts. */
  notifyCollected: string[];
  /** When the last summary went out, ISO 8601; null until the first one is due. */
  notifyLastSummary: string | null;
  /** The dock badge counts the unread items in the inbox. */
  dockBadge: boolean;
  /** Comments the detail shows before folding older ones away; 0 shows all. */
  recentComments: number;
  /** The Assigned to me table groups its bars by issue type or by work status. "time" and "repo" are no longer offered and read as "type". */
  tableGrouping: "type" | "status" | "time" | "repo";
  /** The sidebar shows item counts next to the views, and next to the repositories. */
  viewCounts: boolean;
  repoCounts: boolean;
  /** "Refresh the items of this view" (right click in the sidebar) loads only the items of the picked repositories; off loads the whole view. */
  refreshInRepos: boolean;
  /** Lists show time headings (today, yesterday, this week, …). */
  groupByTime: boolean;
  /** Keys act on the row under the mouse rather than the selected one, until the arrow keys move again. */
  hoverActs: boolean;
  /** Where the detail view starts when an item opens. */
  openAt: OpenAt;
  /** How the description card of the detail shows its text; see `DescriptionMode`. */
  descriptionMode: DescriptionMode;
  /** How the detail shows comments by bots. */
  botComments: BotComments;
  /** The comment box stays at the bottom of the detail instead of scrolling with the thread. */
  stickyReply: boolean;
  /** Most items loaded per search (involved, review requested) and refresh. */
  maxItems: number;
  /** Items the viewer stopped tracking: left out everywhere, whatever happens on GitHub. */
  untracked: UntrackedItem[];
  /** Item ids marked "today" (T), at most three; any open item in any view. */
  focus: string[];
  /** The local date ("2026-10-23") Today was last set or rolled over to (see `rollOver`). */
  focusDay: string | null;
  /** Items planned for a later day (P); on that day they move into Today (see `rollOver`). */
  planned: Planned[];
  /** Per pinned item, the local date it came into Today; an earlier day than today marks it as carried over. */
  pinnedOn: Record<string, string>;
  /** Per pinned or planned item, when it was last pinned or planned (ISO 8601); only an ask since then shows it in the inbox (see `classify`). */
  plannedAt: Record<string, string>;
  /** The local time ("09:00", 24-hour) a follow-up for a day comes back at (see `followUpOn`). */
  followUpTime: string;
  /** The calendar (`calendarIdentifier` in EventKit) planned items go into; empty: none. */
  calendarId: string;
  /** Where a new calendar event starts on its day ("09:00", 24-hour), before it is dragged to a free time. */
  calendarTime: string;
  /** How long a new calendar event is, in minutes. */
  calendarMinutes: number;
  /** The days that count as workdays for Plan and Follow-up, as `Date.getDay` numbers (Sunday 0; see `dayChoices`). */
  workdays: number[];
  /** The attributes of the Assigned to me table in the viewer's order, with their switches; null until changed (see `resolveAttributes`). */
  tableAttributes: AttributeSetting[] | null;
  /** Per table, its own attribute switches from its header menu; attributes without one follow `tableAttributes`. */
  tableColumns: Partial<Record<"assigned" | "authored" | "planned", Record<string, boolean>>>;
  /** The attributes of the detail view's meta line, like `tableAttributes`, in the same order. */
  detailAttributes: AttributeSetting[] | null;
  /** The order of the bars in Assigned to me; bars left out follow in their default order. */
  plateOrder: PlateGroup[];
  /** Per board, how its status values map to work statuses; values left out are guessed (see `workStatusOf`). */
  statusMap: StatusMap;
  /** Load status and sprint from GitHub Projects boards; off saves a query per refresh. */
  loadBoards: boolean;
  /** Days that closed and merged items stay under "done"; 0 loads open items only. */
  closedDays: number;
  /** Where "Open in Orca" looks for a checkout of a repo Orca lacks and clones it otherwise ("~" allowed); empty: the folder most of Orca's repos sit in. */
  repoFolder: string;
  /** What the app writes to its log file (see `log`); off writes nothing. */
  logging: LogLevel;
  /** Login → the orb look that person has, held by nobody else (see `assignLooks`); logins without one get a free look when their avatar first shows an orb. */
  orbLooks: Record<string, number>;
}

/** An untracked item, with enough to list it in the settings after it left the cache. */
export interface UntrackedItem {
  id: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  at: string;
}

export const DEFAULT_SETTINGS: Settings = { orgs: [], rules: {}, theme: "system", language: "en", avatars: true, hiddenBoards: [], repoFilters: {}, directOnly: {}, reopenOn: REOPEN_DEFAULT, reviewOnCommits: true, movesUp: MOVES_UP_DEFAULT, refreshMinutes: 5, notifications: true, notifyOn: {}, notifyInFront: false, notifyDelivery: DEFAULT_DELIVERY, notifyCollected: [], notifyLastSummary: null, dockBadge: true, recentComments: 8, botComments: "folded", openAt: "top", descriptionMode: "collapsed", groupByTime: true, hoverActs: true, viewCounts: true, repoCounts: true, refreshInRepos: true, tableGrouping: "type", stickyReply: false, maxItems: 200, untracked: [], focus: [], focusDay: null, planned: [], pinnedOn: {}, plannedAt: {}, followUpTime: "09:00", workdays: [1, 2, 3, 4, 5], calendarId: "", calendarTime: "09:00", calendarMinutes: 60, statusMap: {}, plateOrder: [], tableAttributes: null, tableColumns: {}, detailAttributes: null, loadBoards: true, closedDays: 7, repoFolder: "", logging: "off", orbLooks: {} };

/**
 * Local persistence for manual statuses, settings and the last fetch. Nothing here is ever sent
 * to GitHub.
 *
 * Open it once with `Store.open()`; the schema is created on first use.
 *
 * @example
 *   const store = await Store.open();
 *   await store.setStatus("I_kwDOAbc", "done");
 *   const statuses = await store.statuses(); // Map { "I_kwDOAbc" => { status: "done", changedAt } }
 *   const history = await store.statusLog(); // Map { "I_kwDOAbc" => [{ status: "done", at, automatic: false }] }
 */
export class Store {
  private constructor(private readonly db: Database) {}

  static async open(): Promise<Store> {
    const db = await Database.load(DB_URL);
    for (const statement of SCHEMA) await db.execute(statement);
    await dropLeftovers(db);
    return new Store(db);
  }

  async statuses(): Promise<Map<string, StoredStatus>> {
    const rows = await this.db.select<{ node_id: string; status: StoredStatus["status"]; changed_at: string; until: string | null; handoff: string | null }[]>(
      "SELECT node_id, status, changed_at, until, handoff FROM item_status",
    );
    return new Map(
      rows.map((r) => [
        r.node_id,
        { status: r.status, changedAt: r.changed_at, ...(r.until && { until: r.until }), ...(r.handoff && { handoff: JSON.parse(r.handoff) as Handoff }) },
      ]),
    );
  }

  /** Every logged status change, per item id, oldest first. */
  async statusLog(): Promise<Map<string, StatusChange[]>> {
    const rows = await this.db.select<{ node_id: string; status: Status; changed_at: string; automatic: number; source: string | null }[]>(
      "SELECT node_id, status, changed_at, automatic, source FROM status_log ORDER BY id",
    );
    const log = new Map<string, StatusChange[]>();
    for (const r of rows) log.set(r.node_id, [...(log.get(r.node_id) ?? []), { status: r.status, at: r.changed_at, automatic: r.automatic === 1, ...(r.source && { source: r.source }) }]);
    return log;
  }

  /**
   * Sets the manual status of an item and logs the change. "open" is stored too: it returns the
   * item to the automatic buckets and, by its time, makes earlier answers to a review request no
   * longer count.
   *
   * @param automatic  True when the app reopens the item by the "reopenOn" setting, not the viewer.
   * @param extra      `until` with "snoozed" brings it back at that time; `handoff` with "done"
   *                   ends the viewer's part of an assignment, keeping how the item looked.
   * @param source     What caused the change, for tracing it later: the input ("key:o", "menu",
   *                   "palette", "click") or the code path ("auto:reopen"); null when unknown.
   * @returns The stored status and its log entry.
   */
  async setStatus(nodeId: string, status: Status, automatic = false, now = new Date(), extra: StatusExtra = {}, source: string | null = null): Promise<{ stored: StoredStatus; change: StatusChange }> {
    const changedAt = now.toISOString();
    await this.writeStatus(nodeId, status, changedAt, extra);
    await this.db.execute("INSERT INTO status_log (node_id, status, changed_at, automatic, source) VALUES ($1, $2, $3, $4, $5)", [nodeId, status, changedAt, automatic ? 1 : 0, source]);
    return {
      stored: { status, changedAt, ...(extra.until && { until: extra.until }), ...(extra.handoff && { handoff: extra.handoff }) },
      change: { status, at: changedAt, automatic, ...(source && { source }) },
    };
  }

  /**
   * Takes back the last status change of an item: sets `previous` again and drops the newest log
   * entry, so an undone key press leaves no trace in the history.
   *
   * @returns The stored status.
   */
  async undoStatus(nodeId: string, previous: Status, now = new Date()): Promise<StoredStatus> {
    const changedAt = now.toISOString();
    await this.writeStatus(nodeId, previous, changedAt);
    await this.db.execute("DELETE FROM status_log WHERE id = (SELECT MAX(id) FROM status_log WHERE node_id = $1)", [nodeId]);
    return { status: previous, changedAt };
  }

  /**
   * Puts an item's stored status back exactly as it was before the last change, or removes it
   * when there was none, and drops that change's log entry. Unlike `undoStatus` it keeps the
   * old time and extras, such as a handoff's snapshot.
   */
  async restoreStatus(nodeId: string, previous: StoredStatus | undefined): Promise<void> {
    if (previous) await this.writeStatus(nodeId, previous.status, previous.changedAt, previous);
    else await this.db.execute("DELETE FROM item_status WHERE node_id = $1", [nodeId]);
    await this.db.execute("DELETE FROM status_log WHERE id = (SELECT MAX(id) FROM status_log WHERE node_id = $1)", [nodeId]);
  }

  private async writeStatus(nodeId: string, status: Status, changedAt: string, extra: StatusExtra = {}): Promise<void> {
    await this.db.execute(
      `INSERT INTO item_status (node_id, status, changed_at, until, handoff) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (node_id) DO UPDATE SET status = excluded.status, changed_at = excluded.changed_at, until = excluded.until, handoff = excluded.handoff`,
      [nodeId, status, changedAt, extra.until ?? null, extra.handoff ? JSON.stringify(extra.handoff) : null],
    );
  }

  /**
   * Drops the manual status of an item, so it is classified as if never set, and logs the change
   * as an automatic "open". Unlike `setStatus(…, "open")` it does not count as a reopen.
   * `source` is logged as for `setStatus`.
   */
  async clearStatus(nodeId: string, now = new Date(), source: string | null = null): Promise<StatusChange> {
    const at = now.toISOString();
    await this.db.execute("DELETE FROM item_status WHERE node_id = $1", [nodeId]);
    await this.db.execute("INSERT INTO status_log (node_id, status, changed_at, automatic, source) VALUES ($1, 'open', $2, 1, $3)", [nodeId, at, source]);
    return { status: "open", at, automatic: true };
  }

  /**
   * Drops every stored status at once, so all items are classified as if never filed, and logs
   * each as an automatic "open" like `clearStatus`. Notes, "seen" times and the log
   * itself stay.
   *
   * @param source  Logged with each change, e.g. "settings:reset".
   * @returns The log entry per item that had a status.
   *
   * @example
   *   const cleared = await store.resetStatuses(new Date(), "settings:reset"); // Map { "I_kwDOAbc" => { status: "open", … } }
   */
  async resetStatuses(now = new Date(), source: string | null = null): Promise<Map<string, StatusChange>> {
    const at = now.toISOString();
    const rows = await this.db.select<{ node_id: string }[]>("SELECT node_id FROM item_status");
    await this.db.execute("INSERT INTO status_log (node_id, status, changed_at, automatic, source) SELECT node_id, 'open', $1, 1, $2 FROM item_status", [at, source]);
    await this.db.execute("DELETE FROM item_status");
    const change: StatusChange = { status: "open", at, automatic: true };
    return new Map(rows.map((r) => [r.node_id, change]));
  }

  /**
   * Carries everything stored per item from each old node id to its new one, for issues that
   * were transferred (see `findTransfers`): status, status log, note, seen, unread mark and
   * failed writes. A row the new id already has wins over the old one, which goes; log entries
   * and failures of both stay. Settings that name items are the caller's (see `movedSettings`).
   *
   * @param moves  Old node id → new node id.
   *
   * @example
   *   await store.moveItems(new Map([["I_kwDOOld", "I_kwDONew"]]));
   */
  async moveItems(moves: ReadonlyMap<string, string>): Promise<void> {
    for (const [from, to] of moves) {
      for (const table of ["item_status", "item_note", "item_seen", "item_unread"]) {
        await this.db.execute(`UPDATE OR IGNORE ${table} SET node_id = $2 WHERE node_id = $1`, [from, to]);
        await this.db.execute(`DELETE FROM ${table} WHERE node_id = $1`, [from]);
      }
      for (const table of ["status_log", "item_write_failure"]) await this.db.execute(`UPDATE ${table} SET node_id = $2 WHERE node_id = $1`, [from, to]);
    }
  }

  /** The viewer's private notes per item; they never leave this Mac. */
  async notes(): Promise<Map<string, string>> {
    const rows = await this.db.select<{ node_id: string; note: string }[]>("SELECT node_id, note FROM item_note");
    return new Map(rows.map((r) => [r.node_id, r.note]));
  }

  /** Saves a note; an empty one is deleted. */
  async saveNote(nodeId: string, note: string, now = new Date()): Promise<void> {
    if (!note.trim()) {
      await this.db.execute("DELETE FROM item_note WHERE node_id = $1", [nodeId]);
      return;
    }
    await this.db.execute(
      "INSERT INTO item_note (node_id, note, updated_at) VALUES ($1, $2, $3) ON CONFLICT (node_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at",
      [nodeId, note, now.toISOString()],
    );
  }

  /** Writes to GitHub that failed, per item id, oldest first. */
  async writeFailures(): Promise<Map<string, WriteFailure[]>> {
    const rows = await this.db.select<{ node_id: string; kind: WriteFailure["kind"]; at: string; error: string }[]>("SELECT node_id, kind, at, error FROM item_write_failure ORDER BY id");
    const failures = new Map<string, WriteFailure[]>();
    for (const r of rows) failures.set(r.node_id, [...(failures.get(r.node_id) ?? []), { kind: r.kind, at: r.at, error: r.error }]);
    return failures;
  }

  /** Records a failed write to GitHub for the item's timeline. */
  async addWriteFailure(nodeId: string, kind: WriteFailure["kind"], error: string, now = new Date()): Promise<WriteFailure> {
    const at = now.toISOString();
    await this.db.execute("INSERT INTO item_write_failure (node_id, kind, at, error) VALUES ($1, $2, $3, $4)", [nodeId, kind, at, error]);
    return { kind, at, error };
  }

  /** When the viewer last opened each item, for "new activity" in Assigned to me. */
  async seen(): Promise<Map<string, string>> {
    const rows = await this.db.select<{ node_id: string; seen_at: string }[]>("SELECT node_id, seen_at FROM item_seen");
    return new Map(rows.map((r) => [r.node_id, r.seen_at]));
  }

  /** Records that the viewer opened an item now, which also takes back marking it unread. */
  async markSeen(nodeId: string, now = new Date()): Promise<string> {
    const seenAt = now.toISOString();
    await this.db.execute(
      "INSERT INTO item_seen (node_id, seen_at) VALUES ($1, $2) ON CONFLICT (node_id) DO UPDATE SET seen_at = excluded.seen_at",
      [nodeId, seenAt],
    );
    await this.db.execute("DELETE FROM item_unread WHERE node_id = $1", [nodeId]);
    return seenAt;
  }

  /** Items the viewer marked unread by hand, with when; they count as unread until opened again. */
  async unreadMarks(): Promise<Map<string, string>> {
    const rows = await this.db.select<{ node_id: string; marked_at: string }[]>("SELECT node_id, marked_at FROM item_unread");
    return new Map(rows.map((r) => [r.node_id, r.marked_at]));
  }

  /** Marks an item unread, like in a mail client; `item_seen` keeps its time. Returns when. */
  async markUnread(nodeId: string, now = new Date()): Promise<string> {
    const markedAt = now.toISOString();
    await this.db.execute("INSERT INTO item_unread (node_id, marked_at) VALUES ($1, $2) ON CONFLICT (node_id) DO UPDATE SET marked_at = excluded.marked_at", [nodeId, markedAt]);
    return markedAt;
  }

  /**
   * Puts the read state of an item back as it was: when the viewer last looked at it, and when
   * they marked it unread, each or neither; for undoing U.
   */
  async restoreRead(nodeId: string, seenAt: string | undefined, markedAt: string | undefined): Promise<void> {
    if (seenAt) {
      await this.db.execute(
        "INSERT INTO item_seen (node_id, seen_at) VALUES ($1, $2) ON CONFLICT (node_id) DO UPDATE SET seen_at = excluded.seen_at",
        [nodeId, seenAt],
      );
    } else {
      await this.db.execute("DELETE FROM item_seen WHERE node_id = $1", [nodeId]);
    }
    if (markedAt) {
      await this.db.execute("INSERT INTO item_unread (node_id, marked_at) VALUES ($1, $2) ON CONFLICT (node_id) DO UPDATE SET marked_at = excluded.marked_at", [nodeId, markedAt]);
    } else {
      await this.db.execute("DELETE FROM item_unread WHERE node_id = $1", [nodeId]);
    }
  }

  /** The last successful fetch, or null when there is none in the current shape. */
  async cachedFetch(): Promise<CachedFetch | null> {
    const rows = await this.db.select<{ version: number; viewer: string; items: string; fetched_at: string; full_at: string | null; scope: string | null }[]>(
      "SELECT version, viewer, items, fetched_at, full_at, scope FROM item_cache WHERE id = 1",
    );
    const row = rows[0];
    if (!row || row.version !== CACHE_VERSION) return null;
    return {
      viewer: JSON.parse(row.viewer) as Viewer,
      items: JSON.parse(row.items) as Item[],
      fetchedAt: new Date(row.fetched_at),
      fullAt: row.full_at ? new Date(row.full_at) : undefined,
      scope: row.scope ?? undefined,
    };
  }

  /** Replaces the cached fetch. */
  async saveFetch({ viewer, items, fetchedAt, fullAt, scope }: CachedFetch): Promise<void> {
    await this.db.execute(
      `INSERT INTO item_cache (id, version, viewer, items, fetched_at, full_at, scope) VALUES (1, $1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET version = excluded.version, viewer = excluded.viewer, items = excluded.items,
         fetched_at = excluded.fetched_at, full_at = excluded.full_at, scope = excluded.scope`,
      [CACHE_VERSION, JSON.stringify(viewer), JSON.stringify(items), fetchedAt.toISOString(), fullAt?.toISOString() ?? null, scope ?? null],
    );
  }

  async settings(): Promise<Settings> {
    const rows = await this.db.select<{ key: string; value: string }[]>("SELECT key, value FROM settings");
    // Only known keys, so a key the app no longer has is not written back on the next save.
    const stored = Object.fromEntries(rows.filter((r) => r.key in DEFAULT_SETTINGS).map((r) => [r.key, JSON.parse(r.value)]));
    const delivery = stored.notifyDelivery as Partial<Delivery> | undefined;
    // The reason "due" went with the due state; its switch is dropped like a dead key.
    const notifyOn = Object.fromEntries(Object.entries((stored.notifyOn ?? {}) as Record<string, boolean>).filter(([reason]) => reason !== "due"));
    return { ...DEFAULT_SETTINGS, ...stored, notifyOn, notifyDelivery: { ...DEFAULT_DELIVERY, ...delivery } };
  }

  async saveSettings(settings: Settings): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.db.execute(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [key, JSON.stringify(value)],
      );
    }
  }
}

/**
 * What the app needs from its local storage: every public method of `Store`. The demo mode
 * swaps in a `MemoryStore` behind it (see `openStorage`).
 */
export type Persistence = Pick<Store, keyof Store>;
