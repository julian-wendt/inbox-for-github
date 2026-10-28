import { isDemo } from "./demo/flag";
import { Store, type Persistence } from "./store";

/**
 * Opens the app's local storage: the SQLite database, or in the demo mode a fresh in-memory
 * store seeded with the demo's statuses, so the real database is never touched.
 *
 * @example
 *   const store = await openStorage();
 *   const settings = await store.settings();
 */
export async function openStorage(): Promise<Persistence> {
  if (isDemo()) return (await import("./demo")).openDemoStorage(window.location.search);
  return Store.open();
}
