# Architecture

How an item gets from GitHub into a view. Every name below is in the code; when they drift,
the code wins and this page gets fixed.

## Data flow

```
gh CLI token ──► src/github (GraphQL) ──► Item[] ──► store cache (SQLite)
                                             │
                     stored statuses ───────►├──► classify() ──► Classified[] ──► views
                     settings, untracked ───►┘
```

1. **Token:** the Rust command `gh_token` (`src-tauri/src/lib.rs`) runs `gh auth token` on every
   refresh. The token is never stored.
2. **Fetch:** `fetchItems` (`src/github/fetch.ts`) runs one search per qualifier in
   `QUALIFIERS` (`involves:@me`, `is:pr review-requested:@me`) for open items, and the same for
   closed items when `closedDays` > 0. Boards come from a separate batched query
   (`src/github/boards.ts`) when "Load boards" is on.
3. **Cache:** every fetch is saved to `item_cache` (`Store.saveFetch`) and shown at the next start
   before any request, also offline.
4. **Classify:** `directOnly` (`src/rules/directOnly.ts`) first drops the "review" reason from items in the repos the "Only addressed to me" setting covers when no request names the viewer; then `classify` (`src/classify.ts`) puts each item into a bucket from the item, the
   viewer's stored status and the rules. `useInbox` runs it over all items, after leaving out
   untracked items, repos filtered in the settings and closed items outside the window.
5. **Views:** `App.tsx` groups the classified items per view (`VIEWS`, keys 1–5); `AssignedTable`
   renders Assigned to me (`groupPlate`, by type with `groupByType`, timed by `assignedAt`) and
   Created by me (`groupAuthored`), `InboxList` the Inbox, Follow-ups (`groupBySnoozeEnd`) and Done.
   The sidebar counts follow the picked repositories; the other filters narrow only the list.

## Buckets and statuses

- **Statuses** (`Status` in `src/model.ts`) are the viewer's own: `open`, `snoozed`, `done`.
  They live in `item_status` with a log in `status_log`; nothing is sent to GitHub. `Store.open`
  removes the `accepted` rows of older versions from both, keeping their time as `item_seen`;
  the column `keep_open` is no longer read or set.
- **Buckets** (`Bucket`) say where an item belongs: `inbox` (someone waits for an answer: a
  pending mention, an unanswered review request, a passed follow-up date), `assigned`, `authored`,
  `snoozed`, `done`, and `involved` for what the viewer merely takes part in, which no view shows.
- **Views** overlap where it helps: Assigned to me shows every current assignment except the
  viewer's own pull requests, also one in the inbox for a mention; Created by me shows every open
  item the viewer opened, whatever its bucket, unless marked done by hand.
- An assignment alone never puts an item into the inbox; it goes to `assigned`, marked new until
  the viewer opens it (`isNewAssignment`).
- **My part done**: D on an item of Assigned to me stores "done" with a `handoff` snapshot
  (`item_status.handoff`, JSON of board statuses and linked pull requests; `snapshotOf`).
  `classify` then keeps it "done" instead of reopening it: in Assigned to me (bar `finished`, shared with items done on their board)
  while assigned and open, nowhere once closed and ticked off, and in the inbox (ask `update`) while
  `updatesSince` finds posts by others, board moves, new linked pull requests or closing. D
  there stores a fresh snapshot; Open (O) in the bar clears the status. `restoreStatus` undoes exactly.
- **Follow-up** ("snoozed" in the code, "Wiedervorlage" in the UI, key F) is the one way to put an
  item aside, with a date or without. An assignment or an item the viewer opened stays in its
  table, in the bar `later` with board-blocked items; only its date ends it (no "reopenOn"), and a
  mention since adds it to the inbox while it stays waiting. Other items leave their list for the
  Wiedervorlage view. At its date the stored status becomes "open" with `due`, which holds the
  item in the inbox (ask `due`) until the viewer files it; the log says "follow-up came due"
  (source `auto:snooze-ended`), and the list shows no mark of it. `followUpOf` gives the date
  that the bell and chip show, and only while the item waits.
- **Reminders no longer exist.** `item_reminder` rows of earlier versions are turned into
  follow-ups once at start (`followUpsFrom`: only for items without a status or with a plain
  "open") and deleted; the table stays for old databases. The "snoozeAuthored" setting is not read.
- Unassigned, the handoff no longer counts: the item sorts as if no status were stored.
- A closed or merged item is in Done when it was for the viewer (a review request or a mention)
  and shows nowhere otherwise; its status follows GitHub.
- A stored status falls back to `open` when its trigger fires (`reopens` in `src/reopen.ts`):
  a new mention, or any post, by the "reopenOn" setting; for snoozes with `until`, also that time.
  A passed `until` is written back as `open` with `due`, which holds the item in the inbox until
  the viewer files it, whatever its other reasons.

## Refreshes

- **Full fetch** at start, when the organizations change, at least every `FULL_EVERY_MS`
  (1 hour), and once when the cache predates issue types (`typesStale`).
- **Delta** otherwise (`canDelta`): the same searches with `updated:>=` the last fetch minus
  `DELTA_OVERLAP_MS` (5 minutes), page size 20, merged with `mergeDelta`.
- **Coverage:** the cache's `scope` records what it holds (closed days, boards, item limit;
  `encodeScope`). Narrowing a setting filters locally; widening it past the coverage fetches.
- **Single item:** `reloadItem` (⌃R) runs one `node` query.
- **Budget:** below `LOW_BUDGET` (400 points) automatic refreshes pause until GitHub's reset
  (`pausedUntil`); a manual refresh still runs.

## Local data

The database is `tracker.db` in
`~/Library/Application Support/io.github.julian-wendt.github-task-tracker/`.

| Table | Holds |
|---|---|
| `settings` | one row per settings key, JSON values (`Settings` in `src/store.ts`) |
| `item_status` | the current status per item, `keep_open`, `until`, `due` |
| `status_log` | every status change, with `automatic` for changes by the app and `source` for what caused it (see [`local-development.md`](local-development.md#the-local-database)) |
| `item_seen` | when the viewer last looked at an item, for "since you were last here" |
| `item_unread` | items the viewer marked unread by hand (U), with `marked_at`; opening the item removes the row |
| `item_note` | private notes per item |
| `item_reminder` | reminders of earlier versions, converted to follow-ups at start and emptied; nothing writes it any more |
| `item_write_failure` | writes to GitHub that failed (assign, unassign), with the error, for the item's timeline |
| `item_cache` | the last fetch: viewer, items (JSON), `fetched_at`, `full_at`, `scope` |

Schema changes are additive: new columns are added in `Store.open` when missing.

## Browser storage

Per-view conveniences live in `localStorage`, not the database: collapsed bars and groups
(`useCollapsed`), sort direction (`useSortOrders`), avatar kinds (`Avatar`), panel sizes. Losing
them is harmless.
