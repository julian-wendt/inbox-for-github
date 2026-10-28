import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./App";
import { ErrorBoundary } from "./ui/parts/ErrorBoundary";
import { noteInput } from "./ui/inputTrail";
import "./ui/styles/tokens.css";
import "./ui/styles/base.css";

// The dev window gets a tinted sidebar, so it is never mistaken for the installed app.
if (import.meta.env.DEV) document.documentElement.dataset.env = "dev";

// WebKit focuses clicked buttons and matches :focus-visible for them; the focus cue is for the keyboard only.
document.addEventListener("pointerdown", () => (document.documentElement.dataset.input = "pointer"), true);
document.addEventListener("keydown", () => delete document.documentElement.dataset.input, true);
document.addEventListener("pointerdown", () => noteInput("click"), true);

// Escape left unhandled by the web view reaches the window, which then leaves macOS full screen.
window.addEventListener("keydown", (e) => e.key === "Escape" && e.preventDefault(), true);

// The web view's own menu offers Reload and the like; only text fields keep it, for copy and paste. The dev window keeps it for Inspect.
if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (e) => {
    if (!(e.target instanceof Element && e.target.closest("input, textarea, [contenteditable]"))) e.preventDefault();
  });
}

// Scrollbars show only while an area scrolls (see base.css); each fades out shortly after it stops.
const idle = new WeakMap<Element, number>();
document.addEventListener(
  "scroll",
  (e) => {
    const area = e.target instanceof Element ? e.target : document.documentElement;
    area.setAttribute("data-scrolling", "");
    window.clearTimeout(idle.get(area));
    idle.set(area, window.setTimeout(() => area.removeAttribute("data-scrolling"), 800));
  },
  true,
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
