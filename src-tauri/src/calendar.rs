//! The macOS calendar through EventKit: the calendars and events macOS knows, an Exchange
//! account added under Internet Accounts included. See `docs/reference/calendar.md`.

use std::ptr::NonNull;
use std::sync::{mpsc, Mutex};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::Bool;
use objc2_event_kit::{EKAuthorizationStatus, EKCalendar, EKEntityType, EKEvent, EKEventAvailability, EKEventStore, EKEventStoreChangedNotification, EKSpan};
use objc2_foundation::{NSDate, NSError, NSNotification, NSNotificationCenter, NSString, NSURL};
use tauri::Emitter;

/// The app event sent to the web view when anything in the calendar store changed.
pub const CHANGED_EVENT: &str = "calendar-changed";

struct Store(Retained<EKEventStore>);
// EventKit allows a store on any thread; the mutex below keeps the calls one at a time.
unsafe impl Send for Store {}

/// One store for the app's lifetime, as Apple recommends: creating one is slow.
static STORE: Mutex<Option<Store>> = Mutex::new(None);

fn with_store<T>(f: impl FnOnce(&EKEventStore) -> Result<T, String>) -> Result<T, String> {
    let mut guard = STORE.lock().map_err(|e| e.to_string())?;
    let store = guard.get_or_insert_with(|| Store(unsafe { EKEventStore::new() }));
    f(&store.0)
}

/// A calendar events can go into or come from.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Calendar {
    id: String,
    title: String,
    /// The account it belongs to, as Internet Accounts names it ("iCloud", an Exchange address).
    account: String,
    writable: bool,
}

/// An event, with times as milliseconds since 1970 like JavaScript's `Date`.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    id: String,
    calendar_id: String,
    title: String,
    start: f64,
    end: f64,
    all_day: bool,
    /// False for events marked free, which leave the time open.
    busy: bool,
}

/// What `calendar_put` writes: a new event without `id`, else an update of that event.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    id: Option<String>,
    calendar_id: String,
    title: String,
    url: String,
    start: f64,
    end: f64,
}

fn date(ms: f64) -> Retained<NSDate> {
    NSDate::dateWithTimeIntervalSince1970(ms / 1000.0)
}

fn ms(date: &NSDate) -> f64 {
    date.timeIntervalSince1970() * 1000.0
}

fn event_of(event: &EKEvent) -> Option<Event> {
    unsafe {
        Some(Event {
            id: event.eventIdentifier()?.to_string(),
            calendar_id: event.calendar()?.calendarIdentifier().to_string(),
            title: event.title().to_string(),
            start: ms(&event.startDate()),
            end: ms(&event.endDate()),
            all_day: event.isAllDay(),
            busy: event.availability() != EKEventAvailability::Free,
        })
    }
}

fn failed(error: Retained<NSError>) -> String {
    error.localizedDescription().to_string()
}

/// Whether the app may read and write events, asking the user the first time.
///
/// Waits for the answer to macOS's permission dialog, so it runs off the main thread. Returns
/// false when the user declined now or earlier; the choice then lives in System Settings ›
/// Privacy & Security › Calendars.
#[tauri::command(async)]
pub fn calendar_access() -> Result<bool, String> {
    if unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) } == EKAuthorizationStatus::FullAccess {
        return Ok(true);
    }
    let (sender, receiver) = mpsc::channel();
    let answer = RcBlock::new(move |granted: Bool, _: *mut NSError| {
        let _ = sender.send(granted.as_bool());
    });
    with_store(|store| {
        unsafe { store.requestFullAccessToEventsWithCompletion(RcBlock::as_ptr(&answer)) };
        Ok(())
    })?;
    let granted = receiver.recv().map_err(|e| e.to_string())?;
    // A store made before access was granted shows no calendars until it is reset.
    with_store(|store| {
        unsafe { store.reset() };
        Ok(granted)
    })
}

/// All calendars for events, writable or not.
#[tauri::command(async)]
pub fn calendar_list() -> Result<Vec<Calendar>, String> {
    with_store(|store| unsafe {
        Ok(store
            .calendarsForEntityType(EKEntityType::Event)
            .iter()
            .map(|calendar| Calendar {
                id: calendar.calendarIdentifier().to_string(),
                title: calendar.title().to_string(),
                account: calendar.source().map(|s| s.title().to_string()).unwrap_or_default(),
                writable: calendar.allowsContentModifications(),
            })
            .collect())
    })
}

/// The events of all calendars that overlap `from` to `to` (milliseconds since 1970).
#[tauri::command(async)]
pub fn calendar_events(from: f64, to: f64) -> Result<Vec<Event>, String> {
    with_store(|store| unsafe {
        let matching = store.predicateForEventsWithStartDate_endDate_calendars(&date(from), &date(to), None);
        Ok(store.eventsMatchingPredicate(&matching).iter().filter_map(|e| event_of(&e)).collect())
    })
}

/// The events with these identifiers that still exist; a deleted one is simply missing.
#[tauri::command(async)]
pub fn calendar_find(ids: Vec<String>) -> Result<Vec<Event>, String> {
    with_store(|store| unsafe { Ok(ids.iter().filter_map(|id| store.eventWithIdentifier(&NSString::from_str(id))).filter_map(|e| event_of(&e)).collect()) })
}

/// Creates the event, or updates the one `draft.id` names, and returns it as saved.
///
/// An update changes title, link and times but keeps the calendar the event is in now. Returns
/// `None` when `draft.id` names an event that no longer exists, so a deleted event is never
/// brought back.
#[tauri::command(async)]
pub fn calendar_put(draft: Draft) -> Result<Option<Event>, String> {
    with_store(|store| unsafe {
        let event = match &draft.id {
            Some(id) => match store.eventWithIdentifier(&NSString::from_str(id)) {
                Some(event) => event,
                None => return Ok(None),
            },
            None => {
                let calendar: Retained<EKCalendar> = store.calendarWithIdentifier(&NSString::from_str(&draft.calendar_id)).ok_or("Calendar not found")?;
                let event = EKEvent::eventWithEventStore(store);
                event.setCalendar(Some(&calendar));
                event
            }
        };
        event.setTitle(Some(&NSString::from_str(&draft.title)));
        event.setURL(NSURL::URLWithString(&NSString::from_str(&draft.url)).as_deref());
        event.setStartDate(Some(&date(draft.start)));
        event.setEndDate(Some(&date(draft.end)));
        store.saveEvent_span_commit_error(&event, EKSpan::ThisEvent, true).map_err(failed)?;
        Ok(event_of(&event))
    })
}

/// Deletes the event; an event that is already gone counts as deleted.
#[tauri::command(async)]
pub fn calendar_remove(id: String) -> Result<(), String> {
    with_store(|store| unsafe {
        match store.eventWithIdentifier(&NSString::from_str(&id)) {
            Some(event) => store.removeEvent_span_commit_error(&event, EKSpan::ThisEvent, true).map_err(failed),
            None => Ok(()),
        }
    })
}

/// Sends `CHANGED_EVENT` to the web view whenever the calendar store changes, an edit in
/// Calendar or Outlook and a sync from the server included. Call once, at setup.
pub fn watch(app: tauri::AppHandle) {
    // EventKit posts the notification only while a store exists.
    let _ = with_store(|_| Ok(()));
    let changed = RcBlock::new(move |_: NonNull<NSNotification>| {
        let _ = app.emit(CHANGED_EVENT, ());
    });
    let observer = unsafe { NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(Some(EKEventStoreChangedNotification), None, None, &changed) };
    // The observer must live as long as the app.
    std::mem::forget(observer);
}
