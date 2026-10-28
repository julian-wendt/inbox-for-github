import type { Classified } from "../classify";
import { FOCUS_MAX, localDay } from "./assignments";
import { lang, t } from "./i18n";
import { reminderText, untilShort } from "./snooze";

/** An item the viewer plans for a later day; `day` is a local date ("2026-10-28"). */
export interface Planned {
  id: string;
  day: string;
}

/** A day the plan menu offers: tomorrow, a remaining weekday of this week, or next Monday. */
export interface PlanChoice {
  day: string;
  kind: "tomorrow" | "weekday" | "nextWeek";
}

/**
 * The days an item can be planned for, in order: tomorrow, the weekdays after it that are still
 * in this work week, and next Monday unless that is tomorrow.
 *
 * @example
 *   planChoices(new Date(2026, 9, 27)).map((c) => c.kind); // Tuesday: ["tomorrow", "weekday", "weekday", "nextWeek"]
 */
export function planChoices(now = new Date()): PlanChoice[] {
  const at = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  const choices: PlanChoice[] = [{ day: localDay(at(1)), kind: "tomorrow" }];
  for (let n = 2; n <= 5; n++) {
    const weekday = at(n).getDay();
    if (weekday >= 1 && weekday <= 5 && weekday > now.getDay()) choices.push({ day: localDay(at(n)), kind: "weekday" });
  }
  const toMonday = ((8 - now.getDay()) % 7) || 7;
  if (toMonday > 1) choices.push({ day: localDay(at(toMonday)), kind: "nextWeek" });
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
  return t("focus.since", { day: ago < 7 ? date.toLocaleDateString(lang(), { weekday: "short" }) : date.toLocaleDateString(lang(), { day: "numeric", month: "short" }) });
}

/** A local date ("2026-10-28") as a Date at local midnight. */
function dateOf(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * A plan choice as the menu names it: "Tomorrow", the weekday ("Thursday"), or "Next Monday".
 *
 * @example
 *   choiceText({ day: "2026-10-29", kind: "weekday" }); // "Thursday" (English)
 */
export function choiceText(choice: PlanChoice): string {
  if (choice.kind === "tomorrow") return t("plan.tomorrow");
  if (choice.kind === "nextWeek") return t("plan.nextWeek");
  return dateOf(choice.day).toLocaleDateString(lang(), { weekday: "long" });
}

/**
 * The key that picks a plan choice in the plan menu (P): M for tomorrow, W for next Monday, and
 * the weekday's number (Monday 1 to Friday 5) for the others.
 *
 * @example
 *   choiceKey({ day: "2026-10-29", kind: "weekday" }); // "4"
 */
export function choiceKey(choice: PlanChoice): string {
  if (choice.kind === "tomorrow") return "M";
  if (choice.kind === "nextWeek") return "W";
  return String(dateOf(choice.day).getDay());
}

/**
 * A planned day for a narrow column: "Tomorrow", the short weekday within the coming week, else
 * day and month (also for a day already passed, whose item found Today full).
 *
 * @example
 *   dayShort("2026-10-29", new Date(2026, 9, 27)); // "Thu" (English)
 */
export function dayShort(day: string, now = new Date()): string {
  const ahead = Math.round((dateOf(day).getTime() - dateOf(localDay(now)).getTime()) / 86_400_000);
  if (ahead === 1) return t("plan.tomorrow");
  if (ahead > 1 && ahead < 7) return dateOf(day).toLocaleDateString(lang(), { weekday: "short" });
  return dateOf(day).toLocaleDateString(lang(), { day: "numeric", month: "short" });
}

/** A planned day in full, for a tooltip: "Thursday, 29 October 2026". */
export function dayLong(day: string): string {
  return dateOf(day).toLocaleDateString(lang(), { dateStyle: "full" });
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

/** Why an item is in Planned: pinned for today, planned for a day, or a follow-up, with its date when it has one. */
export type Dated = { kind: "today"; day: string } | { kind: "planned"; day: string } | { kind: "followUp"; until?: string };

/**
 * Why an item shows in the Planned view, or null: pinned for today or planned for a later day,
 * both only while it can be pinned, or set to follow up, with or without a date.
 *
 * @example
 *   datedOf(entry, ["I_1"], [], "2026-10-28"); // { kind: "today", day: "2026-10-28" } for I_1
 */
export function datedOf(entry: Pick<Classified, "status" | "item" | "until">, focus: readonly string[], planned: Planned[], today = localDay()): Dated | null {
  const { id } = entry.item;
  if (isPinnable(entry)) {
    if (focus.includes(id)) return { kind: "today", day: today };
    const plan = planned.find((p) => p.id === id);
    if (plan) return { kind: "planned", day: plan.day };
  }
  if (entry.status === "snoozed") return { kind: "followUp", until: entry.until };
  return null;
}

/** The moment a dated item stands for, as an ISO time (local midnight for a day), or undefined without a date. */
export function datedAt(dated: Dated): string | undefined {
  return dated.kind === "followUp" ? dated.until : dateOf(dated.day).toISOString();
}

/**
 * What a row of Planned shows at its end, with its tooltip: "Today", the planned day, or when the
 * follow-up returns; nothing for a follow-up without a date.
 *
 * @example
 *   datedText({ kind: "planned", day: "2026-10-29" }, new Date(2026, 9, 28)); // { text: "Tomorrow", title: "Planned for Thursday, 29 October 2026" }
 */
export function datedText(dated: Dated, now = new Date()): { text: string; title: string } | undefined {
  if (dated.kind === "today") return { text: t("plate.focus"), title: dayLong(dated.day) };
  if (dated.kind === "planned") return { text: dayShort(dated.day, now), title: t("plan.on", { date: dayLong(dated.day) }) };
  return dated.until ? { text: untilShort(dated.until, now), title: reminderText(dated.until) } : undefined;
}
