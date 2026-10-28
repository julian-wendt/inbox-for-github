import { useCallback, useEffect, useRef, useState } from "react";
import { isDemo } from "../demo/flag";
import { log } from "../log";
import { loadOrcaRepos, orcaRepoFor, type OrcaRepos } from "../orca";
import { useWindowFocus } from "./useWindowFocus";

/** Each read starts Orca's CLI, so a focus within this time of the last read reuses it. */
const RELOAD_AFTER_MS = 60_000;

/** What `useOrca` gives: the lookup, where a missing repo goes, and a fresh read after adding one. */
export interface Orca {
  /** Orca's repo id for an item's repo ("owner/name"), undefined when Orca does not have it. */
  repoOf: (repo: string) => string | undefined;
  /** The folder a repo Orca lacks is added from or cloned into (see `repoHome`); null without Orca or any repo in it. */
  home: string | null;
  /** Reads Orca's repos again, e.g. after `addToOrca`. */
  reload: () => void;
  /** Orca answered the last read: it is installed and its runtime reachable. */
  available: boolean;
}

/**
 * Which GitHub repos Orca knows, read when the app starts and again when its window gains focus,
 * so a repo added in Orca meanwhile shows up. Without Orca, or in the demo, nothing is known and
 * the "Open in Orca" actions stay hidden.
 *
 * @example
 *   const orca = useOrca();
 *   const repoId = orca.repoOf(item.repo); // "da7a86b6-…" or undefined
 */
export function useOrca(): Orca {
  const [repos, setRepos] = useState<OrcaRepos & { available: boolean }>(() => ({ ids: new Map(), home: null, available: false }));
  const focused = useWindowFocus();
  const loadedAt = useRef(0);
  const load = useCallback(() => {
    loadedAt.current = Date.now();
    loadOrcaRepos()
      .then((next) => setRepos({ ...next, available: true }))
      .catch((e: unknown) => {
        setRepos({ ids: new Map(), home: null, available: false });
        log.debug("orca", { repos: "unavailable", error: String(e) });
      });
  }, []);
  useEffect(() => {
    if (isDemo() || !focused || Date.now() - loadedAt.current < RELOAD_AFTER_MS) return;
    load();
  }, [focused, load]);
  const repoOf = useCallback((repo: string) => orcaRepoFor(repos.ids, repo), [repos]);
  return { repoOf, home: repos.home, reload: load, available: repos.available };
}
