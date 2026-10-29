import type { Classified } from "../classify";
import { FOCUS_MAX, localDay } from "./assignments";
import { dateLocale, t } from "./i18n";

/** An item the viewer plans for a later day; `day` is a local date ("2026-10-28"). */
export interface Planned {
  id: string;
  day: string;
}

/** A day the Plan and Follow-up menus offer: the next workday, a remaining weekday of this work week, or next week's Monday. */
export interface DayChoice {
  day: string;
  kind: "nextWorkday" | "weekday" | "nextWeek";
}

/** The days of the week from Monday, as `Date.getDay` numbers them, for the "workdays" setting. */
export const WEEK: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * The "workdays" setting with `day` switched on or off; the last workday stays, so the menus
 * always have a next workday.
 *
 * @example
 *   toggleWorkday([1, 2, 3, 4, 5], 6); // [1, 2, 3, 4, 5, 6]
 */
export function toggleWorkday(workdays: readonly number[], day: number): number[] {
  if (!workdays.includes(day)) return WEEK.filter((d) => d === day || workdays.includes(d));
  return workdays.length > 1 ? workdays.filter((d) => d !== day) : [...workdays];
}

/** A weekday's short name in the app's language ("Mon"), from its `Date.getDay` number. */
export function weekdayName(day: number): string {
  return new Date(2026, 10, 1 + day).toLocaleDateString(dateLocale(), { weekday: "short" });
}

/** The workdays unless the "workdays" setting says otherwise: Monday to Friday, as `Date.getDay` numbers them (Sunday 0). */
export const WORKDAYS: readonly number[] = [1, 2, 3, 4, 5];

/**
 * The days an item can be planned or followed up for, in order: the next workday after today,
 * the workdays after it that are still in this work week (on a Sunday the coming one), and the
 * first workday of next week unless that is the next workday. Plan and Follow-up both offer
 * these, so their menus cannot drift apart.
 *
 * @param workdays  The "workdays" setting, as `Date.getDay` numbers; empty counts as `WORKDAYS`.
 *
 * @example
 *   dayChoices(new Date(2026, 9, 27)).map((c) => c.kind); // Tuesday: ["nextWorkday", "weekday", "weekday", "nextWeek"]
 */
export function dayChoices(now = new Date(), workdays: readonly number[] = WORKDAYS): DayChoice[] {
  const days = workdays.length > 0 ? workdays : WORKDAYS;
  const at = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  const workday = (n: number) => days.includes(at(n).getDay());
  let next = 1;
  while (!workday(next)) next++;
  const choices: DayChoice[] = [{ day: localDay(at(next)), kind: "nextWorkday" }];
  for (let n = next + 1; n <= 6; n++) {
    if (workday(n) && at(n).getDay() > now.getDay()) choices.push({ day: localDay(at(n)), kind: "weekday" });
  }
  let nextWeek = ((8 - now.getDay()) % 7) || 7;
  while (!workday(nextWeek)) nextWeek++;
  if (!choices.some((c) => c.day === localDay(at(nextWeek)))) choices.push({ day: localDay(at(nextWeek)), kind: "nextWeek" });
  return choices;
}

/**
 * The plan with the item planned for `day`, or without it when `day` is null. An item has at
 * most one day.
 *
 * @example
 *   setPlan([{ id: "I_1", day: "2026-10-28" }], "I_1", "2026-10-30"); // [{ id: "I_1", day: "2026-10-30" }]
 */
export function setPlan(planned: Planned[], id: string, day: string | null): Planned[] {
  const rest = planned.filter((p) => p.id !== id);
  return day ? [...rest, { id, day }] : rest;
}

/** The settings that make up "Today": the pins, the day they stand for, the plans, when each pin came in and when each item was pinned or planned. */
export interface Today {
  focus: string[];
  focusDay: string | null;
  planned: Planned[];
  pinnedOn: Record<string, string>;
  plannedAt: Record<string, string>;
}

/** The "Today" part of the settings, to snapshot it for undo. */
export function todayOf(settings: Today): Today {
  const { focus, focusDay, planned, pinnedOn, plannedAt } = settings;
  return { focus, focusDay, planned, pinnedOn, plannedAt };
}

/**
 * The state of "Today" once a new day has begun: what was pinned and is still open stays, carried
 * over, and the items planned for today or earlier move in behind it, oldest plan first, as far
 * as `FOCUS_MAX` allows. Those that do not fit stay planned. Pins and plans of items that are
 * loaded but cannot be pinned any more (closed, done) are dropped. `pinnedOn`
 * keeps the day each pin came into Today; a pin recorded before that existed counts from the day
 * Today was last set. `plannedAt` keeps only the items still pinned or planned; a plan that moves
 * into Today keeps its time. Returns null while nothing is to be done: Today is from this day, or
 * it is empty, no plan is due and none is dropped.
 *
 * @param state      The settings `focus`, `focusDay`, `planned`, `pinnedOn` and `plannedAt`.
 * @param today      The local date of today (see `localDay`).
 * @param pinnable   Whether an item can be pinned now.
 * @param loaded     Whether an item is loaded at all; pins and plans of items not loaded yet are kept.
 *
 * @example
 *   rollOver({ focus: ["I_1"], focusDay: "2026-10-26", planned: [{ id: "I_2", day: "2026-10-27" }], pinnedOn: { I_1: "2026-10-26" }, plannedAt: {} }, "2026-10-27", () => true);
 *   // { focus: ["I_1", "I_2"], focusDay: "2026-10-27", planned: [], pinnedOn: { I_1: "2026-10-26", I_2: "2026-10-27" }, plannedAt: {} }
 */
export function rollOver(state: Today, today: string, pinnable: (id: string) => boolean, loaded: (id: string) => boolean = () => false): Today | null {
  if (state.focusDay === today) return null;
  const keep = (id: string) => pinnable(id) || !loaded(id);
  const carried = state.focus.filter(keep);
  const kept = state.planned.filter((p) => keep(p.id));
  const due = kept
    .filter((p) => p.day <= today && pinnable(p.id) && !carried.includes(p.id))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(0, Math.max(0, FOCUS_MAX - carried.length));
  const focus = [...carried, ...due.map((p) => p.id)];
  if (focus.length === 0 && state.focus.length === 0 && kept.length === state.planned.length) return null;
  const moved = new Set(due.map((p) => p.id));
  const pinnedOn = Object.fromEntries(focus.map((id) => [id, moved.has(id) ? today : (state.pinnedOn[id] ?? state.focusDay ?? today)]));
  const dated = new Set([...focus, ...kept.map((p) => p.id)]);
  const plannedAt = Object.fromEntries(Object.entries(state.plannedAt).filter(([id]) => dated.has(id)));
  return { focus, focusDay: focus.length > 0 ? today : null, planned: kept.filter((p) => !moved.has(p.id)), pinnedOn, plannedAt };
}

/**
 * "Today" after the item's calendar event turned up on `day`: on today or earlier the item comes
 * into Today, as far as `FOCUS_MAX` allows (else it stays planned for that day, due); on a later
 * day it is planned for it. Null when the item already is where the event says.
 *
 * @example
 *   followEvent({ focus: [], focusDay: null, planned: [{ id: "I_1", day: "2026-10-30" }], pinnedOn: {}, plannedAt: {} }, "I_1", "2026-11-02", "2026-10-29");
 *   // planned: [{ id: "I_1", day: "2026-11-02" }]
 */
export function followEvent(state: Today, id: string, day: string, today: string): Today | null {
  const plan = state.planned.find((p) => p.id === id)?.day;
  if (day <= today) {
    if (state.focus.includes(id)) return null;
    if (state.focus.length >= FOCUS_MAX) return plan === day ? null : { ...state, planned: setPlan(state.planned, id, day) };
    return { ...state, focus: [...state.focus, id], focusDay: state.focusDay ?? today, planned: setPlan(state.planned, id, null), pinnedOn: { ...state.pinnedOn, [id]: today } };
  }
  if (plan === day) return null;
  return { ...state, focus: state.focus.filter((f) => f !== id), planned: setPlan(state.planned, id, day), pinnedOn: without(state.pinnedOn, id) };
}

/**
 * The calendar links whose item has neither a Today pin nor a plan any more, as item id and event
 * identifier: their events are left over.
 *
 * @example
 *   orphanLinks({ focus: [], planned: [], calendarEvents: { I_1: "E1" } }); // [["I_1", "E1"]]
 */
export function orphanLinks(settings: Pick<Today, "focus" | "planned"> & { calendarEvents: Record<string, string> }): [string, string][] {
  const dated = new Set([...settings.focus, ...settings.planned.map((p) => p.id)]);
  return Object.entries(settings.calendarEvents).filter(([id]) => !dated.has(id));
}

/** The record without `id`, for taking an item out of `pinnedOn`. */
export function without(pinnedOn: Record<string, string>, id: string): Record<string, string> {
  return Object.fromEntries(Object.entries(pinnedOn).filter(([key]) => key !== id));
}

/**
 * Since when an item carried over in Today has waited: "Since yesterday", the short weekday
 * within the past week ("Since Mon"), else day and month ("Since 12 Oct").
 *
 * @example
 *   carriedText("2026-10-26", new Date(2026, 9, 28)); // "Since Mon" (English)
 */
export function carriedText(day: string, now = new Date()): string {
  const ago = Math.round((dateOf(localDay(now)).getTime() - dateOf(day).getTime()) / 86_400_000);
  if (ago <= 1) return t("focus.sinceYesterday");
  const date = dateOf(day);
  return t("focus.since", { day: ago < 7 ? date.toLocaleDateString(dateLocale(), { weekday: "short" }) : date.toLocaleDateString(dateLocale(), { day: "numeric", month: "short" }) });
}

/** A local date ("2026-10-28") as a Date at local midnight. */
function dateOf(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * A day choice as the menus name it: "Next workday", the weekday ("Thursday"), or "Next week".
 *
 * @example
 *   choiceText({ day: "2026-10-29", kind: "weekday" }); // "Thursday" (English)
 */
export function choiceText(choice: DayChoice): string {
  if (choice.kind === "nextWorkday") return t("plan.nextWorkday");
  if (choice.kind === "nextWeek") return t("plan.nextWeek");
  return dateOf(choice.day).toLocaleDateString(dateLocale(), { weekday: "long" });
}

/**
 * The key that picks a day choice in the Plan (P) and Follow-up (F) menus: N for the next
 * workday, W for next week, and the weekday's number (Monday 1 to Sunday 7) for the others.
 *
 * @example
 *   choiceKey({ day: "2026-10-29", kind: "weekday" }); // "4"
 */
export function choiceKey(choice: DayChoice): string {
  if (choice.kind === "nextWorkday") return "N";
  if (choice.kind === "nextWeek") return "W";
  return String(dateOf(choice.day).getDay() || 7);
}

/**
 * A day as the rows, the tables and the detail's plan chip name it: "Today", "Tomorrow", the
 * weekday within this work week (on a Sunday the coming one, as `dayChoices` counts it), else day
 * and month (also for a day already passed, whose item found Today full).
 *
 * @example
 *   dayText("2026-10-29", new Date(2026, 9, 27)); // "Thursday" (English)
 *   dayText("2026-11-03", new Date(2026, 9, 27)); // "Nov 3" (English)
 */
export function dayText(day: string, now = new Date()): string {
  const ahead = Math.round((dateOf(day).getTime() - dateOf(localDay(now)).getTime()) / 86_400_000);
  if (ahead === 0) return t("plate.focus");
  if (ahead === 1) return t("plan.tomorrow");
  if (ahead > 1 && ahead < 7 && dateOf(day).getDay() > now.getDay()) return dateOf(day).toLocaleDateString(dateLocale(), { weekday: "long" });
  return dateOf(day).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" });
}

/** A planned day in full, for a tooltip: "Thursday, 29 October 2026". */
export function dayLong(day: string): string {
  return dateOf(day).toLocaleDateString(dateLocale(), { dateStyle: "full" });
}

/** Whether T and P take the item: open on GitHub and not done here; a follow-up ends when they do. */
export function isPinnable(entry: Pick<Classified, "status" | "item">): boolean {
  return entry.status !== "done" && !entry.item.closed;
}

/**
 * Today without the items: their pins, plans and times go, as when a follow-up takes an item's
 * "when". The day Today stands for stays.
 *
 * @example
 *   unplan({ focus: ["I_1"], focusDay: "2026-10-28", planned: [{ id: "I_2", day: "2026-10-29" }], pinnedOn: { I_1: "2026-10-28" }, plannedAt: { I_1: "…", I_2: "…" } }, ["I_1", "I_2"]);
 *   // { focus: [], focusDay: "2026-10-28", planned: [], pinnedOn: {}, plannedAt: {} }
 */
export function unplan(state: Today, ids: readonly string[]): Today {
  const gone = (id: string) => ids.includes(id);
  const keep = (record: Record<string, string>) => Object.fromEntries(Object.entries(record).filter(([id]) => !gone(id)));
  return { focus: state.focus.filter((id) => !gone(id)), focusDay: state.focusDay, planned: state.planned.filter((p) => !gone(p.id)), pinnedOn: keep(state.pinnedOn), plannedAt: keep(state.plannedAt) };
}

/**
 * The items pinned for today or planned for a day that are closed on GitHub, whose pin or plan
 * goes at once (with `unplan`) rather than at the next `rollOver`.
 *
 * @param closed  Whether a loaded item is closed or merged.
 *
 * @example
 *   closedPlans({ focus: ["I_1"], planned: [{ id: "I_2", day: "2026-10-30" }], … }, (id) => id === "I_2"); // ["I_2"]
 */
export function closedPlans(state: Pick<Today, "focus" | "planned">, closed: (id: string) => boolean): string[] {
  return [...state.focus, ...state.planned.map((p) => p.id)].filter(closed);
}

/**
 * One item's part of Today: its pin with the day it came in, its plan, and when it got either;
 * the rest is empty. With `replan` it goes back once a close is undone.
 *
 * @example
 *   planOf({ focus: ["I_1", "I_2"], focusDay: "2026-10-28", planned: [], pinnedOn: { I_1: "2026-10-28" }, plannedAt: {} }, "I_1");
 *   // { focus: ["I_1"], focusDay: "2026-10-28", planned: [], pinnedOn: { I_1: "2026-10-28" }, plannedAt: {} }
 */
export function planOf(state: Today, id: string): Today {
  const only = (record: Record<string, string>) => (id in record ? { [id]: record[id] } : {});
  return { focus: state.focus.filter((f) => f === id), focusDay: state.focusDay, planned: state.planned.filter((p) => p.id === id), pinnedOn: only(state.pinnedOn), plannedAt: only(state.plannedAt) };
}

/**
 * Today with an item's part (from `planOf`) put back, as it was; what Today holds besides stays.
 * A pin comes back behind the others, and Today keeps its day unless it had none.
 *
 * @example
 *   replan(unplan(state, ["I_1"]), planOf(state, "I_1")); // state again, with I_1's pin last
 */
export function replan(state: Today, part: Today): Today {
  const ids = new Set([...part.focus, ...part.planned.map((p) => p.id)]);
  const rest = unplan(state, [...ids]);
  return {
    focus: [...rest.focus, ...part.focus],
    focusDay: rest.focusDay ?? (part.focus.length > 0 ? part.focusDay : null),
    planned: [...rest.planned, ...part.planned],
    pinnedOn: { ...rest.pinnedOn, ...part.pinnedOn },
    plannedAt: { ...rest.plannedAt, ...part.plannedAt },
  };
}

/** Why an item is in Planned: pinned for today or planned for a day. */
export type Dated = { kind: "today"; day: string } | { kind: "planned"; day: string };

/**
 * Why an item shows in the Planned view, or null: pinned for today or planned for a later day,
 * both only while it can be pinned.
 *
 * @example
 *   datedOf(entry, ["I_1"], [], "2026-10-28"); // { kind: "today", day: "2026-10-28" } for I_1
 */
export function datedOf(entry: Pick<Classified, "status" | "item">, focus: readonly string[], planned: Planned[], today = localDay()): Dated | null {
  const { id } = entry.item;
  if (!isPinnable(entry)) return null;
  if (focus.includes(id)) return { kind: "today", day: today };
  const plan = planned.find((p) => p.id === id);
  return plan ? { kind: "planned", day: plan.day } : null;
}

/** The moment a dated item stands for: its day as an ISO time at local midnight. */
export function datedAt(dated: Dated): string {
  return dateOf(dated.day).toISOString();
}

/**
 * How a dated item names its day, in its row's mark, at the end of a Planned row and on the
 * detail's plan chip, with the tooltip: "Today" or the planned day (see `dayText`).
 *
 * @example
 *   datedText({ kind: "planned", day: "2026-10-29" }, new Date(2026, 9, 28)); // { text: "Tomorrow", title: "Planned for Thursday, 29 October 2026" }
 */
export function datedText(dated: Dated, now = new Date()): { text: string; title: string } {
  if (dated.kind === "today") return { text: t("plate.focus"), title: dayLong(dated.day) };
  return { text: dayText(dated.day, now), title: t("plan.on", { date: dayLong(dated.day) }) };
}
