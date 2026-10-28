# Building and releasing

A release is a decision, not a side effect of a merge: a workflow prepares it, you approve it by
merging a PR, and the app is built on the Mac and attached by hand. No runner builds the app: a
macOS runner in CI would use up the monthly Actions quota fast
(macOS minutes count ten times against that quota).

## Releasing

1. **Merge your PRs into `main` as usual.** The `Release` workflow (`.github/workflows/release.yml`,
   release-please) reads the conventional commits since the last release and keeps one release PR
   up to date. `fix:` bumps the patch, `feat:` the minor, a breaking change the major (minor while
   below 1.0); `docs:`, `chore:`, `refactor:`, `test:` and `ci:` alone release nothing. The PR carries
   the version in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`, and the changelog.
2. **Merge the release PR when you want a release.** That sets the tag `v<version>` and creates a
   **draft** release with the notes. Its checks need an "Approve and run" click, since it is opened
   with the workflow's own token.
3. **Build and attach the app on the Mac,** from any branch:

   ```sh
   npm run release:check     # the checks only
   npm run release:upload    # build the tag, zip, gh release upload
   npm run release:publish   # the same, then publish the draft
   ```

   The script takes the newest release, refuses if it has a download already or if `package.json`
   at its tag has another version, and builds the tag in a temporary worktree (`npm ci`, then the
   build below), so your checkout stays as it is. It needs Rust as described below and says so
   before it installs anything when `cargo` is not on the path.
4. **Publish the draft** in GitHub, or let `release:publish` do it right after the upload. A draft
   without a download is a release you have not finished.

Apple Silicon only, unsigned (first start via right-click → Open). Release PRs may change the version
fields in the two lockfiles; other lockfile changes still need approval.

`release-please-config.json` has the settings; `.release-please-manifest.json` holds the last released
version. The `Checks` workflow runs typecheck, lint and tests on every PR.

**`Cargo.lock` needs `.value` in its filter** (verified 2026-10-27, release-please 17.6.0): the `toml`
updater parses with a tagging parser that wraps every string in an object with its position, so
`@.name=='…'` never matches and the lockfile stays behind (the first release PR left it at
0.1.0, and `cargo build --locked` then fails). The filter in `release-please-config.json` is
`@.name.value=='inbox-for-github'`. `Cargo.toml` (`$.package.version`) works as is. Check on each
release PR that `src-tauri/Cargo.lock` is among the changed files.

## Building the app

```sh
export PATH=/opt/homebrew/opt/rustup/bin:$PATH   # when rustup comes from Homebrew
npm ci                                           # installs exactly package-lock.json
npm run tauri build -- --bundles app -- --locked # --locked: Cargo fails instead of changing Cargo.lock
```

The result is `src-tauri/target/release/bundle/macos/Inbox for GitHub.app`. It is unsigned:
open it the first time via right-click → Open. Copy it to `/Applications` to install.

Before a build, go through [`TESTING.md`](../TESTING.md) for what the change touched.

**`stripping debug info with rust-objcopy failed: signal: 6`** (verified 2026-10-27, Rust 1.99.1
on aarch64): since Rust 1.98 `rust-objcopy` loads `libLLVM.dylib` through `@loader_path/../lib`,
where the `rustc` component does not ship it ([rust-lang/rust#164063](https://github.com/rust-lang/rust/issues/164063)).
The build still succeeds, but the binary keeps its debug info (8.7 instead of 7.0 MB).
`rustup component add llvm-tools` puts the library there and the warning goes away.

## Regenerating the app icon

The source is `src-tauri/icons/icon.svg`.

1. Render the SVG to a 1024×1024 PNG with a **transparent** background. Headless Edge or Chrome
   works (`--headless --screenshot --window-size=1024,1024` on an HTML page that shows the SVG
   with a transparent body); `qlmanage` adds a white background, so do not use it.
2. `npx tauri icon <that png>` writes every size into `src-tauri/icons/`.
3. Delete the generated `android/` and `ios/` folders there; the app is macOS only.

## Data and identifiers

The bundle identifier `inbox-for-github` decides where the app stores its database. Changing it
moves the data and needs a migration like `migrate_data_dir` in `src-tauri/src/lib.rs`; see
[`architecture.md`](reference/architecture.md#local-data).
