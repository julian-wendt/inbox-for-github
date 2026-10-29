/**
 * Builds the current checkout as a prerelease and installs it in `/Applications`, so the app in
 * daily use follows `main` between releases. No file in the checkout changes: the version and the
 * signing identity reach Tauri as `--config` overrides.
 *
 * The version is the next patch after `package.json`, then `alpha.<commits since the last tag>`,
 * e.g. `0.3.2-alpha.2`. Semver ranks a prerelease below its release, hence the patch bump: the
 * build must rank above the release it follows. On a tagged commit the version stays the
 * release's. The short commit (`.dirty` with uncommitted changes) is the bundle version, which the
 * About window shows in parentheses: "Version 0.3.2-alpha.2 (e9d4fb3)".
 *
 * With `INBOX_SIGNING_IDENTITY` set to the name of a code-signing certificate in the login
 * keychain, the bundle is signed with it instead of ad hoc, so macOS sees the same app across
 * builds and keeps its permissions (see docs/releasing.md). The bundle identifier stays
 * `inbox-for-github`, so the data stays too.
 *
 * Runs `npm ci` first when `package-lock.json` is newer than the installed packages (after a
 * pull that changed dependencies, or without `node_modules`), so the build uses exactly the lock.
 *
 * Quits a running `/Applications/Inbox for GitHub.app`, replaces it and starts it again. The dev
 * window is not affected. Refuses unless this is an Apple Silicon Mac and `cargo` is on the path;
 * Homebrew's rustup (`/opt/homebrew/opt/rustup/bin`) is added to the path when it is missing.
 *
 *   npm run build:local              # build, install, start
 *   npm run build:local -- --dry-run # print the version, then stop
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const dryRun = process.argv.includes("--dry-run");
const appName = "Inbox for GitHub.app";
const installed = `/Applications/${appName}`;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();
const show = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const fail = (message) => {
  console.error(`build:local: ${message}`);
  process.exit(1);
};
const onPath = (cmd) => {
  try {
    run(cmd, ["--version"]);
    return true;
  } catch {
    return false;
  }
};

if (process.platform !== "darwin" || process.arch !== "arm64") fail("needs an Apple Silicon Mac.");
const homebrewRustup = "/opt/homebrew/opt/rustup/bin";
if (!onPath("cargo") && existsSync(homebrewRustup)) {
  process.env.PATH = `${homebrewRustup}:${process.env.PATH}`;
}
if (!onPath("cargo")) fail("cargo is not on the path. Install Rust with rustup (see docs/releasing.md).");

const { version: released } = JSON.parse(readFileSync("package.json", "utf8"));
const tag = run("git", ["describe", "--tags", "--abbrev=0", "--match", "v*"]);
const ahead = Number(run("git", ["rev-list", "--count", `${tag}..HEAD`]));
const dirty = run("git", ["status", "--porcelain"]) !== "";
const sha = run("git", ["rev-parse", "--short", "HEAD"]) + (dirty ? ".dirty" : "");
const [major, minor, patch] = released.split(".").map(Number);
const version =
  ahead === 0 && !dirty ? released : `${major}.${minor}.${patch + 1}-alpha.${ahead}`;

const identity = process.env.INBOX_SIGNING_IDENTITY;
console.log(`Version ${version} (${sha}), signed ${identity ? `as "${identity}"` : "ad hoc"}.`);
if (dryRun) process.exit(0);

// npm ci empties node_modules, which would break a dev window running from this checkout
const installedLock = "node_modules/.package-lock.json";
if (!existsSync(installedLock) || statSync("package-lock.json").mtimeMs > statSync(installedLock).mtimeMs) {
  show("npm", ["ci"]);
}

const macOS = { bundleVersion: sha, ...(identity && { signingIdentity: identity }) };
const config = { version, bundle: { macOS } };
show("npm", ["run", "tauri", "build", "--", "--bundles", "app", "--config", JSON.stringify(config), "--", "--locked"], {
  env: {
    ...process.env,
    RUSTFLAGS: `--remap-path-prefix=${homedir()}=/build --remap-path-prefix=${process.cwd()}=/src`,
  },
});
const built = resolve(process.env.CARGO_TARGET_DIR ?? "src-tauri/target", "release/bundle/macos", appName);

// Install
const running = () => {
  try {
    return run("pgrep", ["-f", `${installed}/Contents/MacOS/`]) !== "";
  } catch {
    return false;
  }
};
if (running()) {
  show("osascript", ["-e", `tell application "${installed}" to quit`]);
  const deadline = Date.now() + 10_000;
  while (running()) {
    if (Date.now() > deadline) fail(`${appName} did not quit within 10 s. Quit it and run again.`);
    execFileSync("sleep", ["0.2"]);
  }
}
show("rm", ["-rf", installed]);
// ditto keeps the bundle's attributes and signature; cp -R may not
show("ditto", [built, installed]);
show("open", [installed]);
console.log(`Installed ${version} (${sha}) in /Applications and started it.`);
