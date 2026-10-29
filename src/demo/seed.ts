import type { StatusChange, StoredStatus } from "../model";
import { localDay } from "../ui/assignments";
import { followUpOn } from "../ui/snooze";
import { DEMO_VIEWER, type DemoRefs } from "./world";
import type { MemorySeed } from "./memoryStore";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Items the demo leaves unread, so the list shows both kinds. */
const UNREAD: (keyof DemoRefs)[] = ["retries", "csvExport", "dateFns", "rounding", "leak"];

/**
 * What the demo's local storage starts with: the follow-ups and filings of the viewer, a note, who
 * has seen what, and settings that suit a showcase (the three owners, no notifications and no
 * Dock badge). Times are relative to `now`, like the world's.
 *
 * @param refs  The world's items by name (`buildDemoWorld`).
 * @param now   The current time in ms; the follow-up dates ahead are computed from it.
 *
 * @example
 *   new MemoryStore(demoSeed(refs));
 */
export function demoSeed(refs: DemoRefs, now = Date.now()): MemorySeed {
  const iso = (offset: number) => new Date(now + offset).toISOString();
  const id = (name: keyof DemoRefs) => refs[name].id;
  /** 09:00 local, `days` days on: a time of day people actually pick. */
  const morning = (days: number) => {
    const at = new Date(now);
    at.setDate(at.getDate() + days);
    at.setHours(9, 0, 0, 0);
    return at.toISOString();
  };
  const waiting = (changedAgo: number, until?: string): StoredStatus => ({ status: "snoozed", changedAt: iso(-changedAgo), ...(until && { until }) });

  const statuses = new Map<string, StoredStatus>([
    [id("tooltip"), waiting(4 * DAY, iso(-HOUR))],
    [id("signature"), waiting(DAY, iso(5 * DAY))],
    [id("ownKeys"), waiting(DAY, followUpOn(localDay(new Date(now + DAY))))],
    [id("negativeBalances"), waiting(DAY, followUpOn(localDay(new Date(now + DAY))))],
    [id("frameBudget"), waiting(2 * DAY)],
    [id("rateHeaders"), waiting(DAY, morning(6))],
    [id("rounding"), { status: "done", changedAt: iso(-2 * DAY), handoff: { boards: { PVT_Roadmap: "In progress" }, prs: [] } }],
  ]);
  const statusLog = new Map<string, StatusChange[]>();
  for (const [itemId, stored] of statuses) statusLog.set(itemId, [{ status: stored.status, at: stored.changedAt, automatic: false }]);

  const seenAt = iso(-5 * MIN);
  const seen = new Map(
    (Object.keys(refs) as (keyof DemoRefs)[]).filter((name) => !UNREAD.includes(name)).map((name) => [id(name), seenAt] as const),
  );

  return {
    settings: { orgs: [...new Set(["lumen-labs", "harbor-works", DEMO_VIEWER])], notifications: false, dockBadge: false, focus: [id("settings"), id("savedFilters")], focusDay: localDay(new Date(now)), planned: [{ id: id("leak"), day: localDay(new Date(now + DAY)) }], plannedAt: { [id("leak")]: iso(-HOUR) } },
    statuses,
    statusLog,
    seen,
    notes: new Map([[id("csvExport"), "Ask Priya whether large exports should stream before approving."]]),
  };
}
