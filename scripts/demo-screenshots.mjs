#!/usr/bin/env node
/**
 * Screenshots of the demo mode for the README, a website or a store listing: every main view,
 * the detail, the help and the settings, in light and dark, English and German, at a fixed size.
 *
 * Needs no dependency: it drives Chrome or Edge headless over the DevTools protocol (Node 22+)
 * against the Vite dev server, which stands in for the Tauri window; Tauri's window API is stubbed.
 * The shots look like the installed app: the dev build's orange mark is removed, a neutral ground
 * per theme stands in for the window's vibrancy behind the translucent sidebar, and the traffic
 * lights macOS draws over the overlay title bar are painted where `tauri.conf.json` puts them.
 *
 *   VITE_DEMO=1 npx vite &                       # serves http://localhost:1420
 *   node scripts/demo-screenshots.mjs --out demo-screenshots
 *
 * Options: --url <address> (default http://localhost:1420/), --out <folder>, --size 1400x900,
 * --langs en,de, --themes dark,light, --browser <path> (default: the first of Chrome, Edge,
 * Chromium found on macOS, or $BROWSER).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []));
const base = args.url ?? "http://localhost:1420/";
const out = args.out ?? "demo-screenshots";
const [width, height] = (args.size ?? "1400x900").split("x").map(Number);
const langs = (args.langs ?? "en,de").split(",");
const themes = (args.themes ?? "dark,light").split(",");
const browser =
  args.browser ??
  process.env.BROWSER ??
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].find(existsSync);
if (!browser) throw new Error("No Chrome, Edge or Chromium found; pass --browser <path>.");

/** What the window API of Tauri would answer, so the app starts in a plain browser. */
const TAURI_STUB = `
window.isTauri = true;
window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
  invoke: async () => null,
  transformCallback: () => 1,
  unregisterCallback: () => {},
  convertFileSrc: (path) => path,
};
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
`;

/** Columns wide enough that the search field, the viewer's name and the item titles fit (see useColumnWidths). */
const WIDTHS = `localStorage.setItem("column-widths", JSON.stringify({ sidebar: 264, list: 440 }));`;

/** What shows through the translucent sidebar in place of the window's vibrancy, per theme. */
const GROUND = { dark: { r: 30, g: 31, b: 35, a: 1 }, light: { r: 236, g: 237, b: 240, a: 1 } };

/** Close, minimize and zoom as macOS draws them, 12px wide on a 20px step, at trafficLightPosition. */
const TRAFFIC_LIGHTS = `(() => {
  const lights = document.createElement("div");
  lights.style.cssText = "position:fixed;left:18px;top:16px;display:flex;gap:8px;z-index:2147483647;pointer-events:none";
  for (const [fill, rim] of [["#ff5f57", "#e0443e"], ["#febc2e", "#dea123"], ["#28c840", "#1aab29"]]) {
    const light = document.createElement("span");
    light.style.cssText = \`width:12px;height:12px;border-radius:50%;background:\${fill};box-shadow:inset 0 0 0 0.5px \${rim}\`;
    lights.append(light);
  }
  document.body.append(lights);
})()`;

/** The shots of one run: what to press (keys of the app), then the file name. Views follow the keys 1–5. */
const SHOTS = [
  { name: "inbox", keys: [{ key: "1" }] },
  { name: "inbox-detail", keys: [{ key: "1" }, ...Array(4).fill({ key: "ArrowDown" })] },
  { name: "follow-ups", keys: [{ key: "2" }] },
  { name: "done", keys: [{ key: "3" }] },
  { name: "assigned", keys: [{ key: "4" }] },
  { name: "created-by-me", keys: [{ key: "5" }] },
  { name: "help", keys: [{ key: "1" }, { key: "?" }] },
  { name: "settings", keys: [{ key: "1" }, { key: ",", metaKey: true }] },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = 9400 + Math.floor(Math.random() * 400);
const profile = join(tmpdir(), `demo-screenshots-${process.pid}`);
const child = spawn(browser, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore" });

try {
  let targets;
  for (let attempt = 0; attempt < 50 && !targets; attempt++) {
    targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json(), () => null);
    if (!targets) await sleep(200);
  }
  const socket = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => (socket.onopen = resolve));
  let counter = 0;
  const waiting = new Map();
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    waiting.get(data.id)?.(data);
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++counter;
      waiting.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
  const press = ({ key, metaKey = false }) =>
    send("Runtime.evaluate", { expression: `window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, metaKey: ${metaKey}, bubbles: true }))` }).then(() => sleep(350));

  mkdirSync(out, { recursive: true });
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: TAURI_STUB });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: WIDTHS });

  for (const lang of langs) {
    for (const theme of themes) {
      await send("Emulation.setDefaultBackgroundColorOverride", { color: GROUND[theme] });
      for (const shot of SHOTS) {
        await send("Page.navigate", { url: `${base}?lang=${lang}&theme=${theme}` });
        await sleep(5000);
        await send("Runtime.evaluate", { expression: "delete document.documentElement.dataset.env" });
        await send("Runtime.evaluate", { expression: TRAFFIC_LIGHTS });
        for (const key of shot.keys) await press(key);
        await sleep(600);
        const image = await send("Page.captureScreenshot", { format: "png" });
        const file = join(out, `${lang}-${theme}-${shot.name}.png`);
        writeFileSync(file, Buffer.from(image.result.data, "base64"));
        console.log(file);
      }
    }
  }
  socket.close();
} finally {
  child.kill();
}
