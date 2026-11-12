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

- **Handled until**: one time. D in the inbox, P, T and F set it to now.
- **Work**, only for items assigned to me: open, or my part done.
- **When**: nothing, today, a day, waits until a date, or waits without a date.

## Rules

1. The inbox holds every item with an ask newer than its handled-until.
2. Everything that brings an item back is an ask with a time: a mention, a review request,
   feedback, a reply in my review thread, new commits after my review, a reopen, news after my
   part done, a follow-up that is due. A new assignment is no ask: it brings the item back as new
   work in Assigned to me, with its dot, also after my part done.
3. D on someone else's item files it: it sets handled-until; there is no stored "done" for it.
4. The Done bar shows what was handled in the last 7 days and has no newer ask; a fixed number,
   not `closedDays`, with no setting and no key.
5. A follow-up is a *when*, not a status: F and X leave the work fact alone, X leaves
   handled-until alone. An item has one when: the newer of plan and follow-up replaces the
   other.
6. Planning (P, T) and a follow-up (F) count as handled and as seen.

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
| Planned or pinned | Planned (and its table) | as in its home view | the follow-up replaces the plan | a new day | takes off the plan; handled-until stays |

## Where the code differs

Each line is an `it.fails` case in `src/behaviour.test.ts`.

- [#106](https://github.com/julian-wendt/inbox-for-github/issues/106) one handled-until: D in the
  inbox stores a done on someone else's item instead of filing it; X on a plan drops the plan's
  time (`plannedAt`), so what the plan handled asks again.
- [#107](https://github.com/julian-wendt/inbox-for-github/issues/107) follow-up as a when: F on an
  item whose part is done replaces the hand-off; X on someone else's follow-up drops the status,
  so the asks F handled ask again.
- [#108](https://github.com/julian-wendt/inbox-for-github/issues/108) returns only through asks:
  a new review request does not lift a stored done; a thread reply after D brings the item back
  for one pass only, as the Open written on the reset is newer than the reply, and then it shows
  nowhere; a reopen by someone else asks only where a status is stored; a reset of a stored done
  (e.g. by a reopen) makes the mention D had handled ask again; a due follow-up on a table item
  ends without an ask.
- [#109](https://github.com/julian-wendt/inbox-for-github/issues/109) the Done bar: Done is still
  a view, without asks filed on assignments and with no limit of days.
- [#110](https://github.com/julian-wendt/inbox-for-github/issues/110) own assigned issue: my part
  done on an own issue is cleared again on the next pass (`lockedDone` in `useInbox.ts`).
