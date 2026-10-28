import type { Item } from "../model";

/** An attribute the table and the detail view can show: "repo", "type", "status", "pr", "labels", "assignees", "reviewers" or `field:<board field id>`. */
export interface AttributeOption {
  key: string;
  /** The attribute's name; for board fields the field name, e.g. "Component". */
  name: string;
  /** True for board fields. */
  field?: boolean;
  /** For board fields, once two or more boards are shown: the board, e.g. "Roadmap". */
  board?: string;
  /** For board fields: iterations (sprints) are shown until the viewer decides otherwise. */
  iteration?: boolean;
}

/** One attribute in the viewer's order, and whether it is shown. */
export interface AttributeSetting {
  key: string;
  shown: boolean;
}

const BUILT_IN = ["repo", "type", "status", "pr", "labels", "assignees", "reviewers"];

/**
 * The people reviewing a pull request: everyone asked for a review and everyone who submitted
 * one, in that order, without the author and without teams. Issues have none.
 *
 * @example
 *   reviewersOf(pr); // ["alice", "copilot-pull-request-reviewer[bot]"]
 */
export function reviewersOf(item: Pick<Item, "author" | "reviewRequests" | "reviews">): string[] {
  const logins = [...item.reviewRequests.map((r) => r.reviewer), ...item.reviews.map((r) => r.author)];
  return [...new Set(logins)].filter((login) => login !== item.author && !login.startsWith("team:"));
}

/**
 * Every attribute the table can show for the loaded items: the built-in ones, then each field of
 * the boards that are switched on, once per field. The board name is only given when fields come
 * from two or more boards; with one board it says nothing.
 *
 * @param items         The loaded items.
 * @param hiddenBoards  Board ids switched off in the settings; their fields are left out.
 *
 * @example
 *   attributeOptions(items, []); // [{ key: "repo", … }, …, { key: "field:PVTSSF_1", name: "Component", field: true }]
 */
export function attributeOptions(items: Pick<Item, "boards">[], hiddenBoards: string[] = []): AttributeOption[] {
  const fields = new Map<string, AttributeOption & { boardTitle: string }>();
  for (const board of items.flatMap((i) => i.boards).filter((b) => !hiddenBoards.includes(b.id))) {
    for (const f of board.fields) {
      const key = `field:${f.id}`;
      if (!fields.has(key)) fields.set(key, { key, name: f.name, field: true, boardTitle: board.title, iteration: f.kind === "iteration" });
    }
  }
  const several = new Set([...fields.values()].map((f) => f.boardTitle)).size > 1;
  const options = [...fields.values()].map(({ boardTitle, ...o }) => (several ? { ...o, board: boardTitle } : o));
  const byName = (a: AttributeOption, b: AttributeOption) => `${a.board ?? ""}${a.name}`.localeCompare(`${b.board ?? ""}${b.name}`);
  return [...BUILT_IN.map((key) => ({ key, name: key })), ...options.sort(byName)];
}

/**
 * The full attribute list in the viewer's order. Stored entries keep their place and switch;
 * attributes not stored yet (new board fields, or no setting at all) follow in their default
 * order: the built-ins (repo, issue type, board status, pull request, labels, assignees) and iterations shown, other
 * fields hidden. Labels here are the table's own; the detail view has its own switch.
 *
 * @param stored   The setting "tableAttributes"; null until the viewer changes anything.
 * @param options  From `attributeOptions`.
 */
export function resolveAttributes(stored: AttributeSetting[] | null, options: AttributeOption[]): AttributeSetting[] {
  const known = new Set(options.map((o) => o.key));
  const kept = (stored ?? []).filter((s) => known.has(s.key));
  const keptKeys = new Set(kept.map((s) => s.key));
  const added = options.filter((o) => !keptKeys.has(o.key)).map((o) => ({ key: o.key, shown: BUILT_IN.includes(o.key) || !!o.iteration }));
  return [...kept, ...added];
}

/** Moves the attribute `key` to just before `target`, for drag and drop. */
export function moveAttribute<T extends { key: string }>(list: T[], key: string, target: string): T[] {
  const moved = list.find((s) => s.key === key);
  if (!moved || key === target) return list;
  const rest = list.filter((s) => s.key !== key);
  rest.splice(rest.findIndex((s) => s.key === target), 0, moved);
  return rest;
}

/** One attribute with its switch per view, as the settings show it. */
export interface CombinedAttribute {
  key: string;
  table: boolean;
  detail: boolean;
}

/**
 * Both views' attribute settings as one list in one order, the table's: the settings show and
 * reorder them together, while each view keeps its own switch.
 *
 * @example
 *   combineAttributes(settings.tableAttributes, settings.detailAttributes, options);
 */
export function combineAttributes(table: AttributeSetting[] | null, detail: AttributeSetting[] | null, options: AttributeOption[]): CombinedAttribute[] {
  const detailShown = new Map(resolveAttributes(detail, options).map((a) => [a.key, a.shown]));
  return resolveAttributes(table, options).map((a) => ({ key: a.key, table: a.shown, detail: detailShown.get(a.key) ?? false }));
}

/** Splits the combined list back into the two settings, both in the shared order. */
export function splitAttributes(list: CombinedAttribute[]): { tableAttributes: AttributeSetting[]; detailAttributes: AttributeSetting[] } {
  return {
    tableAttributes: list.map((a) => ({ key: a.key, shown: a.table })),
    detailAttributes: list.map((a) => ({ key: a.key, shown: a.detail })),
  };
}

/** The keys a view shows, in the shared order. */
export function shownKeys(list: CombinedAttribute[], view: "table" | "detail"): string[] {
  return list.filter((a) => a[view]).map((a) => a.key);
}

/**
 * The keys one table shows, in the shared order: its own switches from its header menu, and for
 * attributes it has no switch for, the shared table switch from before tables had their own.
 *
 * @param own  The table's switches, from the "tableColumns" setting.
 *
 * @example
 *   tableKeys(combined, { labels: false }); // every key shown in tables, without "labels"
 */
export function tableKeys(list: CombinedAttribute[], own: Record<string, boolean> = {}): string[] {
  return list.filter((a) => own[a.key] ?? a.table).map((a) => a.key);
}
