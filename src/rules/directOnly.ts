import type { Item } from "../model";
import { sameLogin } from "../timeline";

/** Organization login → names of the repos (without the owner) the rule covers. */
export type Scopes = Record<string, string[]>;

/**
 * The "only addressed to me" rule: in the repos it is switched on for, a review request that
 * reached the viewer only through a team does not count. The item loses its "review" reason, so
 * it leaves the inbox and sends no notification; a request naming the viewer, a mention or an
 * assignment still counts.
 *
 * `reviewRequests` lists every request event, so a request to the viewer that was withdrawn
 * still counts as direct.
 *
 * @param item    An item from `fetchItems`.
 * @param me      The viewer's login.
 * @param scopes  The repos the rule covers, from the settings; an organization without an
 *                entry is not covered.
 * @returns       The item itself, or a copy without the "review" reason.
 *
 * @example
 *   directOnly(pr, "octocat", { "octo-org": ["docs"] });
 */
export function directOnly(item: Item, me: string, scopes: Scopes): Item {
  if (!item.reasons.includes("review") || !covers(item.repo, scopes)) return item;
  if (item.reviewRequests.some((r) => sameLogin(r.reviewer, me))) return item;
  return { ...item, reasons: item.reasons.filter((r) => r !== "review") };
}

/** Whether the rule is on for `repo` ("owner/name"); names compare case-insensitively. */
export function covers(repo: string, scopes: Scopes): boolean {
  const [owner, name] = repo.toLowerCase().split("/");
  const entry = Object.entries(scopes).find(([org]) => org.toLowerCase() === owner)?.[1];
  return entry?.some((r) => r.toLowerCase() === name) ?? false;
}

/**
 * Switches the rule on or off for one repo.
 *
 * @param repo    The repo's "owner/name".
 * @param scopes  The current `directOnly` setting.
 * @param on      The state wanted.
 * @returns       The new setting, without an entry for an organization left empty; the same
 *                object when nothing changes.
 *
 * @example
 *   setCovered("octo-org/docs", {}, true); // { "octo-org": ["docs"] }
 */
export function setCovered(repo: string, scopes: Scopes, on: boolean): Scopes {
  if (covers(repo, scopes) === on) return scopes;
  const [owner, name] = repo.split("/");
  const key = Object.keys(scopes).find((org) => org.toLowerCase() === owner.toLowerCase()) ?? owner;
  const others = (scopes[key] ?? []).filter((r) => r.toLowerCase() !== name.toLowerCase());
  const next = { ...scopes };
  if (on) next[key] = [...others, name];
  else if (others.length > 0) next[key] = others;
  else delete next[key];
  return next;
}
