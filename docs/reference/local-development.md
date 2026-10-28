# Local development

## Setup

See the README for requirements (macOS, Node 22+, Rust via rustup, `gh auth login`). If `cargo`
comes from Homebrew's rustup, put it on the path for the session:

```sh
export PATH=/opt/homebrew/opt/rustup/bin:$PATH
npm install
npm run tauri dev
```

## When the dev window needs a restart

Vite hot reload keeps component state, which breaks in these cases; stop and start
`npm run tauri dev` again:

- **New or removed React hooks** in a mounted component (React reports "change in the order of
  Hooks"; the error boundary shows its crash page). "Reload" on that page also works.
- **A new settings key**, since the running state has no value for it yet.
- **Store or schema changes** in `src/store.ts`; columns are added in `Store.open`, which only
  runs at start.
- **Changes to `src-tauri/`** or `tauri.conf.json`.

Stopping all dev processes:

```sh
pkill -f "target/debug/inbox-for-github"; pkill -f "tauri dev"; pkill -f vite
```

## The local database

`~/Library/Application Support/inbox-for-github/tracker.db`
(tables in [`architecture.md`](architecture.md#local-data)). Read it only, while the app may be
running:

```sh
sqlite3 -readonly "$HOME/Library/Application Support/inbox-for-github/tracker.db" \
  "select node_id, status, changed_at, until from item_status limit 5"
```

The cached items are one JSON array in `item_cache.items`, handy for checking what the app
classifies without a request.

`status_log.source` says what caused each status change since 2026-10-25 (older rows are empty):
the viewer's input within two seconds before it (`key:o`, `key:ctrl+a`, `menu`, `palette`,
`click`, or `unknown`), or the app's own code path (`auto:reopen`, `auto:snooze-ended`,
`auto:legacy-done`, `auto:reminder-to-follow-up`), or `settings:reset` for the reset of all statuses
in the settings. `automatic` is also 1 for an item the viewer
takes back into the work, so `source` is the one to trust. The last changes, in local time:

```sh
sqlite3 -readonly "$HOME/Library/Application Support/inbox-for-github/tracker.db" \
  "select datetime(changed_at, 'localtime'), node_id, status, automatic, source from status_log order by id desc limit 10"
```

## The log

Settings › General › Logging (off by default) writes `inbox.log` to
`~/Library/Logs/inbox-for-github/`, rotated at 2 MB into `inbox.1.log`
… `inbox.4.log`; "Show log file" opens the folder. Lines are `time level message key=value …` in
UTC (`log.ts`, written by the Rust commands `log_write` and `log_reveal`).

- **Debug:** store opened, cache loaded and saved, each refresh (full or delta, items, duration,
  points spent and left), rate-limit pauses, writes to GitHub with their result, and every status
  change as `from → to` with its source, the view and whether the pop-up was open.
- **Verbose:** adds every GraphQL request (operation, variables without any `body`, status,
  `x-ratelimit-*`, duration), delta merges, and why `classify` put an item where it is (with its
  title, which Debug leaves out).

Never log the token or comment and issue texts. The build's commit (`__APP_COMMIT__`, set by
`vite.config.ts` from `git rev-parse`, with `-dirty` for uncommitted changes) is in the
`app started` line and in every `status change` line, so a line can be matched to a code state
even after the file rotated. The dev window takes it when it starts, not on hot reloads.

## Demo mode

For screenshots and showcases without real organizations, repositories or people. Start the dev
window with the environment variable, or switch from inside the app with ⌘K → "Show demo data"
(the window reloads; "Leave demo mode" goes back, except when started with the variable):

```sh
VITE_DEMO=1 npm run tauri dev
```

The app then talks to a simulated GitHub (`src/github/simulate/`) holding a fictional world
(`src/demo/world.ts`: the viewer `juniper`, the owners `lumen-labs`, `harbor-works` and
`juniper`, about thirty items covering every case the views show) and keeps its statuses, notes
and settings in memory (`MemoryStore`, seeded by `src/demo/seed.ts`). Nothing reaches GitHub, no
token is needed, and the real database is not touched; a restart starts over. Times are relative
to the start, so "2 hours ago" stays true. Posting, closing, reopening and assigning work and
change the world in memory. Avatars are generated and inline, so nothing loads from the network.

**Screenshots.** `scripts/demo-screenshots.mjs` takes the main views (inbox with and without the
detail, follow-ups, done, assigned, created by me, help, settings) in light and dark, English and
German, at 1400×900 and double density. It needs no dependency: it drives Chrome or Edge headless
against the Vite dev server, with Tauri's window API stubbed, and the demo takes the language and
theme from the address (`?lang=de&theme=light`):

```sh
VITE_DEMO=1 npx vite &          # http://localhost:1420
node scripts/demo-screenshots.mjs --out demo-screenshots [--langs en,de] [--themes dark,light] [--size 1400x900]
```

The result is the browser's rendering of the same page, not the native window's frame; for a
shot of the window itself, start the demo in Tauri and capture it with macOS. The script removes
the dev build's orange mark, paints a neutral ground per theme where the window's vibrancy would
show through the sidebar, and widens the sidebar and the list so names and titles fit. The README's
`docs/images/inbox-dark.png` is a capture of the real window instead: a build with `VITE_DEMO=1`
(`npm run tauri build`), taken with ⇧⌘4 and Space, metadata removed.

To show a new case, add it to `buildDemoWorld` (and `demoSeed` for follow-ups, filings and
read marks); `src/demo/demo.test.ts` says which view each item must land in.

## Native date and time fields

Verified 2026-10-23 against WebKit `main` and on macOS 26.7.1:

- WebKit builds the locale of `<input type="date">` and `datetime-local` from the first preferred
  language only; the `lang` attribute is ignored while `LangAttributeAwareFormControlUIEnabled` is
  off, its default (`Source/WebCore/page/Settings.yaml`, `BaseDateAndTimeInputType.cpp`).
- That locale is created from the identifier (`LocaleCocoa.mm`), so the region and the 24-hour
  switch in System Settings do not apply: `en-US` gives `h:mm a`, while the Mac's current locale
  `en_US@rg=dezzzz` gives `HH:mm`.
- The web processes take `AppleLanguages` from the app's preferences domain or its command-line
  arguments (`-AppleLanguages "(en-DE)"`); a volatile `NSArgumentDomain` set at runtime does not
  reach them. Checked with a WKWebView probe reading `navigator.languages`.
- WebKit matches the value to a localization it has and drops BCP 47 extensions: `en-DE` →
  `en-GB` (picker `24/10/2026, 17:30`), `de-DE` stays, `en-US-u-hc-h23` → `en-US`
  (`10/24/2026, 05:30 PM`). So a 24-hour clock forced on a 12-hour region cannot be passed on.

Writing `en-DE` into the app's `AppleLanguages` at start gave 24-hour time in the probe, but
not in the Tauri window (tried and reverted 2026-10-23). The snooze picker therefore follows the
first system language; a 24-hour picker needs fields of our own.

## Notifications

Read in the sources of `tauri-plugin-notification` 2.7.0 (`src/desktop.rs`), `notify-rust`
4.18.2 (`src/macos/nsusernotifications.rs`) and `mac-notification-sys` 0.6.15 on 2026-10-25:

- A click on a notification is reported as `actionId: "tap"`, a click on one of its buttons as
  the action's id, to Rust handlers (`on_action`) and JavaScript `onAction` listeners, with the
  notification's `extra`. Only notifications shown while a handler or listener exists report it;
  the shell registers its handler at setup, which brings the window forward, and `useAttention`
  picks the item from `extra.itemId`.
- **On macOS only a notification with a button reports a click.** `mac-notification-sys` waits for
  an answer only when there is a button or `wait_for_click` (`needs_response()` in
  `notification.rs`), and `notify-rust` never sets `wait_for_click` (commented out). A plain
  notification returns at once and a later click is lost (seen in the built app, 2026-10-25). So
  every notification carries an "Open" button (action type `item`).
- `notification:default` already allows the listener; no capability change was needed.
- In `tauri dev` the plugin sends notifications as `com.apple.Terminal`, so a click there may
  bring the Terminal forward too; the built app sends them under its own identifier.
- There is no `interruptionLevel`: notifications cannot be marked time-sensitive.
- Notifications cannot be scheduled on desktop. Summaries are sent by the running app, which
  checks its schedule every 30 s (`TICK_MS` in `useAttention`); a summary due while the app is
  quit goes out at the next start.

## Measuring a query

```sh
gh api graphql -f query='query { rateLimit(dryRun: true) { cost remaining } search(…) { … } }'
```

See [`github-api.md`](github-api.md) for the current costs.
