# Orca

"Open in Orca" hands an issue or pull request to [Orca](https://github.com/stablyai/orca), a
desktop app that runs coding agents in git worktrees. The app talks to Orca only through Orca's
command-line interface; nothing goes to GitHub, and Orca keeps the link to the item in its own
metadata.

Code: `orca` and `orca_activate` in `src-tauri/src/lib.rs`, the logic in `src/orca.ts`, the
lookup in `src/ui/useOrca.ts`.

## Verified behavior (2026-10-27, Orca 1.4.241)

- Orca is an Electron app (`com.stablyai.orca`). Its `orca://` scheme only knows pairing and
  skill sharing links, so there is no deep link that opens an issue or a pull request.
- The CLI sits in the bundle at `/Applications/Orca.app/Contents/Resources/bin/orca`, a bash
  script that runs Orca's runtime in Node mode. Apps started from Finder do not see the shell
  PATH, so the shell calls it by that path.
- Every command takes `--json` and answers `{ ok: true, result }`. A failure is
  `{ ok: false, error: { code, message, data } }` **on stdout** with exit code 1;
  `data.nextSteps[0]` is the sentence a person can read, `message` often only repeats the code.
- `orca repo list` gives each repo's `gitRemoteIdentity.canonicalKey`, e.g.
  `github.com/owner/name`; that is how a GitHub repo finds its Orca repo id.
- `orca worktree list --repo id:<id>` gives `linkedIssue` and `linkedPR` as plain numbers (or
  null), `branch` as a full ref (`refs/heads/…`) and `isArchived`. Worktree ids are
  `<repo-id>::<path>`.
- `orca worktree create --repo id:<id> --name <name> --pr <n> | --issue <n> --activate`
  makes a worktree, links it and reveals it in the app. Without `--no-parent` Orca nests it
  under the caller's worktree, inferred from inherited `ORCA_*` variables or the current
  directory; a dev window started from an Orca terminal put an issue of another repo under
  this repo's worktree that way.
- `--name` becomes the folder, the branch (`<git user>/<name>`) and the sidebar name. Its
  `--json` answer carries `result.worktree.id` (read from Orca's CLI source, `printResult` with
  `formatWorktreeShow`); `orca worktree set --worktree id:<id> --display-name <text>` then
  changes only the sidebar name. The app keeps `issue-7` / `pr-42` short and shows the title.
- `orca terminal list --worktree id:<worktree-id>` lists only that worktree's terminals;
  `orca terminal switch --terminal <handle>` shows one, `orca terminal create --worktree … --focus`
  opens one.
- The mark the app shows for Orca (`OrcaMark`) is the path of the bundle's
  `Contents/Resources/app.asar.unpacked/resources/logo.svg`.
- `orca agent-context --json` prints the schema of all 288 commands, useful when Orca changes.

## Not verified

- Whether `worktree create --pr` starts the worktree from the pull request's head branch or from
  the repo's default base. Orca has code that fetches `refs/pull/<n>/head`, but it was not
  confirmed that the CLI path uses it.
- Whether `terminal switch` and `--activate` bring Orca's window to the front by themselves; the
  shell runs `open -b com.stablyai.orca` afterwards either way.

## What the web view may run

The `orca` shell command only runs `repo list`, `worktree list`, `worktree create`,
`worktree set`, `terminal list`, `terminal switch` and `terminal create`. Removing worktrees, sending input to
terminals and starting agents stay in Orca.
