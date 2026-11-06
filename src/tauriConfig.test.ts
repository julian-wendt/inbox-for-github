import { describe, expect, it } from "vitest";
import config from "../src-tauri/tauri.conf.json";

describe("tauri.conf.json", () => {
  it("keeps the webview's timers running while the window is in the background", () => {
    expect(config.app.windows[0].backgroundThrottling).toBe("disabled");
  });
});
