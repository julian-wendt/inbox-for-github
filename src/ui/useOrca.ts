import { useCallback, useEffect, useRef, useState } from "react";
import { isDemo } from "../demo/flag";
import { log } from "../log";
import { loadOrcaRepos, orcaRepoFor } from "../orca";
import { useWindowFocus } from "./useWindowFocus";

/** Each read starts Orca's CLI, so a focus within this time of the last read reuses it. */
const RELOAD_AFTER_MS = 60_000;

/**
 * Which GitHub repos Orca knows, read when the app starts and again when its window gains focus,
 * so a repo added in Orca meanwhile shows up. Without Orca, or in the demo, nothing is known and
 * the "Open in Orca" actions stay hidden.
 *
 * @returns  A lookup from an item's repo ("owner/name") to Orca's repo id, undefined when Orca
 *           does not have the repo.
 *
 * @example
 *   const orcaRepo = useOrca();
 *   const repoId = orcaRepo(item.repo); // "da7a86b6-…" or undefined
 */
export function useOrca(): (repo: string) => string | undefined {
  const [ids, setIds] = useState<Map<string, string>>(() => new Map());
  const focused = useWindowFocus();
  const loadedAt = useRef(0);
  useEffect(() => {
    if (isDemo() || !focused || Date.now() - loadedAt.current < RELOAD_AFTER_MS) return;
    loadedAt.current = Date.now();
    loadOrcaRepos()
      .then(setIds)
      .catch((e: unknown) => log.debug("orca", { repos: "unavailable", error: String(e) }));
  }, [focused]);
  return useCallback((repo: string) => orcaRepoFor(ids, repo), [ids]);
}
