import { FOCUS_MAX, localDay } from "./assignments";
import { lang, t } from "./i18n";

/** An assigned item the viewer plans for a later day; `day` is a local date ("2026-10-28"). */
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

/**
 * The state of "Today" once a new day has begun: yesterday's pins are gone, and the items planned
 * for today or earlier move in, oldest plan first, as far as `FOCUS_MAX` allows. Those that do
 * not fit stay planned. Plans of items that are loaded but cannot be pinned any more (closed,
 * unassigned, snoozed) are dropped. Returns null while nothing is to be done: Today is from this
 * day, or it is empty, no plan is due and none is dropped.
 *
 * @param state      The settings `focus`, `focusDay` and `planned`.
 * @param today      The local date of today (see `localDay`).
 * @param pinnable   Whether an item can be pinned now.
 * @param loaded     Whether an item is loaded at all; plans of items not loaded yet are kept.
 *
 * @example
 *   rollOver({ focus: ["I_1"], focusDay: "2026-10-26", planned: [{ id: "I_2", day: "2026-10-27" }] }, "2026-10-27", () => true);
 *   // { focus: ["I_2"], focusDay: "2026-10-27", planned: [] }
 */
export function rollOver(
  state: { focus: string[]; focusDay: string | null; planned: Planned[] },
  today: string,
  pinnable: (id: string) => boolean,
  loaded: (id: string) => boolean = () => false,
): { focus: string[]; focusDay: string | null; planned: Planned[] } | null {
  if (state.focusDay === today) return null;
  const kept = state.planned.filter((p) => pinnable(p.id) || !loaded(p.id));
  const due = kept.filter((p) => p.day <= today && pinnable(p.id)).sort((a, b) => a.day.localeCompare(b.day)).slice(0, FOCUS_MAX);
  if (state.focus.length === 0 && due.length === 0 && kept.length === state.planned.length) return null;
  const moved = new Set(due.map((p) => p.id));
  return { focus: due.map((p) => p.id), focusDay: due.length > 0 ? today : null, planned: kept.filter((p) => !moved.has(p.id)) };
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
