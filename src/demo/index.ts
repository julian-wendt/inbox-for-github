import { installSimulator } from "../github/simulate/server";
import type { Persistence, Settings } from "../store";
import type { Lang } from "../ui/i18n";
import { MemoryStore } from "./memoryStore";
import { demoSeed } from "./seed";
import { buildDemoWorld } from "./world";

/**
 * Settings the address can set for a screenshot run: `?lang=de` and `?theme=light|dark|system`.
 * Anything else is ignored.
 */
export function settingsFromAddress(search: string): Partial<Settings> {
  const params = new URLSearchParams(search);
  const language = params.get("lang");
  const theme = params.get("theme");
  return {
    ...(language === "en" || language === "de" ? { language: language satisfies Lang } : {}),
    ...(theme === "light" || theme === "dark" || theme === "system" ? { theme } : {}),
  };
}

/**
 * Starts the demo: builds the fictional world, routes the app's GitHub requests to it, and
 * returns an in-memory storage seeded for it. Posting, closing, reopening and assigning change
 * the world in memory only; nothing reaches GitHub or the real database, and a restart starts
 * over. Loaded on demand, so a normal start carries none of it.
 *
 * @param search  The window's query string, for the language and theme of a screenshot run.
 *
 * @example
 *   const store = await openDemoStorage(window.location.search);
 */
export function openDemoStorage(search = ""): Promise<Persistence> {
  const { world, refs } = buildDemoWorld();
  installSimulator(world);
  // A handle for scripts that change what happens "on GitHub" while the demo runs (scripts/demo-driver.mjs).
  Object.assign(globalThis, { __demo: { world, refs } });
  const seed = demoSeed(refs);
  return Promise.resolve(new MemoryStore({ ...seed, settings: { ...seed.settings, ...settingsFromAddress(search) } }));
}
