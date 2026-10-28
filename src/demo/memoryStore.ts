import type { Status, StatusChange, StatusExtra, StoredStatus, WriteFailure } from "../model";
import { DEFAULT_SETTINGS, type CachedFetch, type Persistence, type Settings } from "../store";

/** What a `MemoryStore` starts with; everything is optional and starts empty. */
export interface MemorySeed {
  settings?: Partial<Settings>;
  statuses?: Map<string, StoredStatus>;
  statusLog?: Map<string, StatusChange[]>;
  notes?: Map<string, string>;
  seen?: Map<string, string>;
  unreadMarks?: Map<string, string>;
}

/**
 * The app's local storage held in memory, for the demo mode: the same contract as `Store`, but
 * nothing reaches SQLite, so the real database stays untouched and a restart starts over from
 * the seed.
 *
 * @example
 *   const store = new MemoryStore({ settings: { orgs: ["lumen-labs"] } });
 *   await store.setStatus("I_1", "done");
 */
export class MemoryStore implements Persistence {
  private statusMap: Map<string, StoredStatus>;
  private log: Map<string, StatusChange[]>;
  private noteMap: Map<string, string>;
  private seenMap: Map<string, string>;
  private unreadMap: Map<string, string>;
  private failures = new Map<string, WriteFailure[]>();
  private cache: CachedFetch | null = null;
  private current: Settings;

  constructor(seed: MemorySeed = {}) {
    this.current = { ...DEFAULT_SETTINGS, ...seed.settings };
    this.statusMap = new Map(seed.statuses);
    this.log = new Map(seed.statusLog);
    this.noteMap = new Map(seed.notes);
    this.seenMap = new Map(seed.seen);
    this.unreadMap = new Map(seed.unreadMarks);
  }

  statuses(): Promise<Map<string, StoredStatus>> {
    return Promise.resolve(new Map(this.statusMap));
  }

  statusLog(): Promise<Map<string, StatusChange[]>> {
    return Promise.resolve(new Map(this.log));
  }

  setStatus(nodeId: string, status: Status, automatic = false, now = new Date(), extra: StatusExtra = {}, source: string | null = null): Promise<{ stored: StoredStatus; change: StatusChange }> {
    const stored: StoredStatus = { status, changedAt: now.toISOString(), ...(extra.until && { until: extra.until }), ...(extra.handoff && { handoff: extra.handoff }) };
    const change: StatusChange = { status, at: stored.changedAt, automatic, ...(source && { source }) };
    this.statusMap.set(nodeId, stored);
    this.logChange(nodeId, change);
    return Promise.resolve({ stored, change });
  }

  undoStatus(nodeId: string, previous: Status, now = new Date()): Promise<StoredStatus> {
    const stored: StoredStatus = { status: previous, changedAt: now.toISOString() };
    this.statusMap.set(nodeId, stored);
    this.dropLastChange(nodeId);
    return Promise.resolve(stored);
  }

  restoreStatus(nodeId: string, previous: StoredStatus | undefined): Promise<void> {
    if (previous) this.statusMap.set(nodeId, previous);
    else this.statusMap.delete(nodeId);
    this.dropLastChange(nodeId);
    return Promise.resolve();
  }

  clearStatus(nodeId: string, now = new Date(), source: string | null = null): Promise<StatusChange> {
    this.statusMap.delete(nodeId);
    const change: StatusChange = { status: "open", at: now.toISOString(), automatic: true, ...(source && { source }) };
    this.logChange(nodeId, change);
    return Promise.resolve(change);
  }

  resetStatuses(now = new Date()): Promise<Map<string, StatusChange>> {
    const change: StatusChange = { status: "open", at: now.toISOString(), automatic: true };
    const cleared = new Map([...this.statusMap.keys()].map((id) => [id, change]));
    for (const id of cleared.keys()) this.logChange(id, change);
    this.statusMap.clear();
    return Promise.resolve(cleared);
  }

  notes(): Promise<Map<string, string>> {
    return Promise.resolve(new Map(this.noteMap));
  }

  saveNote(nodeId: string, note: string): Promise<void> {
    if (note.trim()) this.noteMap.set(nodeId, note);
    else this.noteMap.delete(nodeId);
    return Promise.resolve();
  }

  writeFailures(): Promise<Map<string, WriteFailure[]>> {
    return Promise.resolve(new Map(this.failures));
  }

  addWriteFailure(nodeId: string, kind: WriteFailure["kind"], error: string, now = new Date()): Promise<WriteFailure> {
    const failure = { kind, at: now.toISOString(), error };
    this.failures.set(nodeId, [...(this.failures.get(nodeId) ?? []), failure]);
    return Promise.resolve(failure);
  }

  seen(): Promise<Map<string, string>> {
    return Promise.resolve(new Map(this.seenMap));
  }

  markSeen(nodeId: string, now = new Date()): Promise<string> {
    const at = now.toISOString();
    this.seenMap.set(nodeId, at);
    this.unreadMap.delete(nodeId);
    return Promise.resolve(at);
  }

  unreadMarks(): Promise<Map<string, string>> {
    return Promise.resolve(new Map(this.unreadMap));
  }

  markUnread(nodeId: string, now = new Date()): Promise<string> {
    const at = now.toISOString();
    this.unreadMap.set(nodeId, at);
    return Promise.resolve(at);
  }

  restoreRead(nodeId: string, seenAt: string | undefined, markedAt: string | undefined): Promise<void> {
    if (seenAt) this.seenMap.set(nodeId, seenAt);
    else this.seenMap.delete(nodeId);
    if (markedAt) this.unreadMap.set(nodeId, markedAt);
    else this.unreadMap.delete(nodeId);
    return Promise.resolve();
  }

  cachedFetch(): Promise<CachedFetch | null> {
    return Promise.resolve(this.cache);
  }

  saveFetch(fetch: CachedFetch): Promise<void> {
    this.cache = fetch;
    return Promise.resolve();
  }

  settings(): Promise<Settings> {
    return Promise.resolve({ ...this.current });
  }

  saveSettings(settings: Settings): Promise<void> {
    this.current = { ...settings };
    return Promise.resolve();
  }

  private logChange(nodeId: string, change: StatusChange): void {
    this.log.set(nodeId, [...(this.log.get(nodeId) ?? []), change]);
  }

  private dropLastChange(nodeId: string): void {
    this.log.set(nodeId, (this.log.get(nodeId) ?? []).slice(0, -1));
  }
}
