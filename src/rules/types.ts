import type { Item, StoredStatus } from "../model";
import type { Mention } from "../timeline";

export interface RuleContext {
  /** Login of the viewer. */
  me: string;
  /** The viewer's manual status for the item, if any. */
  stored?: StoredStatus;
}

/**
 * An automatic rule. Every rule can be switched off in the settings; with all rules off the app
 * puts every mention into the inbox.
 *
 * `pendingMention` decides whether the item belongs in the inbox. It returns the mention
 * that still awaits the viewer, or null. When several enabled rules implement it, the first
 * non-null result wins. When a status falls back to "Offen" is a setting, not a rule; see
 * `reopens`.
 *
 * To add a rule, create a file in this folder exporting a `Rule` and list it in `index.ts`.
 */
export interface Rule {
  /** Stable key, persisted in the settings. Never rename. Its title and description live in the UI dictionaries as `rule.<id>.title` and `rule.<id>.description`. */
  id: string;
  defaultEnabled: boolean;
  pendingMention?: (item: Item, ctx: RuleContext) => Mention | null;
}
