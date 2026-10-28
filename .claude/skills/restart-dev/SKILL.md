---
name: restart-dev
description: Restart the Inbox for GitHub dev window, or build the macOS app. Use after adding React hooks, settings keys, store or schema changes, or src-tauri changes, or when the app shows the crash page after a hot reload.
---

# Restart the dev window or build the app

When it is needed: see `docs/reference/local-development.md` ("When the dev window needs a restart").

Restart (run the second command in the background):

```sh
pkill -f "target/debug/inbox-for-github"; pkill -f "tauri dev"; pkill -f vite
export PATH=/opt/homebrew/opt/rustup/bin:$PATH && npm run tauri dev > /tmp/claude-inbox/tauri-dev.log 2>&1
```

Then wait until the log shows `target/debug/inbox-for-github` and check it for
`order of Hooks`, `TypeError`, `Unhandled error` or `no such column`. An "exit code 144" from the
previous dev process is its kill, not an error.

Build the app (only when asked): `npm ci`, then `npm run tauri build -- --bundles app -- --locked`, see `docs/releasing.md`.
