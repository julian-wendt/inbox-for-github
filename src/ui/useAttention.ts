import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, onAction, registerActionTypes, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useEffect, useRef, useState } from "react";
import type { Classified } from "../classify";
import { arrivals, notificationTitle, notifies, notifyReason, type NotifyReason } from "./attention";
import { notifiesLive, summarize, summaryDue, type Delivery } from "./delivery";
import { t } from "./i18n";

/** What may notify: the main switch, the switch per reason, whether to notify while the window is in front, and when. */
export interface NotifyOptions {
  on: boolean;
  reasons: Partial<Record<NotifyReason, boolean>>;
  inFront: boolean;
  delivery: Delivery;
}

/** What waits for its summary: the collected item ids and when the last summary went out (ISO 8601). */
export interface Pending {
  collected: string[];
  lastSummary: string | null;
}

/** How often the schedule is checked for a summary that came due; summaries land within this of their time. */
const TICK_MS = 30_000;

/**
 * Draws attention to what needs the viewer: the dock badge shows the number of unread items in
 * the inbox, falling as the viewer opens them, and a native notification fires for each item
 * that newly enters it.
 *
 * The first result after app start is the baseline, so a restart does not replay the whole
 * inbox; only snoozes whose date passed while the app was closed notify then (see `arrivals`).
 *
 * Notifications follow `notify`: none with the main switch off, none for a reason switched off,
 * and none while the window has focus unless `inFront` is set, since the list shows the item
 * then. Items arriving while they do not notify still count as known, so nothing replays later.
 *
 * `notify.delivery` decides when they arrive. Outside its live moments new items are collected
 * (`pending`), and once a release moment passes one summary notification names them, those still
 * in the inbox that is. Switching to "immediately" sends what was collected at once. The first
 * check with a schedule only records the baseline, so enabling it replays nothing.
 *
 * @param classified  The current classification; pass an empty list until the first fetch is done.
 * @param unread      Ids the badge counts: unread inbox items (`unreadInInbox`) and items marked unread by hand.
 * @param notify      What may notify and when (see `NotifyOptions`).
 * @param badge       Show the unread count on the dock icon; off clears it.
 * @param onOpen      Called when the viewer clicks a notification, with its item's id, or null
 *                    for a summary. The shell brings the window to the front itself.
 * @param pending     What is collected for the next summary, as stored.
 * @param onPending   Called with a function that turns the stored `Pending` into the next one;
 *                    a function, so two changes in one tick do not overwrite each other.
 *
 * @example
 *   useAttention(inbox.classified, unreadIds, { on: true, reasons: { review: false }, inFront: false, delivery }, true, (id) => show(id), pending, (change) => store(change(pending)));
 */
export function useAttention(classified: Classified[], unread: ReadonlySet<string>, notify: NotifyOptions, badge: boolean, onOpen: (itemId: string | null) => void, pending: Pending, onPending: (change: (current: Pending) => Pending) => void): void {
  const known = useRef<Set<string> | null>(null);
  const { on, reasons, inFront, delivery } = notify;
  const { collected, lastSummary } = pending;
  const open = useRef(onOpen);
  const change = useRef(onPending);
  useEffect(() => {
    open.current = onOpen;
    change.current = onPending;
  }, [onOpen, onPending]);
  const latest = useRef({ on, delivery, collected, lastSummary });
  useEffect(() => {
    latest.current = { on, delivery, collected, lastSummary };
  }, [on, delivery, collected, lastSummary]);
  const [tick, setTick] = useState(0);

  // Only a summary that came due renders again; a tick that finds nothing must not.
  useEffect(() => {
    const timer = setInterval(() => {
      const current = latest.current;
      if (current.on && current.lastSummary && summaryDue(current.delivery, new Date(), new Date(current.lastSummary))) setTick((n) => n + 1);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const listener = onAction(({ actionId, notification }) => {
      const itemId = notification?.extra?.itemId;
      if (actionId === "tap" || actionId === OPEN_ACTION) open.current(typeof itemId === "string" ? itemId : null);
    });
    return () => void listener.then((l) => l.unregister());
  }, []);

  useEffect(() => {
    if (classified.length === 0 && badge) return;
    void getCurrentWindow().setBadgeCount(badge && unread.size > 0 ? unread.size : undefined);
  }, [classified, unread, badge]);

  useEffect(() => {
    if (classified.length === 0) return;
    const fresh = arrivals(classified, known.current).filter((c) => notifies(notifyReason(c), reasons));
    known.current = new Set(classified.filter((c) => c.bucket === "inbox").map((c) => c.item.id));
    if (!on || fresh.length === 0) return;
    if (!notifiesLive(delivery, new Date())) {
      const ids = fresh.map((c) => c.item.id);
      change.current((current) => ({ ...current, collected: [...new Set([...current.collected, ...ids])] }));
    } else if (inFront || !document.hasFocus()) void send(fresh);
  }, [classified, on, reasons, inFront, delivery]);

  useEffect(() => {
    if (!on || classified.length === 0) return;
    const now = new Date();
    const immediately = delivery.mode === "immediately";
    if (immediately && collected.length === 0) return;
    if (!immediately) {
      if (!lastSummary) return void change.current((current) => ({ ...current, lastSummary: now.toISOString() }));
      if (!summaryDue(delivery, now, new Date(lastSummary))) return;
    }
    const sent = new Set(collected);
    const entries = classified.filter((c) => c.bucket === "inbox" && sent.has(c.item.id) && notifies(notifyReason(c), reasons));
    change.current((current) => ({ collected: current.collected.filter((id) => !sent.has(id)), lastSummary: now.toISOString() }));
    if (entries.length > 0 && (inFront || !document.hasFocus())) void sendSummary(entries);
  }, [classified, on, reasons, inFront, delivery, collected, lastSummary, tick]);
}

/** The action type every notification carries, and its one "Open" button. */
const OPEN_TYPE = "item";
const OPEN_ACTION = "open";

async function send(entries: Classified[]): Promise<void> {
  if (!(await isPermissionGranted()) && (await requestPermission()) !== "granted") return;
  // macOS reports a click only on notifications with a button (docs/reference/local-development.md#notifications).
  await registerActionTypes([{ id: OPEN_TYPE, actions: [{ id: OPEN_ACTION, title: t("notify.open") }] }]);
  for (const entry of entries.slice(0, 3)) {
    const { item } = entry;
    sendNotification({ title: notificationTitle(entry), body: `${item.repo.split("/")[1]}#${item.number} ${item.title}`, actionTypeId: OPEN_TYPE, extra: { itemId: item.id } });
  }
  if (entries.length > 3) sendNotification({ title: "Inbox for GitHub", body: t(entries.length === 4 ? "notify.moreOne" : "notify.more", { count: entries.length - 3 }), actionTypeId: OPEN_TYPE });
}

async function sendSummary(entries: Classified[]): Promise<void> {
  if (!(await isPermissionGranted()) && (await requestPermission()) !== "granted") return;
  await registerActionTypes([{ id: OPEN_TYPE, actions: [{ id: OPEN_ACTION, title: t("notify.open") }] }]);
  const { body, titles } = summarize(entries);
  sendNotification({ title: "Inbox for GitHub", body: [body, ...titles].join("\n"), actionTypeId: OPEN_TYPE });
}
