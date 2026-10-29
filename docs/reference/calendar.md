# Calendar

Plans can go into any writable calendar of the macOS calendar store through EventKit: local
calendars and those of every account under System Settings › Internet Accounts (iCloud, Google,
Exchange, CalDAV). Only Exchange was tried so far. An Outlook account is reached only when it is
added there as well; the new Outlook for Mac keeps its own store, which EventKit does not see.

Code: `src-tauri/src/calendar.rs` (commands `calendar_access`, `calendar_list`,
`calendar_events`, `calendar_find`, `calendar_put`, `calendar_move`, `calendar_remove`, and the
app event `calendar-changed`), bindings from `objc2-event-kit` 0.3.2; `src/calendar.ts`, the day
view `src/ui/parts/CalendarDay.tsx` and the sync `src/ui/useCalendarSync.ts`.

## How plans and events stay in step

The setting `calendarEvents` links an item id to the `eventIdentifier` of its event. The day keeps
living in the plan (`planned`, `focus`); the time lives only in the calendar.

- **App to calendar** (`App.tsx`): planning another day or pinning to Today moves the event to
  that day at the same time (`calendar_move`, which keeps title and notes edited in the
  calendar). Removing the plan, D, a follow-up or closing the item deletes it. Undo moves it
  back, or creates a new event at the old time, as a deleted one cannot come back. A link whose
  item has neither pin nor plan any more is deleted along with its event.
- **Calendar to app** (`followCalendar`): at start, on `calendar-changed`, on window focus and
  every five minutes the linked events are read back. The calendar wins: an event on another
  day replans the item (today or earlier brings it into Today), a deleted one removes the plan
  and the link, and the item is back in the inbox.
- Reading back is skipped without a chosen calendar, without access (every event would look
  deleted) and while one of the app's own writes runs (`calendarWriting`), so a half-done move
  is not taken for a change in the calendar.

## Verified behavior (2026-10-29, macOS 27.2, an Exchange account in Internet Accounts)

- `requestFullAccessToEventsWithCompletion:` needs `NSCalendarsFullAccessUsageDescription` in
  `src-tauri/Info.plist`. Tauri embeds that file into the unbundled dev binary as well (section
  `__TEXT,__info_plist` of `target/debug/inbox-for-github`), so the request works from
  `npm run tauri dev` without ending the process.
- A store created before access was granted lists no calendars until `reset`, so
  `calendar_access` resets it after the answer.
- An event created through EventKit in the Exchange calendar appears in Outlook after the sync.
- `eventIdentifier` stays the same after the event was moved to another day in Outlook and synced
  back; `eventWithIdentifier:` then returns the new start and end. The stored link is that
  identifier.
- After the event was deleted in Outlook and synced back, `eventWithIdentifier:` returns nil, so
  `calendar_find` leaves it out.

## Trying the commands in the dev window

Right-click › Inspect opens Safari's Web Inspector. Its console rewrites a top-level `await`, and
`const x = await …` then fails with "const declared variable 'x' must have an initializer"; use
`var`:

```js
var invoke = window.__TAURI_INTERNALS__.invoke;
await invoke("calendar_access");
var calendars = await invoke("calendar_list");
```

## Not verified

- Whether macOS asks for calendar access again after an update: the permission is tied to the
  code signature, and every ad hoc build gets a new one (see `docs/releasing.md`).
- When `EKEventStoreChangedNotification` arrives after a change in Outlook, and whether it arrives
  while the window is hidden.
