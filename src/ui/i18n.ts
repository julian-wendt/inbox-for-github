import { Fragment, createElement, type ReactNode } from "react";
import { de } from "./locales/de";
import { en, type Messages } from "./locales/en";

export type Lang = "en" | "de";
export type MessageKey = keyof Messages;

const DICTIONARIES: Record<Lang, Messages> = { en, de };

let current: Lang = "en";

/**
 * Switches the language for every following `t` call. The app sets it from the settings at the
 * top of each render, so a change shows on the next render; tests set it directly.
 *
 * @example
 *   setLang("de");
 */
export function setLang(lang: Lang): void {
  current = lang;
}

/** The current language, e.g. for `Intl` formatters. */
export function lang(): Lang {
  return current;
}

/**
 * Looks up a text in the current language and fills `{name}` placeholders from `params`.
 * English is the source dictionary; the German one must have the same keys, so a missing
 * translation fails the typecheck.
 *
 * @example
 *   t("time.now"); // "now"
 *   t("activity.commits", { count: 3 }); // "3 new commits"
 */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return DICTIONARIES[current][key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/**
 * Like `t`, but placeholders may be elements, e.g. a bold name inside a translated sentence.
 *
 * @example
 *   tRich("activity.assigned", { name: <strong>alice</strong> }); // [<strong>alice</strong>, " assigned you"]
 */
export function tRich(key: MessageKey, params: Record<string, ReactNode>): ReactNode {
  const parts = DICTIONARIES[current][key].split(/\{(\w+)\}/);
  return parts.map((part, i) => createElement(Fragment, { key: i }, i % 2 === 1 ? (params[part] ?? `{${part}}`) : part));
}
