# Decisions

Short records of product decisions whose reason is not obvious from the code. Newest first.

## 2026-10-27

- **Releases are prepared in CI and built on the Mac.** A merge to `main` only updates a release
  PR (release-please); merging that PR tags and drafts the release, and `npm run release:upload`
  attaches the app. No self-hosted runner (it would run repository code unattended with the rights
  of the Mac it runs on), no macOS runner (macOS minutes count ten times against the Actions quota),
  no local agent that polls for releases (same risk as the runner). A build the user starts
  is what `tauri dev` already is. See [`releasing.md`](releasing.md).
- **New commits by others bring a reviewed pull request back, as their own ask.** A push after
  the viewer's review is a real "please look again", unlike a commit in general, so it has its
  own setting (`reviewOnCommits`, on) instead of following `reopenOn`, and its own row label
  ("New commits") under the Reviews filter. Only the commit author is known, not the pusher, so
  commits without a linked GitHub user count as nobody's; a force push by someone else counts the
  same, since after a rebase the commits keep their old dates.
- **The bundle identifier is `inbox-for-github`, not a reverse-DNS name.** It names the data
  folder, and the old one carried a personal name and the project's former name. Reverse-DNS is
  Apple's and Tauri's convention, not a rule; without a domain of our own, a made-up one like
  `app.inbox-for-github` would only look unique. The app is not in the App Store, so no
  registered ID is needed.
- **The schema is cleaned up while the app is at 0.1.0.** The reminders table, the column
  `keep_open`, the setting `snoozeAuthored` and the one-time conversions of older data
  (`accepted`, `in_progress`/`waiting`, reminders into follow-ups, the first log entries) are
  gone, and the added columns are part of `CREATE TABLE`. Likewise `orbSeeds` and the cache's
  stale flags and filled-in fields (`boardsStale`, `typesStale`, `linkedPrs`, `threads`,
  `issueType`, board `fields`), with `CACHE_VERSION` kept, since every cache already has them. This replaces "the unused column
  `keep_open` stays" (2026-10-26): databases older than the last 0.1.0 builds are not supported.

## 2026-10-26

- **No two people share an orb.** An orb is a look: palette, accent and accent angle, one number
  below `LOOKS`. A login's first look comes from its name and is kept whenever it is free;
  otherwise it steps to the next free one. Looks are stored in `orbLooks` (login → look), so the
  assignment survives restarts and later arrivals never take an orb away. Shuffling draws only
  free looks. When all are taken, a look is shared. `orbSeeds` from the earlier shuffle is read
  once to carry such orbs over.
- **The initial in an avatar orb is plain white and may fall to 2.4:1,** below the 3:1 for icons.
  The orb only helps tell people apart (the login is in its tooltip, and the text beside it names
  the person), and 3:1 kept the palette to dark, muted colors. Palettes too light even for that
  get a dark initial instead (`initialColor`), so the palette can reach pastels and yellow.
  `MIN_INITIAL_CONTRAST` in `orb.ts` holds the floor and `orb.test.ts` checks every palette
  against the color it picks. Grey and white stay small accents on the rim.
- **The picked repositories narrow the counts next to the views; no other filter does,** and the
  list header shows no count. With a repo picked, a count of 4 beside a list of 1 read as a bug;
  the dock badge still counts everything. This replaces "counts ignore every filter" (2026-10-24).

## 2026-10-25

- **Inline comments stay on GitHub.** The timeline shows one line per review (verdict, number of
  inline comments, how many are resolved), linked to the review on GitHub, instead of each
  comment as a post; only one mentioning the viewer stays a post. Resolving has no time on
  GitHub, so it changes the line's state in brackets and never adds a line of its own.

- **"Reopen on" offers mention or any post.** The third choice, "any post if assigned", stopped
  doing anything once assignments snoozed in their table and finished as "my part done"; it is
  no longer offered, and a stored value acts as "mention", as it already did.
- **No notifications while the app is in front, by default.** Unlike the other new switches,
  `notifyInFront` starts off and so changes what existing users get: the list already shows
  what arrives while one works in it. Each reason has its own switch, all on.
- **U marks an item unread, or read again.** The mark lives in its own table, so `item_seen`
  keeps the time of the last visit; opening the item takes the mark back.
- **The dock badge counts unread, like a mailbox.** Opening an item (after `SEEN_AFTER_MS`) lowers
  it; what puts an item back is anything new by others since the last visit (`unreadInInbox`).
  Inbox and Assigned to me print unread rows bold, and their sidebar entry bold with its count;
  the count itself stays the total, so the view still says how much is there.

## 2026-10-24

- **Counts next to the views ignore every filter,** like the dock badge; repositories, kind,
  mentions/reviews and sprint narrow only the list and the number in its header. This replaces
  "sidebar counts follow the sidebar filters".
- **The Wiedervorlage view sorts by when items come back,** soonest first, as that is what the view is for.
- **Tables time rows by what defines them:** Assigned to me by the assignment, with the opening
  date as quiet absolute text after the title, never two relative times side by side; Created by
  me by the opening. Chips no longer filter; the sprint filter and the properties sit in the header.
- **One follow-up, no reminders.** "Snooze" and "reminder" were two ways to say "bring this back
  at a date", and an item could carry both, hiding one bell behind the other. Now there is one:
  the Wiedervorlage (F), with a date or without. Where the item waits follows from where it
  lives: assignments and own items stay in their table (bar Later, shared with board-blocked
  items, and stay waiting through mentions, which show in the inbox besides); others leave their
  list. Once the date has come the item is simply back in the inbox: no bell, no chip and no
  "ended" label in the list, only a line in the item's log. Reminders of earlier versions
  became follow-ups; the "snoozeAuthored" setting went (still stored, no longer read).
- **Dead settings keys are deleted, with approval.** `labels`, `statusColors`, `assignedView` and
  `autoAcceptSelf` leave the database at start, and settings load only keys the app knows, so a
  key it drops is not written back. The unused column `keep_open` stays: dropping it would mean
  rebuilding the table for nothing.
- **One bar for what is done but still open.** "Done" (described as still open on GitHub) at the bottom of Assigned to me
  holds both items done on their board and those whose part the viewer finished; two bars for
  nearly the same meant guessing. Only the latter follow their updates into the inbox.
- **"My part done" follows the item.** D on an assignment keeps it, done, in a bar at the bottom
  of Assigned to me (in every grouping, like Today on top), and every update since (posts by
  others, board moves, linked pull requests, closing) lands in the inbox until ticked off. There
  is no switch for it. ⌃A removes the viewer as assignee on GitHub, the fourth write; then the
  item is out everywhere, like any other they are not assigned to.
- **Done holds what was for the viewer.** Closed assignments and closed items they merely took
  part in show nowhere; Done keeps answered mentions and reviews and items finished from the inbox.
- **Assigning yourself is the third write.** "Assign me" (⌃A) adds the viewer to the assignees,
  next to comments and close/reopen; others stay assigned, and unassigning stays in GitHub.
- **Views follow what needs attention, not how items are found.** Five views, each answering one
  question: Inbox (who waits for an answer from me: mentions and review requests), Assigned to
  me (what I work on), Created by me (does my stuff move), Snoozed, Done. Watching and All are
  gone: commenting on or editing an issue matters only once a mention or assignment follows.
- **Assignments skip the inbox.** Accepting (A, ⇧A, "accept self-assignments") was a step
  between being assigned and the list of work; an assignment now goes straight to Assigned to
  me, marked new until opened. Stored acceptances stay readable.
- **Assigned to me groups by issue type,** bugs first, then other types, tasks, features,
  stories; pull requests from others on top. GitHub issue types only, no label fallback.
- **Your own pull requests live in Created by me,** also when assigned to you. Reviews on them
  show there (reviewers, work status), not in the inbox.
- **Mentions are not split into questions and notes.** A reply or D files both; guessing from
  a "?" would be unreliable.

## 2026-10-23

- **Read-mostly toward GitHub.** The app writes only plain comments and close/reopen. Review
  actions (approve, request changes, inline reviews) stay in GitHub's UI; deleting reminder
  comments or editing descriptions was declined (#11, #12).
- **Statuses are local.** Open, snoozed and done exist only in the app and never reach
  GitHub; closed or merged items follow GitHub and offer no status.
- **Frugal with the API.** Every feature is built to spend as few GraphQL points as possible:
  measured costs, deltas plus an hourly full fetch, local filtering when a setting narrows,
  single-item refresh with ⌃R. Cache fields added later are filled with empty values on
  load instead of a cache-version bump.
- **Snooze dates add to activity.** A snoozed item comes back at its date or earlier by the
  "reopen on" setting, whichever comes first.
- **A passed follow-up date puts the item into the inbox.** Whatever its other reasons, it stays
  until you file it, with its own notification; one that passed while the app was closed
  notifies at the next start.
- **Closing the window keeps the app running on macOS,** so reminders arrive on time; ⌘Q quits.
  `tauri-plugin-notification` cannot schedule notifications on desktop, so the app must run.
- **Notification timing is one mode, not layered rules.** "Immediately", "In working hours" or
  "Summaries only". Working hours are a list of ranges, so a break fits between them, and a
  range that starts where another ends is no break. Items outside the live moments are
  collected, never dropped, and one summary names them at the next release moment: a range after
  a break, or a set summary time. Not every user has Focus modes set up to mute the app outside
  work, so the app carries its own hours. No in-app "since your last summary" panel: the unread
  marks already show it. Exceptions per reason or repo, an organization filter, bundling
  and sound are left for later.
- **Assigned to me is a status table** grouped by the board status, normalized per board, with
  linked pull requests as the fallback. Today (T) holds up to three items; each morning what
  was planned for that day moves in (P, #55). What was not finished stays, marked since when, and
  counts against the three, so leftovers are dealt with first (D, P or T) instead of vanishing
  quietly. Planning is not snoozing: a planned item stays on the plate, in its own bar, instead
  of leaving it. T and G became ⌘T and ⌘G, since they switch the app, not an item, which freed
  T for Today and P for the plan menu. T and P take any open item in any view, not only assignments: a mention can be
  answered on Thursday too. Elsewhere than Assigned to me the row shows a star or its day, and
  a planned inbox item stays in the inbox, because someone still waits; F is the key that hides.
- **Planned replaces the Follow-ups view.** Today, plans and follow-ups all answer "when?", so
  one view lists everything with a date, by day, from Today to Without a date, with a star, a
  calendar or a bell per row. Follow-ups that wait in their table show there too; before, only
  those that left their list did. The two verbs stay apart: P keeps an item in its list and brings
  it to Today on its day, F hides it until its date and brings it to the inbox. No separate Today
  view: with at most three items it would be thin, so Today is the first bar of Planned. The
  sidebar keeps five views on keys 1–5, with Planned where Follow-ups was. Planned renders as a
  list with the detail beside it or as a table like Assigned to me, picked from an icon menu in
  its header and remembered per device, since the view is a conversation list for some and a
  work table for others.
- **The sidebar's view groups have no headings.** "Requests & updates" and "My issues & pull
  requests" suggested a split by whose work it is, which the views do not make: an assigned
  issue with a mention sits in the inbox and in Assigned to me. The real split is what comes in,
  is dated and is finished (lists, across all items) against what the viewer owns (tables, by
  role); Inbox → Planned → Done reads as that lifecycle on its own, so a short line between the
  groups says enough, and a heading would have to find an abstract word for it.
- **Untracking is local and deliberate.** It hides an item everywhere, also from new activity; it
  sits in the right-click menu under "More" and in the palette, not on a key, and can be undone.
- **Keyboard focus without rings.** A fill that meets 3:1, only after keyboard use. Whether to
  invest in Tab navigation at all or go shortcut-first is open.
- **Calm placeholders.** GitHub's identicons are replaced by gradient orbs picked per login.
- **GitHub is simulated at the transport,** not mocked per function. `fetch` is replaced, so the
  real client, parsing and classification run, and a scenario can script what happens on GitHub
  over time. The same simulator feeds the demo mode with synthetic data.
- **The demo is a storage and a `fetch`, not a second app.** `openStorage` returns a
  `MemoryStore` and installs the simulator, so every view, filter and write runs the real code
  on made-up data. It is switched from the palette rather than the settings, so a showcase
  setting cannot be reached by accident, and its people and repositories are fictional on
  purpose.
- **Undo is a chain, not a single step.** Every change the viewer makes (status, follow-up date,
  read and unread, Today, assigning and leaving, close and reopen, hiding an item) is a step with
  what takes it back and what does it again, kept for the window's lifetime (the last fifty).
  ⌘Z walks back, ⌘Y forward, and ⌘K lists the chain to jump several steps. A step restores what
  it replaced exactly, not "the previous status", so an older step after later changes of the
  same item restores that older state. Writes to GitHub are undone with the opposite write; a
  sent comment is not undoable and no step covers it. The history is not stored: it is gone at
  the next start.
- **D does not finish what you opened.** An own pull request, or an own issue without another
  assignee, is finished by closing or merging it on GitHub; marked done here it would stay open
  there and drop out of every list for good. D then warns and points to F (a follow-up is always
  fine). An own issue with another assignee besides you takes D as "my part done"; a follow-up
  that came due on an own item is filed by D without hiding the item. Items of other people
  keep D as "done" and "my part done".
- **The Dock badge counts where there is something to do.** Unread inbox items and unread
  assignments (not the parked bars Later and Done), marks by hand included; a mark on an item in
  Follow-ups or Done does not count. The tables show no count in their header: the sidebar's
  number is the one count of what asks for you.
- **The inbox switch is "All · Reviews · Other".** Reviews are pending review requests; "Other" is
  everything else that keeps an item there (mentions, due follow-ups, updates). Reviews come first
  like pull requests do in the kind switch, so the second position means the same in every view.
- **Keys that write to GitHub carry Control.** ⌃A assigns you, ⌃U removes you, ⌃O opens the
  item in the browser, ⌃R reloads it; no plain letter does either, so a key under the pointer
  never writes to GitHub by accident. U and R both toggle read and unread.
- **A repo shows "All updates" or "Only addressed to me".** In repos where others
  review, a request that reached the viewer only through a team (no `reviewRequests` entry with
  their login) loses the "review" reason before `classify`, so it neither fills the inbox nor
  notifies. The `directOnly` setting lists the repos per organization; every repo shows all
  updates by default, and hiding a repo altogether stays the job of the repo filter. Set in
  Settings → Rules or by right click on a repo in the sidebar. A withdrawn direct request still
  counts as direct, since `reviewRequests` holds every request event.
- **"Self-mention" for mentioning yourself,** so that "reminder" is not a second word for a follow-up.
- **`main` starts from the project's private predecessor, squashed per release.** Later changes go in as squash-merged PRs.
