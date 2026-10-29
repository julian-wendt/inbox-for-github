# Building and releasing

A release is a decision, not a side effect of a merge: a workflow prepares it, you approve it by
merging a PR, and a macOS runner builds the app. The tag `v<version>` only exists once that build
passed, since a published tag cannot be taken back.

## Releasing

1. **Merge your PRs into `main` as usual.** The `Release` workflow (`.github/workflows/release.yml`,
   release-please) reads the conventional commits since the last release and keeps one release PR
   up to date. `fix:` bumps the patch, `feat:` the minor, a breaking change the major (minor while
   below 1.0); `docs:`, `chore:`, `refactor:`, `test:` and `ci:` alone release nothing. The PR carries
   the version in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`, and the changelog.
2. **Merge the release PR when you want a release.** Its checks wait for an "Approve and run"
   click in the PR, since it is opened with the workflow's own token (seen with 0.3.0,
   2026-10-29); the ruleset on `main` requires them like on any PR. The build in the next step
   runs typecheck, lint and tests once more on the merged commit before anything is tagged.
3. **The workflow builds the app** on `macos-latest` when the version in
   `.release-please-manifest.json` has no tag yet: Node from `.node-version`, Rust from
   `rust-toolchain.toml`, the checks, then `tauri build --locked` with `--remap-path-prefix`, so
   no path of the runner ends up in the binary. It checks that the bundle carries the version, is
   arm64, has a complete signature, and that neither the binary nor `dist/` holds a `/Users/` or
   `/home/` path, and keeps the zip as an artifact.
4. **Only a green build tags.** release-please then creates the tag and a draft release with the
   notes, the zip is attached and the release published. A failed build leaves the version bump on
   `main` without a tag; the next push to `main`, usually the fix, runs the build again.

**Fallback, for a draft without its download** (the publish job failed after tagging): neither a
re-run nor the next push repairs it, since "Check the release" then finds no newly created
release and `pending` finds the tag. Attach the zip the build kept as the artifact `app`:

```sh
gh run download <run id> -n app                      # the failed run of "Release"
gh release upload v<version> Inbox-for-GitHub-<version>.zip
gh release edit v<version> --draft=false
```

The artifact is kept for three days. After that, re-run the build job of that run for a fresh
one; its publish job fails at the same check again, which leaves the draft as it is.

Apple Silicon only, signed ad hoc but not notarized (first start of a download: System Settings ›
Privacy & Security › "Open Anyway"). Release PRs may change the version
fields in the two lockfiles; other lockfile changes still need approval.

`release-please-config.json` has the settings; `.release-please-manifest.json` holds the last released
version. The `Checks` workflow runs typecheck, lint and tests on every PR.

**`Cargo.lock` needs `.value` in its filter** (verified 2026-10-27, release-please 17.6.0): the `toml`
updater parses with a tagging parser that wraps every string in an object with its position, so
`@.name=='…'` never matches and the lockfile stays behind (the first release PR left it at
0.1.0, and `cargo build --locked` then fails). The filter in `release-please-config.json` is
`@.name.value=='inbox-for-github'`. `Cargo.toml` (`$.package.version`) works as is. Check on each
release PR that `src-tauri/Cargo.lock` is among the changed files.

**The bundle is signed ad hoc as a whole** (`bundle.macOS.signingIdentity: "-"` in
`tauri.conf.json`; verified 2026-10-29 with 0.3.0, macOS on Apple Silicon). Without it only the
binary carries the linker's ad hoc signature, which binds neither `Info.plist` nor the resources:
`codesign --verify --deep --strict` reports "code has no resources but signature indicates they
must be present", and a downloaded copy opens as "damaged" with no way past it. Signed as a whole,
Gatekeeper only rejects it as not notarized, and "Open Anyway" works.

## Building the app

```sh
export PATH=/opt/homebrew/opt/rustup/bin:$PATH   # when rustup comes from Homebrew; it installs the Rust of rust-toolchain.toml
npm ci                                           # installs exactly package-lock.json
npm run tauri build -- --bundles app -- --locked # --locked: Cargo fails instead of changing Cargo.lock
```

The result is `src-tauri/target/release/bundle/macos/Inbox for GitHub.app`, signed ad hoc and
not notarized: a build of your own opens directly. Copy it to `/Applications` to install.

Before a build, go through [`TESTING.md`](../TESTING.md) for what the change touched.

### A prerelease of the checkout

```sh
npm run build:local              # build, replace /Applications/Inbox for GitHub.app, start it
npm run build:local -- --dry-run # only print the version
```

`scripts/build-local.mjs` builds the checkout as the next patch's alpha, e.g.
`0.3.2-alpha.2+e9d4fb3` two commits after v0.3.1 (`.dirty` with uncommitted changes), so it
ranks above the release it follows. The version reaches Tauri as a `--config` override; no file
changes. It runs `npm ci` first when `package-lock.json` is newer than `node_modules`, then
quits the installed app, replaces it and starts it again; the dev window keeps running, and the
bundle identifier and so the data stay the same.

Each ad hoc signature is new, so macOS may treat every build as a new app and ask for
notification permission again. A self-signed certificate keeps the identity: in Keychain Access,
Certificate Assistant › Create a Certificate…, identity type "Self-Signed Root", certificate type
"Code Signing", then `export INBOX_SIGNING_IDENTITY="<its name>"` before the build.

**`stripping debug info with rust-objcopy failed: signal: 6`** (verified 2026-10-27, Rust 1.99.1
on aarch64): since Rust 1.98 `rust-objcopy` loads `libLLVM.dylib` through `@loader_path/../lib`,
where the `rustc` component does not ship it ([rust-lang/rust#164063](https://github.com/rust-lang/rust/issues/164063)).
The build still succeeds, but the binary keeps its debug info (8.7 instead of 7.0 MB).
The `llvm-tools` component puts the library there; `rust-toolchain.toml` installs it.

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
