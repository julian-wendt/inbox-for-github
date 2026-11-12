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
   Created by me (`groupAuthored`), both also by repository with `groupByRepo`; `InboxList` the
   Inbox, Planned (`datedOf` for what is pinned or planned, `groupBySnoozeEnd` for the day bars), Follow-up (`isWaiting`, by the day each
   comes back). The inbox ends in the Done bar (`inDoneBar` in `src/ui/doneBar.ts`): what was
   handled in the last 7 days (`handledAt`: handled-until, the closing of an item for them and,
   outside the tables, the viewer's answer) and asks for nothing, outside Planned, Follow-up and the
   bar Finished of Assigned to me; closed items stay as long as
   `closedDays` loads them. It is folded by default, left out of every count, the badge and unread,
   and opens on a click or a jump to one of its items. Planned and Follow-up render as a list or a
   table (`useViewLayout`).
   The sidebar counts follow the picked repositories; the other filters narrow only the list.

## Buckets and statuses

- **Statuses** (`Status` in `src/model.ts`) are the viewer's own: `open`, `snoozed`, `done`.
  They live in `item_status` with a log in `status_log`; nothing is sent to GitHub.
- **Handled-until** (`item_handled`; `Store.handledUntil`, `src/handledUntil.ts`) is the one
  cutoff for asks: `classify` counts only asks newer than it. D in the inbox, P, T and F set it
  to now (`handledStep`, with undo); X leaves it. P, T and F also mark the item seen while it is
  open (`seenStep` in `src/ui/unread.ts`), unless it was marked unread by hand. D on someone
  else's item stores no "done": it files (`planStatus` "file", which also ends its plan). A
  stored Open newer than handled-until, or a follow-up whose date passed, lifts the cutoff, so
  what was pending asks again. The settings `filedAt` and `plannedAt` are still written for one
  version, so an older build reads what it expects, but nothing reads them any more.
- **Buckets** (`Bucket`) say where an item belongs: `inbox` (someone waits for an answer: a
  pending mention, an unanswered review request, feedback by others on an item of the tables,
  an answer in the viewer's review thread, an own item closed by someone else, a stored Open that
  asks again, a reopen on GitHub, a post with "Any post", a due follow-up), `planned` (pinned for
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
  `updatesSince` finds posts by others, board moves, new linked pull requests or closing, counted
  from the later of the hand-off and handled-until; once a closed item is handled, board and pull
  request changes no longer count. D there files the news and, on an open item, refreshes the
  snapshot (`setHandoff`, keeping the status time); a closed item gets no write. Open (O) in the
  bar clears the status. `restoreStatus` undoes exactly.
- **A follow-up on a finished part** keeps the part done: F stores "snoozed" with a fresh
  `handoff` (`followUpExtra`), so the item waits in Follow-up and stays in the bar `finished`.
  `classify` reads it as "snoozed" while open and before its date, and as "done" after, with no
  write. X and D in Follow-up take the follow-up off with `Store.endFollowUp`: the part goes back
  to "done" with its time and snapshot (`afterFollowUp`), so news from the wait still counts. P
  and T do not take a finished part (`isPinnable`), also while it waits. Open (O) opens the work
  again and keeps the follow-up. Unassigned, only the follow-up counts.
- **Repairs at start:** `Store.repairStatusLog` drops log entries at the end of an item's
  history that no stored status stands behind (`staleLogRows`), so the activity log never shows
  "marked as done" for an open item. A "done" stored on an item D may no longer finish
  (`lockOf`: one the viewer opened) is cleared once (source `auto:locked`), except the
  hand-off on an own issue assigned to the viewer (`lockedDone` in `statusPlan.ts`).
- **Follow-up** ("snoozed" in the code, "Wiedervorlage" in the UI, key F) is the one way to put an
  item aside, with a date or without. An assignment or an item the viewer opened stays in its
  table, in the bar `later` ("Follow-up"; board-blocked items have their own bar `blocked`).
  Other items leave their list for the bucket `snoozed`. An ask since adds any of them to the
  inbox while the follow-up keeps waiting. The Follow-up view lists every follow-up that waits,
  from any list; Planned shows only what is pinned for today or planned for a later day (settings
  `focus`, `planned`, `pinnedOn`). At its date nothing is written: the follow-up asks (`due`, at
  its date) on any item, table items and finished parts too, until the viewer replies, D, P, T or
  F; what was pending asks again with it, even an ask D had filed before F. The row of a past-due
  follow-up stays in `item_status` as it is. `followUpOf` gives the date that the chip shows, and
  only while the item waits.
- **Feedback, thread replies, closings** (asks `feedback`, `reply`, `closed`; `src/feedback.ts`):
  posts and reviews by others since the viewer's last answer (`lastAnswerAt`) on an item of the
  tables, answers in a review thread the viewer wrote in on another's pull request, and an own item
  closed by someone else. The settings `ownFeedback`, `assignedFeedback`, `threadReplies` and
  `ownClosed` switch them (`AskRules`). D on such an item finishes nothing (`planStatus` "file"):
  it sets handled-until, and `classify` drops the asks from before it. A
  reply or feedback after it asks again like a push does, and leaves a follow-up running.
- **Plan** (P, a day) and **Today** (T, a pin) are settings, not statuses (`planned`, `focus`,
  `pinnedOn`); both set handled-until. `classify` drops the asks from before it: with none left, the item leaves the inbox for `planned`, or stays in its
  table marked with its day; a mention, review request, push or reopen since brings it back, and
  answering it takes it out again without ending the plan. D and closing on GitHub end it. Each
  morning `rollOver` moves the plans due into Today. An item has one "when": P and T end a
  follow-up (`withPin`, `withPlan`, `followUpEnds`), F ends a plan or pin (`unplan`).
- Unassigned, the handoff no longer counts: the item sorts as if no status, or only its follow-up, were stored.
- A closed or merged item is in the Done bar when it was for the viewer (a review request or a mention)
  and shows nowhere otherwise; its status follows GitHub.
- **Returns** are asks with a time (`Classified.asked`), compared with handled-until and the time
  of a stored follow-up or of a done older builds stored; nothing is written to bring an item
  back. Besides the asks above: `opened` (the viewer's O, a stored Open, also one older builds
  wrote), `reopened` (someone else reopened it on GitHub, on an item that was for the viewer and
  that they handled or answered, newer than handled-until and their last reply), `post` (with "reopenOn" "any-post", a
  post by someone else outside the tables, newer than both) and `due`. `newestAsk` gives the ask
  the row is dated by and the explanation names first; `back` the one that brought a handled
  item back, which the detail's history shows at its time (`backChange`), with nothing stored.
  These four return quietly, without a notification. A new assignment by someone else drops a
  finished part without a write and keeps the follow-up.

## Refreshes

- **Full fetch** at start, when the organizations change, at least every `FULL_EVERY_MS`
  (15 minutes), and on ⇧⌘R (`refresh(true)`).
- **Delta** otherwise (`canDelta`): the same searches with `updated:>=` the last fetch minus
  `DELTA_OVERLAP_MS` (5 minutes), page size 20, merged with `mergeDelta`. Next to them, the ids
  of all open review requests (`fetchReviewIds`, 1 point): a cached item whose request is gone
  loses the reason "review" and, left without a reason, the cache (`withdrawReviews`); an id the
  cache does not hold as a review request is loaded by id and gets it (`unseenReviews`,
  `addRequested`, at most 50 per delta), whether or not the request moved `updatedAt`.
- **Pending writes:** assigning or unassigning oneself shows at once; until the queued write
  settles, every fetch or reload puts that change back on the item (`withPending`), so one that
  ran before GitHub had the write does not take it back.
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
  failing that, a refresh runs, and what is still unresolved leaves the cache and loses its pin
  or plan (`dropGone`). Once a day the pinned and planned items that are not loaded go through
  `reloadItems` too, so a deleted one or one the viewer lost access to drops its plan; one that
  is only outside the item limit or a filtered repository still resolves and keeps it.
- **Budget:** below `LOW_BUDGET` (400 points) automatic refreshes pause until GitHub's reset
  (`pausedUntil`); a manual refresh still runs.
- **In the background:** the refresh timer is a plain `setInterval` and keeps running only
  because the window sets `"backgroundThrottling": "disabled"` in `tauri.conf.json`. Without it,
  WKWebView's default `inactiveSchedulingPolicy` suspends the page's timers while the window is
  hidden (closing only hides it), minimised or covered, and new items arrived only once the
  window came back. Tauri 2.12 (wry 0.57.0, `src/wkwebview/mod.rs`) maps `disabled` to
  `WKInactiveSchedulingPolicy.none`, on macOS 14 and later only (read 2026-11-06).

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
what older builds' databases still hold: the table `item_reminder`, the column
`item_status.keep_open`, the settings keys `snoozeAuthored`, `orbSeeds`, `hoverActs` and
`calendarTime`, and rewrites the retired values `tableGrouping` "time" and `reopenOn`
"mention-or-assigned-post". No column has been added since the schema was created; a new one
would be added with `ALTER TABLE` in `Store.open`, guarded by a `PRAGMA table_info` check.

| Table | Holds |
|---|---|
| `settings` | one row per settings key, JSON values (`Settings` in `src/store.ts`) |
| `item_status` | the current status per item, `until`, `handoff`; `due` is left over from the due state, not read since 2026-10-28 |
| `item_handled` | one `handled_until` per item: asks from before it are not new, the only cutoff `classify` reads. Filled once when the table is created, from `filedAt`, `plannedAt` (while pinned or planned), a stored done without hand-off and a follow-up start (`deriveHandledUntil`), into `item_handled_fill`, 400 rows per INSERT, then renamed, so the table exists only whole; a fill cut short is redone on the next start. Reset statuses clears it; a transfer moves it |
| `status_log` | every status change, with `automatic` for changes by the app and `source` for what caused it (see [`local-development.md`](local-development.md#the-local-database)) |
| `item_seen` | when the viewer last looked at an item, for "since you were last here" |
| `item_unread` | items the viewer marked unread by hand (U), with `marked_at`; opening the item removes the row |
| `item_note` | private notes per item |
| `item_write_failure` | writes to GitHub that failed (assign, unassign), with the error, for the item's timeline |
| `item_cache` | the last fetch: viewer, items (JSON), `fetched_at`, `full_at`, `scope` |

Schema changes are additive: a new column would be added in `Store.open` when missing.

## Browser storage

Per-view conveniences live in `localStorage`, not the database: collapsed bars and groups
(`useCollapsed`), sort direction (`useSortOrders`), avatar kinds (`Avatar`), panel sizes. Losing
them is harmless.
