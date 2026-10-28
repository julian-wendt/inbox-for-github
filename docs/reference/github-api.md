# GitHub API

The app reads GitHub only through the GraphQL API (`https://api.github.com/graphql`), with the
token of the `gh` CLI. Budget: 5000 points per hour per account, shared with `gh` and every other
tool using the same token. Be frugal: measure, reuse existing requests, filter locally.

## Measuring a query's cost

Run the query with `rateLimit(dryRun: true) { cost remaining }` next to it, or check the
`x-ratelimit-used` header before and after. Measure again after every change to a query; the
numbers below go stale when fields are added.

## Costs (measured 2026-10-23; search page re-measured 2026-10-25)

| Request | Where | Cost |
|---|---|---|
| Search page of 50 items with all fields | `QUERY` in `src/github/fetch.ts` | ~19 points (18 before commits got their own window; unchanged by `issueType`, review ids and links, thread state, the state events and an issue window of 20 instead of 10) |
| Search page of 20 items (delta) | same, `pageSize: 20` | ~7 points (re-measured 2026-10-25) |
| One item by node id | `NODE_QUERY` (`reloadItem`, ⌃R) | 1 point |
| Many items by node id | `NODES_QUERY` (`fetchItemsById`, right click on a view), `REFRESH_CHUNK = 50` | 19 points for 50, 37 for 100, 9 for 25, 4 for 10 (measured 2026-10-26 with `rateLimit(dryRun: true)`); a single `node` costs 1, so from about three items the bulk request is cheaper |
| Boards for 50 items | `src/github/boards.ts`, `BATCH = 50` | ~6 points |
| Budget read | `x-ratelimit-*` response headers | free |
| `rate_limit` REST endpoint | — | free |

A full fetch pages through every search up to the item limit (default 200 per search; two
qualifiers, for open and, with a closed window, closed items), a few hundred points. A delta
runs the same searches with one page of 20 each, about 7 points per search.

## Verified behavior (2026-10-23)

Each was checked against the live API during development.

- Repeated `org:` and `user:` qualifiers in one search combine with **OR**, so one search covers
  all watched owners (`fetchItems`).
- Long search queries work; queries over 1000 characters were accepted.
- `updated:>=` accepts a full datetime (`2026-10-23T10:00:00Z`), not only a date; deltas rely on it.
- The `x-ratelimit-*` and `X-OAuth-Scopes` response headers are readable from the webview
  (exposed via CORS); the budget reading in `graphql` (`lastBudget`) and `tokenScopes` in
  `src/github/client.ts` use them.
- Avatars from `avatars.githubusercontent.com` send `access-control-allow-origin: *`; the
  `github.com/<login>.png` redirect does not, so pixel checks use the former (`Avatar`).
- Identicons are served as 420×420 PNG with exactly two colors, the ground being `#f0f0f0`,
  whatever size is requested (`isIdenticon`).

- `Issue.issueType { name color }` needs no preview header and adds no points to a search page
  (dry run 2026-10-24: 18 with and without it). Issues without a type, and repositories of a
  user account, return `null`.

- Review threads (`PullRequestReviewThread`) carry `isResolved`, `resolvedBy` and `isOutdated`,
  but **no time of resolving**, and the pull request timeline has no event for it (schema
  introspection 2026-10-25). The app therefore shows a review's resolved threads as a state on
  its line, never as an entry of its own. Each thread comment links its review
  (`pullRequestReview { id }`) and whether it answers (`replyTo`); reviews and comments carry a
  `url` that opens GitHub at them. These fields left a search page at 18 points (dry run 2026-10-25).
- Timeline events with a `url` (introspection 2026-10-25): `ClosedEvent` (also `stateReason`),
  `MergedEvent`, `ReadyForReviewEvent`, `ConvertToDraftEvent`, `ReviewDismissedEvent`. Without
  one: `ReopenedEvent`, `HeadRefForcePushedEvent`, `AutoMergeEnabledEvent`; their lines link the
  item. `ConnectedEvent` names the pull request in `source` or `subject`, `MarkedAsDuplicateEvent`
  in `canonical`. Event types share their `timelineItems` window (`last: 50` on pull requests,
  `last: 20` on issues). Commits have their own (`commitItems`, `last: 20`), since `last` counts
  across all types and a long run of commits would otherwise push review requests out; it costs
  one point per search page of 50 and none on a delta page (dry run 2026-10-25).

## Rate limits and retries

`graphql` in `src/github/client.ts` throws `RateLimitError` with the time GitHub allows queries
again: `retry-after` for secondary limits, else `x-ratelimit-reset`. `useInbox` pauses automatic
refreshes until then and below 400 remaining points (`LOW_BUDGET`).

## Token scopes

`REQUIRED_SCOPES`: `repo`, `read:org`, `project`. A missing one shows a notice with the command
`gh auth refresh -s repo,read:org,project`.

## Writes

Only `src/github/comment.ts`: add a comment, close or reopen an issue or pull request (with a
reason for issues), and add the viewer to the assignees (`assignSelf`: `addAssigneesToAssignable`,
1 point, returning the assignees; the viewer's node id once per session, 1 point; the query was
validated against the live schema 2026-10-25 with an unknown node id, which GitHub rejects as
`NOT_FOUND` without writing). No review actions and no edits of other people's text, by design
(see [`decisions.md`](../decisions.md)).

`unassignSelf` removes the viewer the same way (`removeAssigneesFromAssignable`, 1 point;
validated like `assignSelf` on 2026-10-25).

Assigning and unassigning are shown at once and sent behind it through `queueWrite` (`src/github/queue.ts`), one
write after another; a failed one is undone locally with a toast. Measured 2026-10-25: about
350 ms per GraphQL request and 70 ms for `gh auth token`, so waiting for the write plus a reload
of the item and its boards took two to three seconds.

## Known gaps

- Deltas miss changes that do not touch `updatedAt`, such as a board status change or, likely, a
  withdrawn review request; the hourly full fetch catches them. Resolving a review thread
  likely does not touch it either (not verified).
