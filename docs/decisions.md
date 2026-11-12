# Decisions

The product decisions whose reason is not obvious from the code, one section per topic, each as
it stands today. A new decision updates its topic and dates it in the section, e.g.
"(2026-11-12)"; a reason that no longer holds is deleted, or kept as one line "Earlier: …" where
it explains today's choice. What an item does and where it shows is in
[`behaviour.md`](reference/behaviour.md); this file holds why.

## Views and their intents

Views follow what needs attention, not how items are found (2026-10-24). Each answers one
question, and D follows that intent (2026-11-11); the table of views is in
[`behaviour.md`](reference/behaviour.md#views).

- **Inbox:** who wants something from me. **Assigned to me:** my own work; a review request alone
  is only a review and stays in the inbox. **Created by me:** are my items moving; watched, never
  finished here. **Planned** and **Follow-up** answer "when" (below). What was
  handled is no view: it is the Done bar of the inbox (below). The five views sit on keys 1–5.
- Commenting on or editing an issue matters only once a mention or assignment follows, so there
  are no Watching and All views. Mentions are not split into questions and notes: guessing from a
  "?" would be unreliable.
- **Assignments skip the inbox.** Accepting was a step between being assigned and the list of
  work; an assignment goes straight to Assigned to me, marked new until opened.
- **Your own pull requests live in Created by me,** also when assigned to you. Reviews on them
  show there (reviewers, work status), not in the inbox.
- **An own issue assigned to the viewer is their work** (2026-11-12). In Assigned to me D is "my
  part done" as on any assignment; in Created by me it is only watched. Own pull requests and own
  items not assigned to the viewer stay locked: they end by closing or merging on GitHub, and
  marked done here they would stay open there and drop out of every list.
- **The inbox switch is "All · Reviews · Other".** Reviews are pending review requests; "Other" is
  everything else that keeps an item there. Reviews come first like pull requests in the kind
  switch, so the second position means the same in every view.
- **The sidebar's view groups have no headings.** "Requests & updates" and "My issues & pull
  requests" suggested a split by whose work it is, which the views do not make: an assigned issue
  with a mention sits in the inbox and in Assigned to me. A short line between the groups says
  enough: what comes in, is dated and is finished (lists) against what the viewer owns (tables).
- **Planned renders as a list or a table** like Assigned to me, picked from an icon menu in its
  header and remembered per device, since the view is a conversation list for some and a work
  table for others.

## D, and keys in general

- **D means one thing per view** (2026-11-11), set out in [`behaviour.md`](reference/behaviour.md).
  Only the inbox files asks, updates and closings by others. Assigned to me has "my part done",
  also while the viewer is the only assignee: the item moves to the bar Finished, keeps its plan
  and calendar event, and follows its updates. Created by me has no D. A second D on a part
  already done shows a hint; O takes the part back into the work. D is not offered on a row of the
  Done bar: the item is handled already. On an assignment with open asks
  D asks first, like F: Enter is "only my part" (the asks stay in the inbox), D also files them,
  Esc does nothing.
- **No multi-select; every key acts on one item** (2026-11-12). The bulk paths held most of the
  inconsistencies the audit of 2026-11-11 found (toasts that said "→ Done" for everything, D
  skipping closed items silently, X and F without feedback), and each model step would have needed
  a bulk variant and a second test case. D moves to the next item, so D, D, D replaces bulk D.
  "Mark all read" on a view stays: it acts on a view's items, not on a selection.
- **Keys act on the selection, not on the row under the mouse** (2026-11-10). A resting pointer
  sent D or X to a row the viewer did not mean, and a switch that stops it is easy to miss; the
  `hoverActs` setting is deleted.
- **A row of a table counts as seen only once its pop-up showed it,** not while it is merely
  selected: the row shows nothing of the item, and a right click selects it too.
- **Closing a pop-up lets go of a row reached by a click,** and keeps one reached with the
  keyboard: the selection is the keyboard's cursor, and a click meant the item, not the row. The
  same holds when the pop-up closes because its item left the table, as after D: a click-opened
  one leaves nothing selected, so a second D cannot hit the next row unseen; a key-opened one
  moves on to the next row, for working through a table. A key pressed with no item selected says
  so in a toast.
- **Keys that write to GitHub carry Control.** ⌃A assigns you, ⌃U removes you, ⌃O opens the item
  in the browser, ⌃R reloads it; no plain letter does either, so a key under the pointer never
  writes to GitHub by accident. U and R both toggle read and unread. ⌘T and ⌘G switch the app
  (⌘T the filter, ⌘G the grouping), not an item, which freed T for Today and P for the plan
  menu.
- **Tab reaches the main window's buttons only with a setting, off by default** (2026-11-10,
  `tabToButtons`). Native Mac apps walk text fields only unless "Keyboard navigation" is on in the
  system; the web view walks buttons regardless, so the app carries the switch itself. With it on,
  a button the keyboard focused takes Enter and Space, which otherwise open the pop-up or fold the
  bar; after a click they are shortcuts again. Keyboard focus shows as a fill that meets 3:1, not
  a ring, and only after keyboard use.
- **Undo is a chain, not a single step.** Every change the viewer makes (status, follow-up date,
  read and unread, Today, assigning and leaving, close and reopen, hiding an item) is a step with
  what takes it back and what does it again, kept for the window's lifetime (the last fifty). ⌘Z
  walks back, ⌘Y forward, and ⌘K lists the chain to jump several steps. A step restores what it
  replaced exactly, not "the previous status". Writes to GitHub are undone with the opposite
  write; a sent comment is not undoable. The history is not stored.
- **Untracking is local and deliberate.** It hides an item everywhere, also from new activity; it
  sits in the right-click menu under "More" and in the palette, not on a key, and can be undone.

## Follow-up, plans and "when"

- **Plan is the calendar, follow-up is waiting** (2026-10-28). P and T say "I do this on that
  day"; F says "leave me alone, I am waiting for others". Both are a decision and take an item out
  of the inbox, which lists what is undecided. They differ in where the item comes back: a plan
  lands in Today on its day, a follow-up is back in the inbox at its date or on a new ask. The
  "due" state and its notification went: coming back is enough, nothing needs to stick or ring.
- **An item has one when** (2026-11-12, #107). The newer of a plan and a follow-up replaces the
  other; an item is never planned and waiting at the same time. A follow-up on a finished part
  is a when too: F keeps "my part done", X and D in Follow-up end the follow-up back into that
  state, and O opens the work again and keeps the follow-up. P and T never apply to a finished
  part. F that changes nothing (same date, or none again, with no ask waiting) is a no-op, so
  neither the status time nor the snapshot moves.
- **One follow-up, no reminders** (2026-10-24). "Snooze" and "reminder" were two ways to say
  "bring this back at a date", and an item could carry both. The follow-up has a date or none. A
  passed date brings the item back as an ask, with its own notification; one that passed while the
  app was closed notifies at the next start. Where an item waits follows from where it lives:
  assignments and own items stay in their table (bar Follow-up, with Blocked on its own), others
  leave their list.
- **Follow-up has its own view** (2026-11-02). A follow-up is also how to check back on work
  handed to others (an assignment whose part is done, an issue someone else took on, an own pull
  request); nothing else showed all that the viewer waits on. The view lists every follow-up that
  waits, by the day it comes back, soonest first, as a list or a table like Planned. The tables
  keep their Follow-up bar, so they still show all the viewer owns; whether those bars stay is
  open. Assigned to me shows board-blocked items in a bar Blocked of their own.
- **Planned shows Today and plans.** Today is its first bar, so what is due now stays in sight of
  what comes next. P keeps an item in its list and brings it to Today on its day; F hides it
  until its date. Planning is not snoozing: a planned item stays on the plate.
- **Today has no limit.** It first held three items; the limit forced choices nobody wanted and
  let a plan that did not fit miss its day without a word. Each morning everything planned for
  the day moves in; what was not finished stays, marked since when, so leftovers are dealt with
  (D, P or T) instead of vanishing quietly.
- **T and P take any open item in any view,** not only assignments (never a finished part): a mention can be answered on
  Thursday too. Elsewhere than Assigned to me the row shows its day or the Today mark.
- **A plan holds until its day.** Answering an ask that brought a planned item into the inbox
  only answers the ask: the item stays in Planned, so a reply cannot cost the plan. Closing on
  GitHub drops it at once. Plain activity stays in Planned as unread. D ends a plan, except "my
  part done", which keeps it in every view, shared or not.
- **Plan and Follow-up offer the same days** from one function (`dayChoices`), with the same
  keys. "Later today" went, as a follow-up is about days; its time is a setting (`followUpTime`,
  09:00). One mark, the calendar with the day, replaces the star for Today in rows and tables;
  T and P remain as keys.

## Calendar

- **Plans can go into the macOS calendar, and the calendar wins** (2026-10-29). EventKit reaches
  every calendar of the Mac (iCloud, Google, Exchange) without an account login of the app's own,
  so it beats a direct Outlook or Google API. Only plans get an event, not follow-ups: a plan is
  when you do the work, a follow-up is when you check on others. The time lives only in the
  calendar, the day in the plan; moving the event moves the plan, deleting it removes the plan,
  since what the calendar shows is what the viewer sees and edits. See
  [`calendar.md`](reference/calendar.md).
- **The calendar is a record of what was done when, so only the user removing a plan deletes its
  event** (2026-11-11). X and T switching a Today pin off delete it; D, a follow-up, the item
  closing on GitHub and dropping it from the app end the plan but leave the event, and only the
  link goes.
- **This is the one place where local data leaves the Mac:** the item's title, day, link and
  reference go to the calendar's server, and only after the viewer chose a calendar.

## Asks, returns and handled

How items return is in [`behaviour.md`](reference/behaviour.md) (rules 1, 2, 3 and 6): an item
returns only through an ask newer than its handled-until. The reasons:

- **Items come back only through asks with a time** (2026-11-12, #108). A mention, review
  request, feedback, thread reply, new commits, a reopen on GitHub by someone else, news after my
  part done, a due follow-up and, with "Any post", a post by someone else are asks with a time.
  An item is in the inbox while one is newer than handled-until; nothing is written to bring it
  back. Earlier: a reset wrote an Open or ended the follow-up (`auto:snooze-ended`), so row,
  explanation and history could name different asks. Now they follow the newest ask, and every
  return gets a history line that is derived, not stored (`history.back.*`).
- **The ask kinds:** `opened` (O, a manual ask), `reopened` (a reopen on GitHub, with who),
  `post` ("Any post", with who) and `due` (a follow-up whose date passed). A due follow-up, a
  reopen, O and "Any post" return quietly, without a notification.
- **A reopen on GitHub asks only on items that were for the viewer** (a mention, a review
  request, a table item) **and that the viewer handled or answered,** newer than handled-until and
  the last reply. Old reopens on items never handled stay quiet. Assigning yourself and reopening
  it yourself do not count.
- **A due follow-up asks on any item,** table items and finished parts included, and asks again
  what was pending when F handled it, also an ask D had filed before F. It asks until the viewer
  replies or files it (D). Rows of past-due follow-ups stay as they are.
- **An ask does not end a follow-up outside a table:** the item shows in the inbox and keeps
  waiting in Follow-up.
- **Handled-until is its own fact** (2026-11-12, #106). It lives in the table `item_handled`, not
  in `item_status`: most filed items have no status row, and an `open` row reads as a reopen. D
  files someone else's item instead of storing a done, also on a closed item waiting in the inbox
  (filing and setting handled-until are the same thing). Earlier: five cutoffs decided what was
  new (`filedAt`, `plannedAt`, a stored done, the start of a follow-up, the hand-off time); they
  stay readable, and the migration carries a stored done over. X keeps handled-until, so the asks
  a plan or follow-up handled stay handled. "Reset statuses" also clears it. On a tick-off of a
  hand-off with updates only the snapshot is refreshed; a closed item gets no write.
- **P, T and F count as handled and, when the item is open** (the list's detail or a table's
  pop-up), **as seen.** A table row that is only selected stays unread, and so does an item marked
  unread by hand.
- **A new assignment is not an ask, and writes nothing** (2026-11-12, confirming 2026-11-11).
  Someone wants something from you again, which is what the app is for, so it brings the item
  back as new work in Assigned to me with its dot, also after "my part done" or "done". It drops
  a finished part and keeps a follow-up. Earlier: it cleared the whole row, follow-up included,
  and a stored done won over a fresh assignment.
- **Feedback, thread answers and closings by others ask for you** (2026-11-02). A post or review
  by someone else on an item you opened or that is assigned to you, an answer in a review thread
  you wrote in on someone else's pull request, and your own item closed by someone else without
  it being done (a pull request not merged, an issue not planned or a duplicate) bring the item
  into the inbox, without a mention. Waiting for feedback is what an own item does; missing it was
  the gap. Your reply, review or push answers it; D files it without finishing anything. Each has
  its switch in Settings → Rules; feedback on own items can be narrowed to requested changes. Bots
  do not count.
- **Merge conflicts do not ask.** A conflict on an own pull request surfaces anyway the next time
  you work on it or try to merge it, although `pull.conflicts` is already fetched.
- **New commits by others bring a reviewed pull request back, as their own ask** (2026-10-27). A
  push after the viewer's review is a real "please look again", unlike a commit in general, so it
  has its own setting (`reviewOnCommits`, on) instead of following `reopenOn`, and its own row
  label ("New commits") under the Reviews filter. Only the commit author is known, not the
  pusher, so commits without a linked GitHub user count as nobody's; a force push by someone else
  counts the same, since after a rebase the commits keep their old dates.
- **"Bring back on" offers mention or any post.** The third choice, "any post if assigned",
  stopped doing anything once assignments finished as "my part done"; a stored value acts as
  "mention". With "Any post" (2026-11-12), any post by someone else on an item outside the
  tables, newer than handled-until, is an ask. The setting key `reopenOn` stays; only the label
  changed, since there is no stored done anymore.
- **"Self-mention" for mentioning yourself,** so that "reminder" is not a second word for a
  follow-up.
- **A repo shows "All updates" or "Only addressed to me".** In repos where others review, a
  request that reached the viewer only through a team (no `reviewRequests` entry with their
  login) loses the "review" reason before `classify`, so it neither fills the inbox nor notifies.
  The `directOnly` setting lists the repos per organization; every repo shows all updates by
  default, and hiding a repo altogether stays the job of the repo filter. Set in Settings → Rules
  or by right click on a repo in the sidebar. A withdrawn direct request still counts as direct,
  since `reviewRequests` holds every request event.

## The Done bar

- **Done is a bar of the inbox, not a view** (2026-11-12, #109). What the viewer handled is a
  look back, not a place to work from, so it is the inbox's last folded group instead of a view
  competing in the sidebar. It holds what was handled in the last `DONE_DAYS` (7) days and asks
  for nothing: handled-until (D, P, T, F), the closing of an item for them, and, outside Assigned
  to me and Created by me, the viewer's reply to a mention or review; working on an own or
  assigned item does not keep it in the bar. Planned and waiting items stay in their own views.
  The 7 days are fixed, without a setting; closed items keep `closedDays`, which already decides
  how long they are loaded, and closed items that were not for the viewer show nowhere. The bar
  opens by click and on a jump to an item in it; no key of its own opens it. Counts, the badge
  and unread leave it out, so it never calls for attention. D in the inbox moves on to the next
  open item instead of following the item down into the bar. Earlier: Done was a view with no
  limit of days.
- **One bar for what is done but still open.** "Finished" at the bottom of Assigned to me holds
  both items done on their board and those whose part the viewer finished (described as still
  open on GitHub); two bars for nearly the same meant guessing. Only the latter follow their
  updates into the inbox. It is in every grouping, like Today on top, and there is no switch for
  it.
- **"My part done" follows the item.** Every update since (posts by others, board moves, linked
  pull requests, closing) lands in the inbox until ticked off. ⌃U removes the viewer as
  assignee on GitHub; then the item is out everywhere, like any other they are not
  assigned to.

## News dot, unread and the badge

- **The news dot counts only activity the detail shows** (2026-11-11). An item never opened counts
  from its last status change, else from when it was assigned to you or opened by you; an item
  that is neither shows no dot. On your own items the timeline shows every assignment, so someone
  taking one on counts as news.
- **The dock badge counts unread, like a mailbox, and only where there is something to do.**
  Unread inbox items and unread assignments (not the parked bars Follow-up and Finished), marks by
  hand included. Opening an item (after `SEEN_AFTER_MS`) lowers it; anything new by others since
  the last visit puts it back (`unreadInInbox`). Inbox and Assigned to me print unread rows bold,
  and their sidebar entry bold with its count; the count itself stays the total. The tables show
  no count in their header: the sidebar's number is the one count of what asks for you.
- **U marks an item unread, or read again.** The mark lives in its own table, so `item_seen`
  keeps the time of the last visit; opening the item takes the mark back.
- **The picked repositories narrow the counts next to the views; no other filter does,** and the
  list header shows no count (2026-10-26). With a repo picked, a count of 4 beside a list of 1
  read as a bug; the dock badge still counts everything.

## Tables and lists

- **Assigned to me is a status table** grouped by the board status, normalized per board, with
  linked pull requests as the fallback. Grouped by issue type (the default), bugs come first,
  then other types, tasks, features, stories, with pull requests from others on top; GitHub issue
  types only, no label fallback.
- **Assigned to me and Created by me can group by repository** (2026-11-10), one bar per
  repository by name, for whoever works through one codebase at a time. Follow-up, Blocked and
  Finished stay at the bottom as in every grouping. Within a repository bar rows go by the time
  they show. The bars are not reorderable: names are easy to find. Created by me has its own
  choice (`authoredGrouping`), since it has no types to share.
- **Tables time rows by what defines them:** Assigned to me by the assignment, with the opening
  date as quiet absolute text after the title, never two relative times side by side; Created by
  me by the opening. Chips no longer filter; the sprint filter and the properties sit in the
  header.
- **Inline comments stay on GitHub.** The timeline shows one line per review (verdict, number of
  inline comments, how many are resolved), linked to the review on GitHub, instead of each
  comment as a post; only one mentioning the viewer stays a post. Resolving has no time on GitHub,
  so it changes the line's state in brackets and never adds a line of its own.

## Fetching and the API

- **Frugal with the API.** Every feature is built to spend as few GraphQL points as possible:
  measured costs, deltas plus a full fetch, local filtering when a setting narrows, single-item
  refresh with ⌃R. Cache fields added later are filled with empty values on load instead of a
  cache-version bump.
- **A full fetch every 15 minutes** (2026-11-02), not every hour. Deltas see only what moves
  `updatedAt`, and assignments, board moves and cross-references do not. A full fetch of about
  200 items costs about 120 points, so four an hour plus a delta every minute stay near 1,400 of
  GitHub's 5,000. The budget is shared with every other tool on the same token, which is why it
  is not tighter.
- **A transferred issue is recognized by repository, creation time and title.** GitHub gives it a
  new node id and keeps no link to the old one, but keeps `createdAt` and the title, and names
  the old repository in a `TransferredEvent`. The match also needs exactly one candidate, and the
  old copy must be missing from the fetch, so a copy that still resolves is never taken over.
  Checking that the old id no longer resolves would cost a request per transfer for a case the
  other conditions already rule out. Not covered: a title changed between the transfer and the
  next fetch, and an issue moved twice in that time; their old copy goes at the next full fetch,
  without its local state.

## Notifications and the window

- **Closing the window keeps the app running on macOS,** so notifications arrive on time; ⌘Q
  quits. `tauri-plugin-notification` cannot schedule notifications on desktop, so the app must
  run.
- **Notification timing is one mode, not layered rules.** "Immediately", "In working hours" or
  "Summaries only". Working hours are a list of ranges, so a break fits between them, and a range
  that starts where another ends is no break. Items outside the live moments are collected, never
  dropped, and one summary names them at the next release moment. Not every user has Focus modes
  set up to mute the app outside work, so the app carries its own hours. No in-app "since your
  last summary" panel: the unread marks already show it. Exceptions per reason or repo, an
  organization filter, bundling and sound are left for later.
- **No notifications while the app is in front, by default.** Unlike the other new switches,
  `notifyInFront` starts off and so changes what existing users get: the list already shows what
  arrives while one works in it. Each reason has its own switch, all on.

## GitHub writes

- **Read-mostly toward GitHub.** The app writes only plain comments, close/reopen, and adding the
  viewer to or removing them from the assignees ("Assign me" ⌃A, ⌃U; others stay assigned).
  Review actions (approve, request changes, inline reviews) stay in GitHub's UI; deleting
  reminder comments or editing descriptions was declined.

## Data, settings and privacy

- **Statuses are local.** Open, follow-up and done exist only in the app and never reach GitHub;
  closed or merged items follow GitHub and offer no status. Notes and settings stay on the Mac
  too, with the one exception of the calendar above.
- **A setting nothing reads is deleted, not kept** (2026-11-10). Kept "just in case", dead keys
  and values piled up: stored and unread, stored and read as another value, filtered on load. A
  dropped key leaves the type and the database at the next start, and a dropped value is rewritten
  to the one it acted as (`tableGrouping` "time" to "type", `reopenOn` "mention-or-assigned-post"
  to "mention"). Keys are deleted by name, not "every unknown key", because builds of different
  branches share one database and would delete each other's new settings. Dropping a key needs
  approval.
- **New settings say "New" until their section was open once** (2026-11-02). A quiet blue chip on
  the field and its section, and a dot on the settings button, so a setting that came with an
  update is found without the release notes. Seen is a per-device convenience in localStorage; a
  fresh install sees nothing as new. No expiry by time: entries leave `NEW_SETTINGS` by hand.
- **The schema was cleaned up while the app was at 0.1.0** (2026-10-27). Old tables, columns and
  one-time conversions are gone, the added columns are part of `CREATE TABLE`, and `CACHE_VERSION`
  stayed since every cache already had the fields. Databases older than the last 0.1.0 builds are
  not supported.
- **The bundle identifier is `inbox-for-github`, not a reverse-DNS name.** It names the data
  folder, and the old one carried a personal name and the project's former name. Reverse-DNS is
  Apple's and Tauri's convention, not a rule; without a domain of our own, a made-up one like
  `app.inbox-for-github` would only look unique. The app is not in the App Store, so no
  registered ID is needed.

## Look

- **Calm placeholders.** GitHub's identicons are replaced by gradient orbs picked per login.
  **No two people share an orb:** an orb is a look (palette, accent and accent angle, one number
  below `LOOKS`). A login's first look comes from its name and is kept whenever it is free;
  otherwise it steps to the next free one. Looks are stored in `orbLooks` (login → look), so the
  assignment survives restarts and later arrivals never take an orb away. Shuffling draws only
  free looks. When all are taken, a look is shared.
- **The initial in an avatar orb is plain white and may fall to 2.4:1,** below the 3:1 for icons.
  The orb only helps tell people apart (the login is in its tooltip, and the text beside it names
  the person), and 3:1 kept the palette to dark, muted colors. Palettes too light even for that
  get a dark initial instead (`initialColor`), so the palette can reach pastels and yellow.
  `MIN_INITIAL_CONTRAST` in `orb.ts` holds the floor and `orb.test.ts` checks every palette
  against the color it picks. Grey and white stay small accents on the rim.

## Releases, demo and tests

- **The release is built in CI, and only a green build tags it** (2026-10-29). A merge of the
  release PR builds the app on a macOS runner (free on a public repository); release-please
  creates the tag and the release only after that, then the app is attached and the release
  published. A published tag is permanent, so a failed build must not leave one behind. A local
  build is no release: it embeds the builder's home directory through the Cargo registry's
  paths, which is why 0.1.0 and 0.2.0 carry no download. The build job runs typecheck, lint and
  tests again on the merged commit. Earlier: a self-hosted runner or a local agent was ruled out,
  as it would run repository code unattended with the rights of the Mac. See
  [`releasing.md`](releasing.md).
- **GitHub is simulated at the transport,** not mocked per function. `fetch` is replaced, so the
  real client, parsing and classification run, and a scenario can script what happens on GitHub
  over time. The same simulator feeds the demo mode with synthetic data.
- **The demo is a storage and a `fetch`, not a second app.** `openStorage` returns a
  `MemoryStore` and installs the simulator, so every view, filter and write runs the real code on
  made-up data. It is switched from the palette rather than the settings, so a showcase setting
  cannot be reached by accident, and its people and repositories are fictional on purpose.
- **`main` starts from the project's private predecessor, squashed per release.** Later changes
  go in as squash-merged PRs.
