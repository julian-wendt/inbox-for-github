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
| Search page of 50 items with all fields | `QUERY` in `src/github/fetch.ts` | ~19 points (18 before commits got their own window; unchanged by `issueType`, review ids and links, thread state, the state events, an issue window of 20 instead of 10, the commit author and `TransferredEvent`, dry run 2026-10-29; and by `issueCount` and `sort:updated-desc`, dry run 2026-11-13) |
| Search page of 20 items (delta) | same, `pageSize: 20` | ~7 points (re-measured 2026-10-25; unchanged by `TransferredEvent`, dry run 2026-10-29, and by `issueCount` and the sort, 2026-11-13) |
| Open review requests, ids only | `REVIEW_IDS_QUERY` (`fetchReviewIds`, every delta), page of 100 | 1 point (dry run and `x-ratelimit-used`, 2026-10-29) |
| One item by node id | `NODE_QUERY` (`reloadItem`, ⌃R) | 1 point |
| Many items by node id | `NODES_QUERY` (`fetchItemsById`, right click on a view), `REFRESH_CHUNK = 50` | 19 points for 50, 37 for 100, 9 for 25, 4 for 10 (measured 2026-10-26 with `rateLimit(dryRun: true)`); a single `node` costs 1, so from about three items the bulk request is cheaper |
| Boards for 50 items | `src/github/boards.ts`, `BATCH = 50` | ~6 points |
| Budget read | `x-ratelimit-*` response headers | free |
| `rate_limit` REST endpoint | — | free |

A full fetch pages through every search to its end (at most GitHub's 1000 hits, `SEARCH_STOP`;
two qualifiers, for open and, with a closed window, closed items), about 19 points per 50 hits.
Every search sorts by `sort:updated-desc`, so a search past the stop misses only the oldest items
and the same ones each time; `issueCount` tells that it was cut (the sidebar says "Not all loaded"). A delta
runs the same searches with one page of 20 each, about 7 points per search, plus one point for
the ids of the open review requests. Widening the
closed window adds the two closed searches over the added days only, paged like a full fetch:
the same `QUERY` with another search string, so ~19 points per page of 50, usually one or two
pages per search.

## Verified behavior (2026-10-23)

Each was checked against the live API during development.

- Repeated `org:` and `user:` qualifiers in one search combine with **OR**, so one search covers
  all watched owners (`fetchItems`).
- Long search queries work; queries over 1000 characters were accepted.
- `sort:updated-desc` in the search string orders the hits by `updatedAt`, newest first; without
  it GitHub orders by best match, which shifts between requests (checked 2026-11-13).
- A search stops at 1000 hits: after ten pages of 100, `hasNextPage` is false, while
  `issueCount` still gives the full number, e.g. 258917 for `is:issue repo:microsoft/vscode`
  (checked 2026-11-13). `fetchItems` compares the two to report a cut search.
- `updated:>=` accepts a full datetime (`2026-10-23T10:00:00Z`), not only a date; deltas rely on it.
- `closed:A..B` includes both days: the counts for `closed:2026-09-01..2026-10-21` and
  `closed:>=2026-10-22` added up to the one for `closed:>=2026-09-01` (checked 2026-10-29). A
  wider closed window searches only the added days this way (`searchStates`).
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

## What moves `updatedAt` (2026-10-29)

Read from timestamps only, no writes: for each item, the time of its latest event of a type
against its `updatedAt`, over 959 pull requests in large public repositories and the items of
one account. An event that moves `updatedAt` can never be later than it.

- **Do not move it:** a board status change (`ProjectV2ItemStatusChangedEvent`, 15 items whose
  `updatedAt` was earlier than the change), a cross-reference from elsewhere
  (`CrossReferencedEvent`, 68 such items) and an assignment (`AssignedEvent`: two issues assigned
  to a second person through GitHub's UI kept their `updatedAt` of six days before, seen
  2026-11-02).
- **Likely move it:** a withdrawn review request (`ReviewRequestRemovedEvent`), an unassignment
  and a label added or removed: never later than `updatedAt` (57, 71 and over 400 items), some
  exactly on it. Not proven without a controlled write.
- Either way a withdrawn request drops the item out of the review search, so a delta does not
  see it through `updated:>=` unless the item still involves the viewer. Every delta therefore
  reads the ids of all open review requests (`fetchReviewIds`) and takes back the reason
  "review" where an id is gone (`withdrawReviews`). Whether a new request moves `updatedAt` is
  not verified, so the same ids also bring in requests the delta's search missed
  (`unseenReviews`, loaded through `fetchItemsById`: 1 point for one, 19 for 50).

## Transferred issues (2026-10-29)

Checked against a real transfer:

- A transferred issue gets a **new node id and a new number** in the target repository. The old
  node id no longer resolves: `node(id:)` and `nodes(ids:)` answer with `null` data and an error
  of `type: "NOT_FOUND"` ("Could not resolve to a node with the global id of …"), which
  `graphql` turns into a thrown error unless told otherwise.
- The new issue keeps the original `createdAt` and title. Its timeline carries a
  `TransferredEvent` with `fromRepository { nameWithOwner }` and no reference to the old node id
  (introspection 2026-10-29: `actor`, `createdAt`, `fromRepository`, `id`, `issue`).
- Its `updatedAt` moves to the time of the transfer, so the next delta finds it.
- The app reads the event's `actor` too, for the timeline line "moved this here from …"; the
  search page stays at 19 points for 50 items and 7 for 20 (dry run 2026-10-29).
- Only issues can be transferred; pull requests have no such event.

## Rate limits and retries

`graphql` in `src/github/client.ts` throws `RateLimitError` with the time GitHub allows queries
again: `retry-after` for secondary limits, else `x-ratelimit-reset`. `useInbox` pauses automatic
refreshes until then and below 400 remaining points (`LOW_BUDGET`).

## Timeouts

GitHub gives a request ten seconds. One that takes longer gets `502 Bad Gateway` from the gateway
in front of the API: an HTML page without `access-control-allow-origin`, so the web view's
`fetch` rejects with a `TypeError` ("Failed to fetch" in WebView2) and has no status to read.
Measured 2026-11-11 from Node, where the status shows: a search page came back as that 502 after
10.9 s. In the app the same failures were logged 10.5 to 11 s after the request went out, and the
sidebar read "Offline" on a working network.

The search page is what runs into it. In an organization whose pull requests carry many reviews
and threads, a page of 50 took 7 to 11 s, a page of 25 4 to 8 s and a page of 10 2 to 3 s, and
the later pages of a search were slower than its first (measured 2026-11-11).

`graphql` throws `TimeoutError` for a request that fails that late (`GAVE_UP_MS`; a missing
network fails at once), and `search` in `src/github/fetch.ts` asks for the page again at half
the size, down to 5 hits, and holds every later page and search to that size until the app
restarts. Smaller pages cost the same per hit: 19 points for 50, 9 for 25, 5 for 13, 3 for 7 and
2 for 5 (dry run 2026-11-11). The dropped request is not free: `x-ratelimit-used` rose by 39
over a dropped page of 50 and the page of 25 after it, where a page of 25 alone adds 9 or 10
(seen 2026-11-11).

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

- Deltas miss changes that do not touch `updatedAt`, such as a board status change or an
  assignment, and items
  that drop out of the involved search; the full fetch every 15 minutes catches them. Withdrawn review
  requests are the exception (see above). Resolving a review thread
  likely does not touch it either (not verified).
- The points a refresh logs can be far too high. The responses of one refresh carried two
  different `x-ratelimit-reset` times, each with its own `used` count, changing from request to
  request (seen 2026-11-10 and 2026-11-11 with one token). `pointsSpent` takes every change of
  the reset time as a new hour and adds all that window has used: a full refresh logged
  `cost=2839` where the counter most of its requests hit rose by about 205.
