# Contributing

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used as in RFC 2119.

## Required reading

Before changing code, read [`AGENTS.md`](AGENTS.md) and the doc it lists for the area you touch.
Before changing UI, read [`docs/conventions/ui.md`](docs/conventions/ui.md); before changing a
query, read [`docs/reference/github-api.md`](docs/reference/github-api.md).

## Workflow

- Work on a feature branch. You MUST NOT push to `main`, and MUST NOT tag or release by hand.
- Commit and push each logical step as you finish it; this needs no approval.
- Each commit SHOULD be one logical step with a conventional message (`feat:`, `fix:`, `docs:`,
  `chore:`, `refactor:`, `test:`), and MAY reference its issue, e.g. `(#13)`.
- A step SHOULD stay under ~300 changed lines of production code (tests and fixtures do not
  count). If it grows past that, stop and propose a cut.
- Before every commit, `npm run typecheck`, `npm run lint` and `npm test` MUST pass. Lint
  findings you caused MUST be fixed, not noted.
- A commit that touches `.github/` MUST also pass `zizmor --pedantic .github/` and `actionlint`
  locally (`brew install zizmor actionlint`); the zizmor workflow repeats the check on every PR.

## Pull requests

PRs are squash-merged, so the PR title becomes the commit title on `main`.

- The title MUST be a conventional message of at most 72 characters **including** the ` (#nn)`
  the squash merge appends, i.e. at most 66 for a two-digit PR number; GitHub cuts longer
  commit titles with "…" and moves the rest into the description. It SHOULD NOT name the issue.
- The description MUST follow this layout:
  - an opening paragraph without a heading: what the PR does and why
  - `## Related Issues`: one line per issue, or N/A. An issue the PR finishes gets any of
    GitHub's closing keywords (`close`, `fix`, `resolve` and their `-s` and `-d` forms):
    `Closes #n`, `Fixes owner/repo#n`. An issue it only touches gets `Refs #n`, which links
    without closing. GitHub honors the keywords only in a PR against `main`
    ([docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue),
    read 2026-10-27). `gh stack merge --squash` closes them for every layer, although an upper
    PR still shows the branch below as its base (seen with #40, 2026-10-27).
  - `## Changes`: one bullet per commit, `**hash** (read closely | mechanical | docs): …` in
    one sentence
  - `## Impact`: what changes for users and existing data, and whether anything is breaking
  - `## Testing`: what was actually checked, as a short list, not a checklist
- A PR holds one change with as many commits as it has logical steps.
- Branches that build on each other SHOULD go in as a stack of PRs
  ([stacked pull requests](https://docs.github.com/en/pull-requests/reference/stacked-prs-cli-commands),
  `gh extension install github/gh-stack`): when a change needs another that is not on `main` yet,
  its branch is based on that one's, and each PR follows the rules above. Merge with
  `gh stack merge --squash`; after a lower layer changes, `gh stack rebase` and `gh stack push`
  carry it upward.

## Breaking changes

Users keep their data across updates. You MUST ask before:

- removing or renaming a settings key (`Settings` in `src/store.ts`)
- removing or renaming a table or column, or changing what a column holds
- changing the cache format in a way older caches cannot be read (`CACHE_VERSION`)
- changing the bundle identifier, which moves the data directory

Additive changes need no approval: a new settings key with a default, a new nullable column
added in `Store.open`, a new optional field on cached items. Older caches SHOULD get missing
fields filled with their empty value when loaded instead of a `CACHE_VERSION` bump, so an
update does not cost a full refetch.

## Dependencies and infrastructure

You MUST ask before adding or upgrading a dependency, changing `package-lock.json` or
`Cargo.lock`, or touching `.github/`, release scripts, `tauri.conf.json` or the Tauri
capabilities.

Every third-party dependency MUST be pinned to an exact version, so an install or build never
picks up a release nobody reviewed:

- npm: the exact version without `^` or `~` (`"react": "19.1.0"`; `npm install --save-exact`).
- Cargo: an exact requirement (`tauri = { version = "=2.12.5" }`).
- GitHub Actions: the full commit SHA, with the version as a comment
  (`uses: actions/checkout@<40-char sha> # v4.2.2`); tags and branches can move.
- Transitive dependencies are pinned by `package-lock.json` and `Cargo.lock`. Installs and
  builds MUST honor them: `npm ci`, and `--locked` for Cargo (see `docs/releasing.md`).
- Dependabot proposes updates as PRs; they are reviewed like any other change.

## Product rules

- Every UI text MUST exist in `src/ui/locales/en.ts` and `de.ts`. Components MUST NOT contain
  literal UI strings.
- Colors MUST meet WCAG AA in light and dark: 4.5:1 for text, 3:1 for icons and the visual cue
  of a control's state. Decorative lines and tracks are exempt.
- The app MUST write to GitHub only as plain comments, close/reopen and adding the viewer to or
  removing them from the assignees. Review actions and edits of other people's text stay in
  GitHub's UI.
- Statuses, notes, settings and the cache MUST stay in the local database.
- A new or changed query MUST have its cost measured (`rateLimit(dryRun: true) { cost }`), and
  SHOULD reuse an existing request before adding one.

## Documentation

- Code style and the comment budget are in [`docs/conventions/code-style.md`](docs/conventions/code-style.md).
- A fact about GitHub's API or the runtime that you verified SHOULD go into
  [`docs/reference/`](docs/reference/) with its date and evidence; the code comment then cites it.
- A product decision with a non-obvious reason SHOULD get a short entry in
  [`docs/decisions.md`](docs/decisions.md).
