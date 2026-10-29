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
- Reading back is skipped without a chosen calendar, without access, while the chosen calendar
  is not listed (an account switched off in Internet Accounts), as every event would look
  deleted then, and while one of the app's own writes runs (`calendarWriting`), so a half-done
  move is not taken for a change in the calendar. An event counts as deleted only when it is
  missing on two reads in a row.
- Without a chosen calendar the app neither moves nor deletes events; the links stay.

## Verified behavior (2026-10-29, macOS 27.2, an Exchange account in Internet Accounts)

- `requestFullAccessToEventsWithCompletion:` needs `NSCalendarsFullAccessUsageDescription` in
  `src-tauri/Info.plist`. Tauri embeds that file into the unbundled dev binary as well (section
  `__TEXT,__info_plist` of `target/debug/inbox-for-github`), so the request works from
  `npm run tauri dev` without ending the process.
- The built app runs with the hardened runtime (`codesign -dv` shows `flags=…(adhoc,runtime)`),
  which grants calendar access only with the entitlement
  `com.apple.security.personal-information.calendars` (`src-tauri/Entitlements.plist`, named in
  `bundle.macOS.entitlements`). Without it macOS neither asks nor lists the app under Privacy &
  Security › Calendars; the unhardened dev binary works anyway. Re-signing an installed build
  with it (`codesign --force --sign - --options runtime --entitlements …`) and
  `tccutil reset Calendar inbox-for-github` brought the prompt back.
- An ad hoc rebuild loses the access: after `build:local` replaced 0.3.2-alpha.18 with
  alpha.20, macOS treated it as a new app and access had to be granted again. The permission is
  tied to the code signature, and every ad hoc build gets a new one (see `docs/releasing.md`).
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

- Whether `eventIdentifier` changes when the event is moved to another calendar; Apple's
  documentation says it most likely does. The app would then take the event for deleted and
  remove the plan.
- When `EKEventStoreChangedNotification` arrives after a change in Outlook, and whether it arrives
  while the window is hidden.
