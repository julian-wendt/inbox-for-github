# Building and releasing

There is no CI and no release automation yet; the app is built by hand on a Mac.

## Building the app

```sh
export PATH=/opt/homebrew/opt/rustup/bin:$PATH   # when rustup comes from Homebrew
npm run tauri build -- --bundles app
```

The result is `src-tauri/target/release/bundle/macos/Inbox for GitHub.app`. It is unsigned:
open it the first time via right-click → Open. Copy it to `/Applications` to install.

Before a build, go through [`TESTING.md`](../TESTING.md) for what the change touched.

## Regenerating the app icon

The source is `src-tauri/icons/icon.svg`.

1. Render the SVG to a 1024×1024 PNG with a **transparent** background. Headless Edge or Chrome
   works (`--headless --screenshot --window-size=1024,1024` on an HTML page that shows the SVG
   with a transparent body); `qlmanage` adds a white background, so do not use it.
2. `npx tauri icon <that png>` writes every size into `src-tauri/icons/`.
3. Delete the generated `android/` and `ios/` folders there; the app is macOS only.

## Data and identifiers

The bundle identifier `io.github.julian-wendt.github-task-tracker` decides where the app stores
its database. Changing it moves the data and needs a migration; see #2 before touching it.
