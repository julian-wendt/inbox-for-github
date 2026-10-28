# Instructions for Agents

Inbox for GitHub is a macOS desktop app that turns GitHub mentions, review requests and
assignments into a calm inbox with local statuses (open, follow-up, done). It reads
GitHub through the GraphQL API with the `gh` CLI's token and keeps everything else on the Mac.

## Key technologies

- **Shell:** Tauri 2 (Rust, `src-tauri/`), commands `gh_token`, `log_write` and `log_reveal`
- **UI:** React 19, TypeScript, Vite; `motion` for animation, `cmdk` for the palette, `lucide-react` icons
- **Storage:** SQLite through `@tauri-apps/plugin-sql` (`src/store.ts`)
- **Tests:** Vitest, unit tests next to the code (`*.test.ts`)

## Repository structure

```
/
├── src/
│   ├── github/        # GraphQL client, rate limits, search, deltas, boards, comments
│   ├── rules/         # optional inbox rules
│   ├── classify.ts    # which view an item belongs in (with reopen.ts, review.ts, timeline.ts)
│   ├── store.ts       # SQLite: settings, statuses and their log, notes, seen, cache
│   └── ui/            # hooks and helpers; parts/ = components, styles/ = CSS, locales/ = texts
├── src-tauri/         # Tauri shell; icons/icon.svg is the icon source
├── docs/              # conventions and reference (see the table below)
├── CONTRIBUTING.md    # binding rules for changes (read it)
└── TESTING.md         # manual test checklist
```

## Critical rules

- **Read before you edit**, even for a one-line change: this file, [`CONTRIBUTING.md`](CONTRIBUTING.md) and the doc for what you touch (table below).
- **Every UI text in both dictionaries:** `src/ui/locales/en.ts` is the source, `de.ts` mirrors it. No literal UI strings in components.
- **Contrast:** WCAG AA in light and dark, 4.5:1 for text, 3:1 for icons and control states. Compute it; see [`ui.md`](docs/conventions/ui.md).
- **GitHub writes are limited** to plain comments, close/reopen and assigning or unassigning yourself. No review actions, no edits of others' text.
- **Statuses, notes and settings never leave the Mac.**
- **Frugal with the API:** measure a query's cost with `rateLimit(dryRun: true) { cost }` before shipping it; filter locally instead of refetching. See [`github-api.md`](docs/reference/github-api.md).
- **No breaking changes without asking:** settings keys, DB tables and columns, the cache format, the bundle identifier. Add next to it instead.
- **Ask first** before adding dependencies or touching lockfiles, `.github/`, release scripts or `tauri.conf.json`.
- **Commit as you go:** one commit per logical step on the feature branch, conventional messages, pushed. No asking needed. Never tag or release by hand, never push to `main`.

## Commands

```sh
npm run tauri dev                    # dev window (restart it after new settings keys, hooks or store changes)
VITE_DEMO=1 npm run tauri dev        # the same on a simulated GitHub with made-up data, for screenshots
npm run tauri build -- --bundles app # src-tauri/target/release/bundle/macos/Inbox for GitHub.app
npm run typecheck                    # tsc --noEmit
npm run lint                         # ESLint
npm test                             # Vitest
```

## Checks before every commit

`npm run typecheck`, `npm run lint` and `npm test` all pass. Fix the findings you caused; do not just note them.

## Where things are documented

| If you are … | Read |
|---|---|
| changing how items are fetched, classified or cached | [`architecture.md`](docs/reference/architecture.md) |
| touching a GraphQL query, its cost or rate limits | [`github-api.md`](docs/reference/github-api.md) |
| running the app locally, restarting it, reading the local DB | [`local-development.md`](docs/reference/local-development.md) |
| touching "Open in Orca" or the Orca CLI calls | [`orca.md`](docs/reference/orca.md) |
| writing or commenting code | [`code-style.md`](docs/conventions/code-style.md) |
| changing UI, colors, texts or keyboard shortcuts | [`ui.md`](docs/conventions/ui.md) |
| adding or changing a setting | [`settings.md`](docs/conventions/settings.md) |
| adding tests or checking a change by hand | [`testing.md`](docs/testing.md), [`TESTING.md`](TESTING.md) |
| building the app or regenerating the icon | [`releasing.md`](docs/releasing.md) |
| wondering why something is the way it is | [`decisions.md`](docs/decisions.md) |
| doing a recurring task (setting, UI text, restart, query cost, contrast, icon, issue) | the skills in [`.claude/skills/`](.claude/skills/) |
| reviewing a change before handover | the `reviewer` agent in [`.claude/agents/`](.claude/agents/reviewer.md) |

## Reference files

@CONTRIBUTING.md
