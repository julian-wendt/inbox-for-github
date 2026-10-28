# Changelog

## [0.2.0](https://github.com/julian-wendt/inbox-for-github/compare/v0.1.0...v0.2.0) (2026-10-27)


### Features

* "Open in Orca" in the context menu and the palette, for repos Orca knows
* ⇧A accepts an item while its mention stays in the inbox until you answer
* ⇧E marks your part done and removes you as assignee on GitHub, the fourth write
* ⌃A assigns you or, where you are assigned, removes you; ⌃ keys never fire while typing and no longer pass as plain letters
* ⌃A only assigns, ⌃U removes you (also for marked items, with undo), and R reads and unreads like U
* ⌃R refreshes the selected item, ⌘R everything; ⌘⇧R goes
* ⌘F opens a floating search bar (centered in lists, top right in tables); X and Escape close it
* ⌘K switches between real and demo data
* ⌘R refreshes the selected item, ⌘⇧R everything; refresh button in the detail header
* a bell on items snoozed with a date, ringing once the date has come
* a click on a notification brings the window forward and opens its item
* a driver script runs the demo like a person would, and the demo exposes its simulated GitHub to it
* a finished assignment that is still open reads Done (still open on GitHub)
* a logging setting (off, debug, verbose) and a rotating log file written by the app itself
* a passed snooze date holds the item in the inbox until you file it
* a setting hides the Assigned to me view; its items stay under All
* a setting lets items you opened snooze into a Later bar of Created by me, like assignments
* a setting says whether refreshing a view follows the repository filter
* a shell command runs an allowed set of Orca CLI commands, and src/orca.ts finds or creates an item's worktree
* a snooze whose date comes notifies as such, also one that passed while the app was closed
* a switch per notification reason, and no notifications while the app is in front unless asked for
* accents on the orb rim are more diffuse
* accept assignments (A) into a new Assigned to me view; they leave when closed or unassigned
* All view lists every item of the selection, grouped by view, on key 6
* an empty view also offers All
* an empty view points to the views that hold the selection's items
* an item counts as read after 2.5 s open with the window in front
* an orb can be drawn again with a seed; seed 0 keeps today's look
* API budget ring next to the help button, details in its tooltip
* Assign me (I) adds you to an item's assignees on GitHub, the third write after comments and close/reopen
* Assigned to me as a full-width table with collapsible status bars and a pop-up detail
* Assigned to me grouped by repository, open before accepted before snoozed
* Assigned to me groups by issue type, bugs first, and leaves out the viewer's own pull requests
* Assigned to me groups by status or by time, switchable in its header
* Assigned to me groups by type or status only; time grouping is gone
* Assigned to me in groups (needs you, new activity, in progress, gone quiet, later) with a since-last-here divider
* Assigned to me no longer groups by repository; the sidebar filters repositories
* Assigned to me times rows by the assignment, with the opening date after the title; Created by me by the opening; no avatars
* assigning and removing yourself show in the item's timeline at once, and a failed write stays there with its error
* assigning, leaving, closing and reopening can be undone, writing the opposite to GitHub
* assignments go straight to Assigned to me; the inbox holds only mentions, review requests and due snoozes
* assignments snooze in place, into the Later bar with blocked ones; a mention shows in the inbox and the snooze stays
* assignments stay out of Done: unassigned items show nowhere, closed ones only as an update, old done ones join Done in the table
* attribute options only for switched-on boards, with the board name only when two or more are on
* avatar orbs show the login's initial in translucent white and blend three matching colors instead of grey
* avatars in the list are slightly larger
* blocked board statuses map to snoozed; status mapping as colored segments, hidden boards left out
* board status dot in the board's own color, reloading boards alone for a cache without it
* bold [@mentions](https://github.com/mentions) in posts with mine highlighted, Aktivitäten title over the posts
* bundle identifier inbox-for-github, data and logs migrated, schema cleaned up
* cache the last fetch locally, show it at start and offline
* choose and order the attributes of the Assigned to me table in the settings
* choose the organization for repo filters from a dropdown with filter summaries
* choose where an opened item starts: top (default), relevant spot or latest entries
* click a chip in the Assigned to me table to filter by its value
* close as completed or not planned, close pull requests and reopen, with or without a comment
* closed and merged items offer no status: a 'Closed on GitHub' chip, and E/S/U explain instead
* closing the window on macOS hides it, so snooze reminders keep arriving; the Dock icon brings it back
* collapse or expand all bars of the Assigned to me table
* collapse or expand all groups of a list
* configurable automatic refresh interval in a new General settings section
* configurable comment count and bot comment display in the detail view
* configurable limit for loaded items
* copy an item's link from the detail header, with C, and in three formats from the palette
* Created by me becomes a table of the viewer's open items, by who took them on and how far they are
* Created by me groups only by assigned and not assigned, sorted by age
* D and S no longer toggle back to open; S on a snoozed item offers the times, B takes a handed-off item back into the work
* D does not finish what you opened, the badge counts inbox and assignments, tables lose their header count, and the open questions' small fixes
* debug and verbose log lines for refreshes, GitHub requests and writes, status changes and classification
* debug log line for the token scope check
* delivery schedule for notifications as pure logic: working hours, fixed summary times and the summary text
* demo data: a fictional GitHub of about thirty items behind an in-memory storage, opened through one function
* detect missing token scopes and show the gh command that adds them
* drop the separate labels setting; labels are an attribute in both views
* drop the summary line above Assigned to me
* E on an assignment marks your part done; it moves to a bar at the bottom and its updates land in the inbox until ticked off
* each table picks its properties in its header; the settings keep the order and the detail's switch
* error boundary: a calm crash page with reload and copyable details instead of a blank window
* every settings section opens with a line on what it is for, and language, theme and notification reasons get a hint
* every status bar says in a quiet line what it holds
* fetch assignments, review requests, silent reviews and commits as activities
* fifteen more orb palettes, light ones with a dark initial
* filter items by per-organization repo settings
* focus (F, up to three today), private notes, a plate summary and auto-accept for self-assignments
* free-text search over title and number narrows every view's list
* GitHub identicons replaced by calm gradient orbs, picked per login
* GitHub-style comment box with tabs, Markdown toolbar and shortcuts
* GitHub-style thread line connecting posts and activities
* green settings switches when on
* group colors from the boards (backlog red, blocked pink), Todo renamed to Backlog
* hide status changes in the timeline that were corrected before anything else happened
* honey yellow for snoozed, ochre in light mode for contrast
* hover feedback for segmented switches and icon chips
* in lists the search bar is docked under the header at the width of the rows and pushes them down
* item keys follow their English labels: D done, B back to open, P pin for today, A assign me, ⇧A remove me, U undo
* items of Assigned to me and Created by me take reminders instead of snoozes; E ticks off a due reminder
* items you opened yourself get their own view, Created by me, instead of Watching
* keys act on the row under the mouse, until the arrow keys move again; a switch under Appearance › Lists turns it off
* labels in the table and in the detail view switch separately
* language setting with an English and German dictionary, English by default
* list rows always show the item number under the time
* list rows name the repo after the context; board status and sprint leave the row
* list rows show the status as the color of the issue/PR glyph instead of a separate ring
* list time groups fold like the table's bars, by click or with the arrow keys
* lists grouped by time: today, yesterday, this week, last week, this month, older
* load each issue's type; an older cache gets one full fetch to fill it
* load every board field value (select, iteration, text, number, date) at no extra cost
* load the open pull requests that close an issue (no extra cost) and use them for the work status without a board
* log manual status changes and show them in the detail timeline
* mark several items with ⌘-click, ⇧-click or ⇧J/⇧K; E, U, S, I and the context menu act on all of them, with one undo
* matches of the search are marked in the title and number of every row
* narrowing the closed window, item limit or boards filters the cache instead of refetching
* new commits by others bring reviewed pull requests back
* nine more orb palettes; alike colors give the lighter one the larger share
* no two people share an orb; looks are stored per login and shuffling draws free ones
* normalize board statuses into Todo, In Progress, In Review and Done, with a per-board mapping in the settings
* not yet accepted assignments sit in their work status bar, marked New
* notifications follow the delivery schedule: new items are collected outside it and one summary names them when a release moment passes
* notifications get a settings section of their own, one card for the main switch, its reasons and when, with the dock badge below
* O sets an item back to open, ⌃O opens it on GitHub; B is free
* one attribute list for both views, with a switch per view and a shared order
* one attribute set for table and detail, board status as a chip, real chips in the detail meta line
* one help dialog with tabs for sorting rules, all shortcuts and the basics
* option to keep the comment box docked at the bottom of the detail view
* option to skip loading boards, saving a query per refresh
* orb initials are plain white, dark on light palettes; contrast floor 2.4:1 by decision
* orbs get light rim accents (yellow, grey, white, peach) and five more palettes
* orbSeeds setting; avatars draw their orb with the login's seed
* pick organizations from the viewer's memberships, add others by login
* pick several repos; dots turn into checkboxes once one is picked
* private notes on every item; Esc leaves the note field
* pull requests keep review ids and links, and each inline thread's state with its comments' links, at unchanged cost
* read the budget from every response and wait as long as GitHub says after a rate-limit refusal
* redo is ⌘Y, and the menus show R for read and unread
* related switches in every settings section share one card: lists, sidebar, automatic rules, and boards under their main switch
* reminders: a local table, a due reminder adds its item to the inbox and notifies once
* remove a reminder with the × in its chip or the X key, also a due or long past one
* rename the app to Inbox for GitHub
* render the HTML GitHub allows in posts, sanitized with GitHub's rules
* reply with a plain comment from the detail view, with Markdown preview
* repo filters on their own settings page, taller settings dialog
* repo icon in the repo chip
* repos set to Only addressed to me carry the same icon in the sidebar
* reset bucket, repo and kind filters from a sidebar button, Esc or the palette
* reset the repo filter from the Repositories heading; the footer eraser goes
* resize the docked comment box by dragging its top edge
* review summaries in the timeline show their verdict: approved, changes requested, review
* right click on a repo in the sidebar switches the team-review rule for it
* right click on a view refreshes all its items in bulk, 19 points per 50 instead of one each
* right click on Inbox or Assigned to me marks all its items read or unread, with undo
* right-click menu per item with status, today, copy, reload and untrack under More
* roomier table rows, bars reorderable by drag and drop, Space opens an item, repo as a chip
* rule that ignores review requests that reached you only through a team, per organization and repo
* S offers snooze dates: later today, tomorrow morning, next week or a picked date
* scrollbars show only while their area scrolls and fade out after
* search field in every view's header, focused with ⌘F
* Settings › General can reset all stored statuses at once, logged per item as settings:reset
* Settings › Notifications › When notifications arrive: mode, working days and hours, summary times; new keys notifyDelivery, notifyCollected, notifyLastSummary
* Settings → Look lists people with orbs and shuffles each one until it pleases
* settings apply instantly, close with X or Esc
* settings choose per organization where team review requests are ignored
* Settings gets its own Avatars section with the avatar switch and the orb shuffle
* settings to hide the sidebar counts of views and of repositories
* settings with a side navigation over four sections
* show all, all but some or only some repos per organization in the settings
* show assignments, review requests, silent reviews and commits between the posts; reserve the detail scrollbar
* show closed and merged items under done for a configurable number of days
* show GitHub API usage under General: points left, reset time, cost per refresh and per hour
* Show more is a link with arrows, like the links in the text
* show the actor's avatar in activity lines
* show unassignments in the activity timeline
* snooze choices from the detail's Snoozed button and the right-click submenu, also to change the date
* Snoozed and Done sort, group and show the time they were snoozed or finished
* Snoozed and Done switch between mentions and reviews like the inbox
* Snoozed groups by when items come back, soonest first, and shows that time in each row
* snoozed items can carry a date and come back then, or earlier by activity (storage and rule)
* snoozes of table items turn into reminders at their date; Created by me has no snoozed bar
* soft violet for mentions of me
* sort button in every list and the Assigned to me table: newest or oldest first
* sort by others' activity, with a setting for what counts
* status bars in the keyboard selection; arrows fold and unfold them
* status_log records each change's source, the viewer's input or the app's code path, in a new nullable column
* stop a running refresh from the sidebar; requests are aborted, the shown data stays
* stop tracking an item for good (X), with undo and a settings list to track it again
* switch notifications and the dock badge on or off
* T steps the filter in the header, G switches the grouping; / no longer opens the palette, ⌘K does
* tables dock the search bar full width and slide it like lists; the slide logic moves into useSearchDock
* tables filter by sprint from a header menu; clicking a chip no longer filters
* the arrow keys alone move the selection; J and K are free again
* the Assigned to me table can group its bars by repository
* the chosen attributes in the detail view's meta line, set and ordered separately
* the demo takes language and theme from the address, and a script takes its screenshots
* the demo's issue types carry GitHub's colors
* the description can be collapsed, expandable (fixed height that fades out, with Show more) or full, as the settings say
* the detail explains when a snoozed item comes back by its date
* the detail shows a reminder chip with bell, date and time
* the dev window has an orange-tinted sidebar with a stripe, unlike the installed app
* the dock badge counts unread inbox items; unread rows and their sidebar view print bold
* the follow-up is called Wiedervorlage, keyed on F; the texts follow
* the inbox switches between mentions and reviews; A and ⇧A are gone, new assignments are marked until opened
* the item's log says when a follow-up came due
* the log names the commit the app was built from, at start and in each status change
* the picked repositories narrow the counts next to the views, and the list header shows no count
* the search bar prints how many items match
* the search bar slides in and out
* the Show more link ends in the header's chevron, and the settings' title bar with its close button stays while the settings scroll
* the sidebar has five views; Watching and All are gone, what you merely take part in shows nowhere
* the sidebar splits its views into Mentions & reviews and My issues & pull requests
* the simulated world can follow the wall clock, write older times and draw avatars inline
* the snooze and reminder dialog takes the time in its own 24-hour field; arrows step and switch hours and minutes
* the snooze date picker takes the time in 24-hour form, whatever the system's clock setting
* the snooze dialog takes the date as DD.MM.YYYY in a field of its own, like the time; one segment field serves both
* the table shows the chosen attributes in order, never shortened; board fields, labels and an assignee pill
* the timeline shows one linked line per review with its inline comments' state instead of each inline comment
* the timeline shows state changes, force pushes, dismissals and links as linked lines, at unchanged query cost
* the web view follows the Mac's region and 24-hour clock, so the snooze picker shows the device's time format
* the Without type bar has a grey dot and the Done bar a green one
* Today as its own card with a counter, stars to pin and unpin, status rings, and a fresh start every morning
* Today set apart by a sidebar-style heading instead of a tinted card
* translate sidebar, list, row reasons, toasts and shared labels
* translate the command palette, shortcut and rules overviews and notifications
* translate the detail pane, explanations, activities and item facts
* translate the settings, organization and repository pickers and rule texts
* U and P can be undone with ⌘Z, each restoring exactly what it changed
* U marks an item unread or read, also from the context menu and the palette
* undo is a chain with redo (⇧⌘Z) and a history in ⌘K, every change kept with what takes it back and what does it again
* undo moves to ⌘Z; a focused text field keeps ⌘Z for its own typing, U is free
* unread rows show a blue dot like in Mail, and read titles are lighter, so unread stands out
* Views heading in the sidebar, reset view as an eraser in the footer, question mark for help
* violet app icon with a check in a circle
* W and a button in the detail header open the item in Orca
* watch GitHub's hourly GraphQL budget and pause automatic refreshes when it runs low
* watch your personal repositories next to organizations
* who opened an item is the first, pinned entry of the timeline instead of the description header
* who opened an item moves from the meta line into the description header
* Working and Reviewing pills; their avatars spread apart on hover
* working-hours mode returns with several ranges per day, so a break fits between them; ranges that join need no summary
* worktrees opened from the inbox show the item's title in Orca


### Bug Fixes

* @types/node for vite.config.ts so lint passes on CI
* a clicked table row or bar no longer turns dark or bright under the focus fill after arrow keys; its selection shows the position
* a comment header stays on one line; a long name and the review note end in an ellipsis instead of wrapping
* a dash instead of a colon after Still open on GitHub
* a repo stays in the sidebar while any view holds one of its items, also Follow-ups and Done
* a visible scrollbar takes the place of the right padding, so lists, tables and the detail keep even sides
* adding a summary time picks the next free hour instead of 09:00, which a duplicate swallowed
* after assigning or unassigning, the item follows GitHub's assignees even when a refresh ran meanwhile
* align the section title with the settings title
* All divider a bit stronger
* All divider clearly visible
* All divider in the plain strong border color
* All sits under a faint divider in the sidebar
* an empty list keeps the scrollbar's room, so the header controls do not jump
* an inset line under Today
* app icon closer to the reference: larger circle with a gradient, rim light and outer glow
* assignee pill prefix is Owning
* avatar sits with the chips, the time stands apart
* bar name Done (but still open)
* bar titles start where the item numbers do
* branch name back in mono
* branch name in the text font, change counts in mono
* call the reset 'Ansicht zurücksetzen'
* clearer label for the board choice in the settings
* clearer, more precise wording for every setting in both languages
* close reason menu opens downward, upward only when the window lacks room
* close the settings with Esc wherever the focus is
* colon after each view name in the sorting help
* comment field and private note keep their dim focus border
* comment field at 13px; Comment button without the shortcut key
* commits get their own timeline window, so many commits no longer push review requests and other events out
* declare the trigger ref before the timeline uses it
* detail chips, labels and kind icon a size larger
* dim the pane dividers in dark mode
* dim the resize highlight on pane dividers
* draft and bot tags pill-shaped like all chips
* drop the count after Aktivitäten
* drop the selection edge in the command palette
* each view says what its emptiness means, and counts of one are singular
* empty-view hints centered, label above the links
* Esc closes the pop-up, clears the marks, then the selection; filters and the view stay
* Esc resets the filters but keeps the chosen view
* Escape closes the date and time picker, and only it; the active part shows a light fill with an accent line instead of the dark focus fill
* Escape no longer takes the window out of macOS full screen
* every notification carries an Open button, since macOS reports a click only on notifications with one
* fainter outline around the comment field
* filtering by chip keeps the clicked row in place; filters sit in the header
* focus cue only after keyboard use; Write tab follows the comment box corner
* focus fits the description header card-wide and shows on text links as an underline
* folded bot comments show a fold arrow in their header instead of an underline that read like a link
* frame posts that mention me like any other post
* full-width org switch, repo mode as radio buttons beside the search
* gray chosen radio, lighter type weights in the settings
* gray repo checkboxes that take exactly the dot's space
* gray ring with a dot for the chosen radio
* half the gap between avatar and time
* hand-drawn check centered in the repo checkbox
* header controls grey out instead of disappearing, so the others keep their place
* header controls stay right when chip filters show
* heavier stroke on the status-colored glyph in list rows
* help always opens on General; German Zugewiesen and Review angefragt
* help opens on its first tab, now called General
* help tabs in the order basics, sorting, shortcuts and across the full width
* help tabs really span the full dialog width
* house icon for resetting the view
* in the tables an open item its board calls done shows the done icon, as its bar files it
* in the tables the unread dot sits at the start of the row, before the star
* inbox count without red
* keep the repo mode row steady, more room under the settings titles
* keyboard focus adds a fine ring to the tint, for 3:1 contrast
* keyboard focus as a 3:1 fill with full text color, no ring
* keyboard focus as a soft tint instead of a ring; text fields by their border
* larger drag handles
* larger help window with a close button
* let drag and drop reach the UI by turning off Tauri's file drop handling
* let the settings nav title spacing win over the generic dialog title
* light-mode yellow is a golden #b07800 instead of brown; it colors icons only, reminder texts stay neutral beside their bell
* light-mode yellow turns amber orange (#c66c00); orange moves toward red (#dc5a1e) so Projects' yellow and orange options stay apart
* lighter dark mode surfaces, borders and faint text lifted along
* list always reserves the scrollbar; kind switch before the light bulb in the list header
* list count ignores folded groups; selected group heading without background
* list group headings move with the rows when the list changes
* list group headings quiet again, without a bar background
* list row titles at 13.5px
* lists scroll to the selection only when it changes, not on every render, so they stop jumping back while you read further down
* make the org switch rule win over the generic segmented rule
* menu rows share a column for check marks, so unticked properties line up
* mono branch name and counts lifted 1px to align in the chip
* more room before the last-update column
* more room between chevron and dot, star and kind icon
* more visible chip borders
* name repo filter modes 'Alle mit Ausnahmen' and 'Nur ausgewählte'
* no direct X shortcut for untracking; menu, header button and palette only
* no doubled top border on the active comment tab
* no focus outline on table rows, whatever the stylesheet order
* no focus ring on table rows, one gap between all rows and bars
* no status ring in the today card
* no strip under the docked search bar where scrolled rows are cut off
* no untrack button in the detail header; right-click menu and palette only
* one bar, Done, still open, holds items done on their board and those whose part you finished
* one flat surface for the settings dialog
* own avatar cached for offline use, failed avatars reload once back online
* Owning and Reviewing in the chips' own text style
* Owning and Reviewing without a colon; the reviewers attribute is called Reviewing
* palette jump always lands: clears kind and chip filters, opens a folded group
* pane dividers in the same stronger gray as card frames
* pill tooltips without colon; inbox count in the regular weight
* pill-shaped chips
* placeholder orbs in mid tones only, softer highlight
* PR branch and conflicts join the detail meta line; Owning and Reviewing avatars back to 18px
* PR change count a little smaller
* private note below the description
* proportional digits for the sidebar and list counts
* release-please filter for the version in Cargo.lock
* reload board fields alone for a cache from before board fields, instead of a full fetch
* removing a chip filter keeps the selected row in place
* render task lists without bullets and tables aligned in GitHub style
* repo name in Assigned to me rows too, for consistency
* repo reset eraser always visible, disabled without a repo filter
* repo reset eraser only shows while a repo is picked
* right click keeps the marks, a withdrawn team request names the team, counts of one are not plural, a new post starts the read timer over, and more (QA findings)
* roomier chips
* running refresh shows the spinning icon with a small stop square
* S opens the snooze or reminder choices in the middle of the detail, also in the pop-up
* settings drag handle back to its former size
* settings texts drop what is outdated: properties speak of the detail view, the status mapping of what it decides, and the reopen choice that no longer did anything is gone
* sharper repo icon in the repo chip
* size inline code relative to its text, so it grows in headings
* slightly darker light mode surfaces, dimmer pane dividers
* smaller sidebar counts
* solid circle for the open status
* spell out Pull Requests; the sidebar counts every item, filters narrow only the list and its header
* star under the bar chevron, kind icon under the bar dot
* status as a plain colored ring without glyphs
* status bars as high as item rows
* status segments in the board settings without colored dots
* stop square sits a bit further into the refresh icon
* stop square without a border
* stretch the org switch across the settings page
* stronger gray for card headers, the description and their frames
* submenu entries without icons
* table bars 40px high, like the rows
* table bars without colored dots; titles start where the kind icons do
* table header shows the kind filter before the grouping switch
* table rows 40px high instead of 44px
* text in lists, table and detail slightly dimmer in dark mode
* the × and X take off any bell, an ended snooze and a snooze date as well as a reminder
* the active part of the date and time fields has a mid-grey fill, no line
* the assignees attribute is called Owning
* the attribute settings are headed Attributes in item details
* the bottom bar is named Done and says in a quiet line what it holds
* the click that closes a menu no longer opens the item under the pointer
* the Comment button has no hover effect
* the demo never asks for a real avatar, initials follow the name parts, and the list title stays on one line
* the detail's light bulb opens on click, closes on Escape or a click outside
* the device's language and region go into the app's own AppleLanguages, which WebKit's web processes read, so the picker shows 24-hour time
* the dock badge also counts items marked unread by hand, in any view
* the docked search bar and the list slide by transform; the layout changes at once and nothing is measured per frame
* the docked search bar fades instead of animating its height, so the list no longer stutters
* the Done bar's line keeps only that it is still open and where updates land
* the Done bar's line names comments and mentions as the updates that reach the inbox
* the empty detail names the arrow keys, menu keys do what they show, the bulk menu and palette gain the keys the code has
* the green comment button keeps white text in dark mode too, on the deeper green that switches share
* the guessed status uses the normal selected segment background
* the last bar of Assigned to me is named Blocked, as it holds only items blocked on the board
* the light bulb explains an item by why it is in the inbox, a follow-up in a table by its own rule, and Esc closes popovers first
* the line under Today only when the table below is empty
* the list's reminder bell sits 1px lower, level with the kind icon
* the list's reminder bell sits in the meta row next to the kind icon
* the Only addressed to me icon sits right behind the repo name
* the pop-up close button sits in the detail header with the other buttons
* the selection comes back through a ref, so the lint rule holds
* the selection moves on in the same render an item leaves, so an open pop-up switches without a flicker
* the sidebar's first section is headed For me
* the sidebar's first section is headed Requests & updates
* the sidebar's repository list is headed Filter by repository
* the simulator answers GitHub's requests only, so Tauri's own calls pass through
* the sprint filter leads the table header, before Issues/Pull Requests
* the sprint filter lists the earliest sprint first and the latest last
* the sprint filter's generic choices read All and None
* the summary check renders the app again only when a summary is due
* the table's Later bar is called Snoozed
* the web view's own right-click menu (Reload) shows only in text fields and the dev window
* timeline lines name you as You for your own review requests and reviews
* titles and text in lists, table and detail are a little softer in light mode, as in dark
* undo restores exactly what a change replaced, bulk D and O follow the same rules as for one item, and ⌘Z says what it took back
* untrack and its undo build on the current settings (lint: no ref read in render)
* untrack uses the bell-off icon
* Untracked settings as two-line rows that shrink with the dialog, title opens the item
* warmer, more orange snoozed color
* wider settings, solid radio buttons without the inner dot
* working-hours rows have spacing between them
* worktrees opened from the inbox stay top-level in Orca instead of nesting under the app's own worktree


### Performance Improvements

* Assign me shows at once and queues the write; one request instead of four, undone with a toast if it fails
* delta refreshes load only items updated since the last fetch, with a full fetch every hour
* reload only the changed item after a comment, close or reopen
* two searches per refresh instead of four, assigned and mentioned read from the items


### Reverts

* back to the single date-and-time picker; the bell's tooltip keeps 24-hour time
* the device locale in AppleLanguages did not reach the Tauri web view; facts stay in the docs
* the sprint filter's generic choices read All sprints and No sprint again
