# Inbox for GitHub

A small macOS app that collects everything you are asked for on GitHub, so no request gets lost:
issues assigned to you, mentions you have not answered yet, and pull requests waiting for your
review. An item stays in the inbox until you act on it.

## What it does

- **Five views:** *Inbox* (someone waits for you: a mention or a review request; your
  follow-ups wait in its *Later* bar), *Planned* (what you pinned for today or planned for a
  day), *Done*, *Assigned to me* (by type or board status, with "my part done") and *Created by me*. Answered mentions and reviews move to *Done* on their own;
  follow-ups and done items come back when someone needs you again. A light bulb in the detail
  view explains why an item is where it is.
- **Your own status** per item: open, follow-up (F) or done (D), with undo (⌘Z). Statuses and
  their history live only on your Mac and are never sent to GitHub.
- **Reply from the app:** a comment box modeled on GitHub's, with Markdown toolbar and preview,
  plus close (as completed or not planned) and reopen. Reviews, approvals and inline comments
  stay in GitHub's own UI.
- **Organizations and your personal repositories**, each narrowed to all repos, all but some,
  or only selected ones.
- **Works offline** from the last successful fetch, and keeps an eye on GitHub's hourly API
  budget: a ring in the sidebar footer shows what is left, and automatic refreshes wait when it
  runs low or GitHub asks to slow down.
- Board status and sprint from GitHub Projects, closed and merged items for a few days,
  notifications and a dock badge, English and German, light and dark mode. Every one of these
  can be switched or tuned in the settings.

## Requirements

- macOS, Node 22+ and npm
- Rust (`brew install rustup && rustup default stable`)
- GitHub CLI, logged in: `gh auth login`. The app needs the scopes `repo`, `read:org` and
  `project`; if one is missing, it says so and shows the command that adds it
  (`gh auth refresh -s repo,read:org,project`).

## Run

```sh
npm install
npm run tauri dev                    # development window
npm run tauri build -- --bundles app -- --locked # src-tauri/target/release/bundle/macos/Inbox for GitHub.app
npm test                             # unit tests (vitest)
npm run lint                         # ESLint
```

On first start, pick the organizations to watch. Settings, statuses and the cached fetch are
stored in the app's local database under
`~/Library/Application Support/inbox-for-github/`, never in this
repository. The token is read from `gh` on every refresh and never stored.

The app is unsigned; open it the first time via right-click → Open.

## Layout

- `src/github/` — GraphQL client, rate-limit handling, search and mutations
- `src/classify.ts`, `src/reopen.ts`, `src/review.ts`, `src/rules/` — which view an item belongs in
- `src/store.ts` — local SQLite store for settings, statuses, their history and the cache
- `src/ui/` — React UI; texts in `src/ui/locales/` (English is the source, German mirrors it)
- `src-tauri/` — the Tauri shell; `icons/icon.svg` is the source of the app icon

## Contributing

Start with [`AGENTS.md`](AGENTS.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md); topic docs are in [`docs/`](docs/).
