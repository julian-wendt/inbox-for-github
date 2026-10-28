import { mentionAfterMyActivity } from "./mentionAfterMyActivity";
import type { Rule } from "./types";

export type { Rule, RuleContext } from "./types";

export const RULES: readonly Rule[] = [mentionAfterMyActivity];

/** Rule id → enabled, filled with each rule's default where `overrides` has no entry. */
export function ruleSwitches(overrides: Record<string, boolean> = {}): Record<string, boolean> {
  return Object.fromEntries(RULES.map((r) => [r.id, overrides[r.id] ?? r.defaultEnabled]));
}
