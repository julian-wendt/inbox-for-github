/**
 * Builds the app from the newest release that has no app yet and attaches it to that release.
 * The release itself (tag, draft, notes) comes from the release workflow; this script only adds
 * the download. The draft stays a draft, unless `--publish` is given: then it is published once
 * the download is attached, so a release never goes out without its app.
 *
 * The tag is built in a temporary git worktree, so the current checkout, branch and uncommitted
 * work stay untouched. Cargo reuses this checkout's `src-tauri/target`, so the build is not cold.
 *
 * Refuses unless this is an Apple Silicon Mac (the build is arm64 only), the newest release has
 * no download yet, and `package.json` at its tag carries the tag's version.
 *
 * Needs `gh` (logged in), Node, and Rust, as for any build (see docs/releasing.md).
 *
 *   npm run release:check    # run the checks, then stop
 *   npm run release:upload   # build and upload
 *   npm run release:publish  # build, upload and publish the draft
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dryRun = process.argv.includes("--dry-run");
const publish = process.argv.includes("--publish");

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();
const show = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const fail = (message) => {
  console.error(`release:upload: ${message}`);
  process.exit(1);
};

if (process.platform !== "darwin" || process.arch !== "arm64") fail("needs an Apple Silicon Mac.");

const releases = JSON.parse(run("gh", ["release", "list", "--limit", "10", "--json", "tagName,createdAt"]));
releases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const newest = releases[0];
if (!newest) fail("there is no release yet. Merge the release PR first.");

const { tagName: tag } = newest;
const assets = JSON.parse(run("gh", ["release", "view", tag, "--json", "assets"])).assets;
if (assets.length) fail(`${tag} has a download already: ${assets.map((a) => a.name).join(", ")}.`);

show("git", ["fetch", "--quiet", "origin", "tag", tag]);
const version = tag.replace(/^v/, "");
const pkg = JSON.parse(run("git", ["show", `${tag}:package.json`]));
if (pkg.version !== version) fail(`package.json says ${pkg.version}, the tag says ${version}.`);

console.log(`${tag}: no download yet, package.json matches the tag.`);
if (dryRun) process.exit(0);

const targetDir = resolve("src-tauri/target");
const work = mkdtempSync(join(tmpdir(), "release-"));
const tree = join(work, "tree");
show("git", ["worktree", "add", "--detach", tree, tag]);
try {
  show("npm", ["ci"], { cwd: tree });
  show("npm", ["run", "tauri", "build", "--", "--bundles", "app", "--", "--locked"], {
    cwd: tree,
    env: { ...process.env, CARGO_TARGET_DIR: targetDir },
  });
  const zip = join(work, `Inbox-for-GitHub-${version}.zip`);
  // ditto keeps the bundle's attributes; zip does not
  show("ditto", ["-c", "-k", "--keepParent", "Inbox for GitHub.app", zip], {
    cwd: join(targetDir, "release/bundle/macos"),
  });
  show("gh", ["release", "upload", tag, zip]);
  if (publish) {
    show("gh", ["release", "edit", tag, "--draft=false"]);
    console.log(`Uploaded ${zip} to ${tag} and published it.`);
  } else {
    console.log(`Uploaded ${zip} to ${tag}. Review the draft and publish it in GitHub.`);
  }
} finally {
  show("git", ["worktree", "remove", "--force", tree]);
  rmSync(work, { recursive: true, force: true });
}
