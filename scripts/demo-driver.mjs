/**
 * Drives the demo mode in a headless Chrome or Edge, like a person would: keys, real mouse
 * clicks, hovering, typing, reading the page, screenshots. The simulated GitHub is reachable
 * as `window.__demo` ({ world, refs }) for changing what happens "on GitHub" while the app runs.
 * Tauri's window API is stubbed, so the page needs no shell; no dependency, Node 22+.
 *
 *   VITE_DEMO=1 npx vite &                      # http://localhost:1420
 *   const app = await openDemo({ lang: "en" });
 *   await app.press("4");                       // Assigned to me
 *   await app.click("Fix rounding");            // by visible text, with a real mouse click
 *   await app.world((w, r) => w.comment(r.retries, "tobias-k", "@juniper ping"));
 *   await app.press("r", { meta: true });       // ⌘R: refresh from the simulated GitHub
 *   console.log(await app.text());
 *   await app.close();
 */
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Replaces Date so that `window.__setSkew(ms)` moves the page's clock, and the simulated world's with it. */
const PAGE_SETUP = `
window.isTauri = true;
window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
  invoke: async () => null,
  transformCallback: () => 1,
  unregisterCallback: () => {},
  convertFileSrc: (path) => path,
};
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
(() => {
  const RealDate = Date;
  let skew = 0;
  class SkewedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + skew);
      else super(...args);
    }
    static now() {
      return RealDate.now() + skew;
    }
  }
  window.Date = SkewedDate;
  window.__setSkew = (ms) => { skew = ms; };
})();
`;

const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

/**
 * Opens the demo in a fresh headless browser and waits until the list shows.
 *
 * @param options.base   The dev server, default http://localhost:1420/.
 * @param options.lang   "en" or "de".
 * @param options.theme  "dark", "light" or "system".
 * @param options.size   [width, height], default [1400, 900].
 * @param options.skew   Milliseconds the clock runs ahead from the start, e.g. 3 * 3600_000.
 * @returns The helpers: press, click, rightClick, hover, type, text, html, evaluate, world,
 *          skew, shot, wait, errors, close.
 */
export async function openDemo({ base = "http://localhost:1420/", lang = "en", theme = "dark", size = [1400, 900], skew = 0 } = {}) {
  const browser = process.env.BROWSER ?? BROWSERS.find(existsSync);
  if (!browser) throw new Error("No Chrome, Edge or Chromium found; set $BROWSER.");
  const port = 9500 + Math.floor(Math.random() * 3000);
  const child = spawn(browser, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `demo-driver-${process.pid}-${port}`)}`, `--window-size=${size[0]},${size[1]}`, "about:blank"], { stdio: "ignore" });

  let targets;
  for (let attempt = 0; attempt < 60 && !targets; attempt++) {
    targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json(), () => null);
    if (!targets) await sleep(200);
  }
  const socket = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => (socket.onopen = resolve));
  let counter = 0;
  const waiting = new Map();
  const errors = [];
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id) waiting.get(data.id)?.(data);
    else if (data.method === "Runtime.exceptionThrown") errors.push(String(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text).slice(0, 500));
    else if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") errors.push(data.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300));
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++counter;
      waiting.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: PAGE_SETUP });
  await send("Page.navigate", { url: `${base}?lang=${lang}&theme=${theme}` });
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.result.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? "evaluate failed");
    return response.result.result.value;
  };
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(500);
    if (await evaluate("!!window.__demo && document.querySelectorAll('li, .row, [role=option]').length > 0").catch(() => false)) break;
  }
  if (skew) await evaluate(`window.__setSkew(${skew})`);
  await sleep(500);

  /** The center of the first visible element whose own text starts with `text` (or a CSS selector with `css:`). */
  const locate = (target) =>
    evaluate(`(() => {
      const target = ${JSON.stringify(target)};
      const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const all = [...document.querySelectorAll('*')].filter(visible);
      const el = target.startsWith('css:')
        ? document.querySelector(target.slice(4))
        : all.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().startsWith(target)))[0] ??
          all.find((e) => e.getAttribute('aria-label') === target || e.getAttribute('title') === target || e.getAttribute('title')?.startsWith(target + ' ('));
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);

  const mouse = async (target, { button = "left", modifiers = {}, clicks = 1, only } = {}) => {
    const at = typeof target === "object" ? target : await locate(target);
    if (!at) throw new Error(`Nothing to point at: ${JSON.stringify(target)}`);
    const flags = Object.entries(modifiers).reduce((sum, [name, on]) => sum + (on ? MODIFIERS[name] : 0), 0);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y, modifiers: flags });
    if (only === "move") return;
    for (let click = 1; click <= clicks; click++) {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button, clickCount: click, modifiers: flags });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button, clickCount: click, modifiers: flags });
    }
    await sleep(400);
  };

  return {
    errors,
    /** Presses a key of the app (`KeyboardEvent.key`), e.g. press("d"), press("a", { ctrl: true }), press("z", { meta: true }), press("ArrowDown", { shift: true }). */
    async press(key, { meta = false, ctrl = false, shift = false, alt = false, times = 1 } = {}) {
      for (let i = 0; i < times; i++) {
        await evaluate(`(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, metaKey: ${meta}, ctrlKey: ${ctrl}, shiftKey: ${shift}, altKey: ${alt}, bubbles: true, cancelable: true }))`);
        await sleep(250);
      }
    },
    /** A real mouse click on the element with this visible text, aria-label, title, or `css:<selector>`; { meta, shift } for modifiers. */
    click: (target, modifiers = {}, clicks = 1) => mouse(target, { modifiers, clicks }),
    rightClick: (target) => mouse(target, { button: "right" }),
    /** Moves the mouse over an element without clicking (hover). */
    hover: (target) => mouse(target, { only: "move" }),
    /** Types into the focused field. */
    async type(text) {
      await send("Input.insertText", { text });
      await sleep(200);
    },
    /** All visible text of the page. */
    text: () => evaluate("document.body.innerText"),
    /** The titles of the list rows or table rows as shown, top to bottom. */
    rows: () => evaluate("[...document.querySelectorAll('.inbox-list li, [role=option], tr, .table-row')].map((e) => e.innerText.replace(/\\n+/g, ' | ').slice(0, 160))"),
    html: (selector = "body") => evaluate(`document.querySelector(${JSON.stringify(selector)})?.outerHTML ?? null`),
    evaluate,
    /** Runs `(world, refs) => …` inside the page against the simulated GitHub, e.g. world.comment(refs.retries, "tobias-k", "hi"). */
    world: (fn) => evaluate(`(${fn.toString()})(window.__demo.world, window.__demo.refs)`),
    /** Moves the page's clock (and the world's) ahead by ms in total. The app re-reads the time once a minute, so wait up to 65 s; ⌘R fetches but does not re-classify by time. */
    skew: (ms) => evaluate(`window.__setSkew(${ms})`),
    async shot(file) {
      const image = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(file, Buffer.from(image.result.data, "base64"));
      return file;
    },
    wait: sleep,
    async close() {
      socket.close();
      child.kill();
    },
  };
}
