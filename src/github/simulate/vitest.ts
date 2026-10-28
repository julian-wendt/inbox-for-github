import { afterEach, beforeEach } from "vitest";
import { installSimulator } from "./server";
import { InboxSession, type SessionSettings } from "./session";
import { GitHubSimulator } from "./world";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Gives each test a fresh simulated GitHub, the global `fetch` routed to it, and an app session
 * on top, and puts `fetch` back afterwards. Call it once inside a `describe`.
 *
 * @param settings  The app settings the session starts with.
 * @returns `world` to script what happens on GitHub and `app` to act as the viewer; both are
 *          renewed before every test, so read them inside the test.
 *
 * @example
 *   const sim = simulation();
 *   it("lists a mention", async () => {
 *     sim.world.comment(sim.world.issue(), "alice", "@octocat?");
 *     await sim.app.refresh();
 *   });
 */
export function simulation(settings?: SessionSettings): { readonly world: GitHubSimulator; readonly app: InboxSession } {
  let world: GitHubSimulator;
  let app: InboxSession;
  let restore: () => void;
  beforeEach(() => {
    world = new GitHubSimulator({ viewer: "octocat", orgs: ["octo-org"] });
    restore = installSimulator(world);
    app = new InboxSession(world, settings);
  });
  afterEach(() => restore());
  return {
    get world() {
      return world;
    },
    get app() {
      return app;
    },
  };
}
