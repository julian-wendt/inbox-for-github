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
   Created by me (`groupAuthored`), `InboxList` the Inbox (with the follow-ups that left it in the
   bar `WAITING_GROUP` at its bottom), Planned (`datedOf` for what is pinned or planned,
   `groupBySnoozeEnd` for the day bars) and Done.
   The sidebar counts follow the picked repositories; the other filters narrow only the list.

## Buckets and statuses

- **Statuses** (`Status` in `src/model.ts`) are the viewer's own: `open`, `snoozed`, `done`.
  They live in `item_status` with a log in `status_log`; nothing is sent to GitHub.
- **Buckets** (`Bucket`) say where an item belongs: `inbox` (someone waits for an answer: a
  pending mention, an unanswered review request, a stored Open that asks again), `planned` (pinned for
  today or planned for a day, with no ask since; only the Planned view shows it), `assigned`,
  `authored`, `snoozed`, `done`, and `involved` for what the viewer merely takes part in, which no
  view shows.
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
  bucket `snoozed` and wait in the bar "Later" at the inbox's bottom, folded by default; Planned
  shows only what is pinned for today or planned for a later day (settings `focus`, `planned`,
  `pinnedOn`). At its date the stored status becomes "open"
  (automatic, source `auto:snooze-ended`; the log says "follow-up came due"): the item is back
  where its asks put it, and what was answered before asks again (`reopened`) until the viewer
  replies, D or F; the list shows no mark of it. `followUpOf` gives the date that the bell and
  chip show, and only while the item waits.
- **Plan** (P, a day) and **Today** (T, a pin) are settings, not statuses (`planned`, `focus`,
  `pinnedOn`), and `plannedAt` records when each item last got one. `classify` drops the asks
  from before that time: with none left, the item leaves the inbox for `planned`, or stays in its
  table marked with its day; a mention, review request, push or reopen since brings it back, and
  answering it takes it out again without ending the plan. D and closing on GitHub end it. Each
  morning `rollOver` moves the plans due into Today. An item has one "when": P and T end a
  follow-up, F ends a plan or pin (`unplan`).
- Unassigned, the handoff no longer counts: the item sorts as if no status were stored.
- A closed or merged item is in Done when it was for the viewer (a review request or a mention)
  and shows nowhere otherwise; its status follows GitHub.
- A stored status falls back to `open` when its trigger fires (`reopens` in `src/reopen.ts`):
  a new mention, or any post, by the "reopenOn" setting; for snoozes with `until`, also that time.
  A passed `until` is written back as `open`, which counts like a reopen by hand.

## Refreshes

- **Full fetch** at start, when the organizations change, at least every `FULL_EVERY_MS`
  (1 hour), and on ⇧⌘R (`refresh(true)`).
- **Delta** otherwise (`canDelta`): the same searches with `updated:>=` the last fetch minus
  `DELTA_OVERLAP_MS` (5 minutes), page size 20, merged with `mergeDelta`. Next to them, the ids
  of all open review requests (`fetchReviewIds`, 1 point): a cached item whose request is gone
  loses the reason "review" and, left without a reason, the cache (`withdrawReviews`).
- **Coverage:** the cache's `scope` records what it holds (closed days, boards, item limit;
  `encodeScope`). Narrowing a setting filters locally. A longer closed window runs a delta plus
  the closed searches over the added days only (`widensClosed`, `closedBefore`); switching boards
  on loads only the boards. A higher item limit has no such shortcut and fetches in full.
- **Transfers:** an issue moved to another repository comes back under a new node id. Every
  fetch, full or delta, compares the issues that name `transferredFrom` with the items cached
  before it (`findTransfers`); the old copy leaves the cache, and its status, log, note, seen,
  unread mark and failed writes move to the new id (`Store.moveItems`), as do Today, Plan,
  untracked and collected notifications (`movedSettings`), before the items are shown.
- **Single item:** `reloadItem` (⌃R) runs one `node` query, `reloadItems` (right click on a
  view) a `nodes` query; both put the answer in through `takeReloaded`, which also takes over a
  transfer the answer shows. For an id GitHub no longer resolves (`NOT_FOUND`), the cached issues
  that may be its transferred copy are loaded by id (`transferCandidates`, about a point each);
  failing that, a refresh runs, and what is still unresolved leaves the cache (`dropGone`).
- **Budget:** below `LOW_BUDGET` (400 points) automatic refreshes pause until GitHub's reset
  (`pausedUntil`); a manual refresh still runs.

## Local data

The database is `tracker.db` in
`~/Library/Application Support/inbox-for-github/`, the folder named after the bundle identifier.
Builds up to 2026-10-27 used `io.github.julian-wendt.github-task-tracker`; on the first start
`migrate_data_dir` (`src-tauri/src/lib.rs`) copies `tracker.db`, its WAL files and
`.window-state.json` from that folder, and the logs from `~/Library/Logs/` under that name, and
leaves both in place. It runs as the first plugin, because
Tauri sets plugins up in registration order (`PluginStore::initialize_all` in tauri 2.12.5) and
the window-state plugin reads its file in its own setup (`tauri-plugin-window-state` 2.5.0),
before `Builder::setup` runs. The web view's localStorage (collapsed bars, sort orders) and the
notification permission are not carried over.

`SCHEMA` in `src/store.ts` creates every table in its current shape; `dropLeftovers` removes
what databases of 0.1.0 builds still hold (`item_reminder`, `item_status.keep_open`, the
settings `snoozeAuthored` and `orbSeeds`). A new column is added in `Store.open` next to it, as `CONTRIBUTING.md` says.

| Table | Holds |
|---|---|
| `settings` | one row per settings key, JSON values (`Settings` in `src/store.ts`) |
| `item_status` | the current status per item, `until`, `handoff`; `due` is left over from the due state, not read since 2026-10-28 |
| `status_log` | every status change, with `automatic` for changes by the app and `source` for what caused it (see [`local-development.md`](local-development.md#the-local-database)) |
| `item_seen` | when the viewer last looked at an item, for "since you were last here" |
| `item_unread` | items the viewer marked unread by hand (U), with `marked_at`; opening the item removes the row |
| `item_note` | private notes per item |
| `item_write_failure` | writes to GitHub that failed (assign, unassign), with the error, for the item's timeline |
| `item_cache` | the last fetch: viewer, items (JSON), `fetched_at`, `full_at`, `scope` |

Schema changes are additive: new columns are added in `Store.open` when missing.

## Browser storage

Per-view conveniences live in `localStorage`, not the database: collapsed bars and groups
(`useCollapsed`), sort direction (`useSortOrders`), avatar kinds (`Avatar`), panel sizes. Losing
them is harmless.
