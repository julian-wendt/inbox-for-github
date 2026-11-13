# Behaviour model

Where an item shows and what the keys do to it, as rules. `src/behaviour.test.ts` walks the table
below, one `describe` per rule. Where the code does not follow the model yet, the case is
`it.fails` and names the issue that changes it; that issue turns the case into a plain `it` and
drops its line under [Where the code differs](#where-the-code-differs). How each rule came about
is in [`decisions.md`](../decisions.md); how items are fetched and classified, in
[`architecture.md`](architecture.md).

Keys: **D** done, **F** follow-up, **P** plan for a day, **T** today, **X** take off the plan or
follow-up, **O** open.

## Views

| View | Answers |
|---|---|
| Inbox | Who wants something from me? |
| Assigned to me | My own work. A review request alone is only a review: it stays in the inbox. |
| Created by me | Are my items moving? Watched, never finished here: no D. |
| Planned | What did I set myself for today or a day? |
| Follow-up | What am I waiting for, and until when? |
| Done | No view of its own: a bar at the bottom of the inbox (rule 4). |

## Three facts per item

Independent of each other:

- **Handled until**: one time. D in the inbox (and on someone else's item in Planned), P, T and
  F set it to now; X leaves it.
- **Work**, only for items assigned to me: open, or my part done.
- **When**: nothing, today, a day, waits until a date, or waits without a date.

## Rules

1. The inbox holds every item with an ask newer than its handled-until.
2. Everything that brings an item back is an ask with a time: a mention, a review request,
   feedback, a reply in my review thread, new commits after my review, a reopen, news after my
   part done, a follow-up that is due, and with "Bring back on: Any post" any post by someone else
   on an item outside the tables. A due follow-up asks again what was pending, though F handled
   it, also an ask D had filed before F; what was answered asks as a reopen. A new assignment is
   no ask: it brings the item back as new work in Assigned to me, with its dot, also after my
   part done.
3. D on someone else's item files it: it sets handled-until; there is no stored "done" for it.
4. The Done bar shows what was handled in the last 7 days and has no newer ask; a fixed number,
   not `closedDays`, with no setting. The bar opens by click, by Enter, Space or → on its selected
   bar, and on a jump to an item in it; no view key opens it.
5. A follow-up is a *when*, not a status: F and X leave the work fact alone, X leaves
   handled-until alone. An item has one when: the newer of plan and follow-up replaces the
   other.
6. Planning (P, T) and a follow-up (F) count as handled and, when the item is open (the list's
   detail or a table's pop-up), as seen. A table row that is only selected stays unread, and so
   does an item marked unread by hand.
7. News by someone else since I last saw an item makes it unread and moves it up: a post, a
   review and, with "Other events", their events. An unassignment is no news, whoever it removes,
   me included; it shows only in the activity log. An assignment of someone else stays news.
8. A follow-up with "Remind me" (R in the follow-up menu, only with a date) rings once when it
   comes due: a notification, at the next start if the app was quit then, whatever the delivery
   mode, the reason switches or the window in front say; only the main switch stops it. The ask
   leaves as any due follow-up does (a reply, D, F, O). The notification's "Later" choices (in 1
   hour, this afternoon, the next workday) set the follow-up anew with "Remind me". Without it a
   follow-up comes due quietly (rule 2). Either way it comes back unread, as every return to the
   inbox does, though no one else posted; there is no bar of its own.

## Situations

| Situation | View | D | F | P / T | X |
|---|---|---|---|---|---|
| Someone mentions me or asks for my review | Inbox | handled: out of the inbox, into the Done bar | handled, waits in Follow-up | handled, into Planned | – |
| Closed on GitHub, waiting in the inbox (an own item someone else closed, news after my part done) | Inbox | handled, the only status offered | – | – | – |
| An ask newer than handled-until | Inbox, besides its table | as above | as above | as above | – |
| An answered or handled item, no newer ask | Done bar, for 7 days | – | waits in Follow-up | – | – |
| Assigned to me anew, also after my part done | Assigned to me, new (dot), work open | my part done | waits in its table and in Follow-up | in Planned, marked in its table | takes off the when |
| Assigned to me, nothing pending | Assigned to me | my part done | waits in its table and in Follow-up | in Planned, marked in its table | takes off the when |
| My part done, nothing since | Assigned to me (bar "finished") | – | the when changes, my part stays done | – | takes off the when |
| News after my part done | Inbox and Assigned to me | in the inbox: ticks the news off | as above | – | – |
| Opened by me | Created by me | not offered | waits in its table and in Follow-up | in Planned | takes off the when |
| An own issue assigned to me | Assigned to me and Created by me | in Assigned to me: my part done; in Created by me: not offered | as for an assignment | as for an assignment | takes off the when |
| Waits for a follow-up | Follow-up (and its table) | ends the follow-up | a new date | the plan replaces the follow-up | takes off the follow-up; handled-until stays |
| A follow-up comes due | Inbox, also for table items | as for any ask | as for any ask | as for any ask | – |
| A follow-up with "Remind me" comes due | Inbox, unread, one notification | as for any ask | a new date; "Later" in the notification too | as for any ask | – |
| Planned or pinned | Planned (and its table) | as in its home view | the follow-up replaces the plan | a new day | takes off the plan; handled-until stays |

## Where the code differs

Each line is an `it.fails` case in `src/behaviour.test.ts`, unless it says the case comes with
its issue. None at the moment: every case is a plain `it`.
