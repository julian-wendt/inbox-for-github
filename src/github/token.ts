import { invoke } from "@tauri-apps/api/core";
import { isDemo } from "../demo/flag";

/**
 * The GitHub token for the next request: the `gh` CLI's, read fresh each time and never stored.
 * The demo mode needs none, since nothing leaves the app, and gets a placeholder.
 *
 * @example
 *   const items = await fetchItems(await ghToken(), orgs, { me: "octocat" });
 */
export function ghToken(): Promise<string> {
  return isDemo() ? Promise.resolve("demo-token") : invoke<string>("gh_token");
}
