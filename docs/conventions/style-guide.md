# Style guide

Binding for every CSS change. Before choosing a value, find the element of the same kind below
and copy its spec; a new value needs asking first, then an entry here. `src/ui/styles/styles.test.ts`
and `src/ui/partsStyle.test.ts` check every value set on this page; the rest is for review. Tokens and contrast are in [`ui.md`](ui.md).

## Type

**Weights:** 450 text, 500 medium (row titles, buttons, field labels), 600 semibold (headings,
emphasis, tags, bar titles, the selected segment), 700 only for unread rows and counts.

**Sizes:** six tokens, nothing in between (`inherit` and `0.85em` for inline code are the only
other values):

| Token | Size | Used for |
|---|---|---|
| `--fs-xs` | 11px | small-caps headings, tags, labels, `kbd`, times and dates in rows, the sidebar's counts and footer line |
| `--fs-s` | 12px | secondary text: every `small`, hints, field labels, context and meta lines, menu hints, popovers, compact segments, monospace chips |
| `--fs-m` | 13.5px | body text: rows, buttons, menus, fields (the search field too), the pane header's title, the help text |
| `--fs-l` | 15px | dialog titles, the palette's input |
| `--fs-xl` | 17px | section titles in the detail |
| `--fs-2xl` | 20px | the detail title, the crash page heading, the empty list's glyph |

A hint under a label is one step smaller: `--fs-m` → `--fs-s`.

**Small-caps heading:** 11px, 600, uppercase, `letter-spacing: 0.04em`, `--text-faint`. The
sidebar's headings, the list's time groups, the palette's groups and the private note use it.

## Text colors

- `--text` for main text, `--text-muted` for secondary text and icons, `--text-faint` for quiet
  text (times, counts, hints in Settings).
- `--text-faint` is text only on `--panel`, `--surface` and selected rows. On `--control-fill`,
  `--track` and in menus, secondary text takes `--text-muted`.

## Spacing

Every `gap`, `padding`, `margin` and `inset` uses these px values, negative ones included, and
nothing else: **0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48**.

- 1px only as a hairline gap or an optical nudge (a mono face lifted 1px, a tag's 1px padding).
- Which step an element takes is in the catalog below. An element not in it copies the
  nearest entry; when none fits, ask, then add it to the catalog.
- A value that follows from others is written as their sum, e.g. `calc(12px + 1px)` for a row's
  padding plus its border. Sizes above 64px are layout tokens in `tokens.css`.

## Sizes and positions

- `width`, `height`, their `min-`/`max-` forms, `top`/`right`/`bottom`/`left`, `inset`,
  `translate` and grid columns use **0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28,
  30, 32, 36, 40, 44, 48, 60, 64** px, or a sum of them that says where it comes from
  (`calc(44px + 8px)`: below the header, 8px apart).
- Anything larger is a layout token in `tokens.css` (`--dialog-w`, `--menu-max-w`, …), named by
  what it sizes; a custom property with a px value lives nowhere else.
- Fractions of the window (`vh`, `vw`) are layout tokens too (`--dialog-max-h`, `--dialog-top`);
  only `100vw`/`100vh` appear elsewhere. A share of the parent (`max-height: 50%`) is fine.
- Dots are 6px (on buttons and in text) or 8px (in rows and before options).
- Borders are 1px; 1.5px only for a drawn check box or radio, 3px only for an edge that carries a
  color (blockquote, calendar event).
- Inline styles in components only carry computed values: positions, measured widths, colors
  from GitHub. Fixed values belong in the CSS.

## Corners

| Radius | For |
|---|---|
| `--radius-s` (4px) | small things: inline code, search hits, calendar events, the small heading button |
| `--radius-m` (6px) | buttons, fields, rows, cards, menu items, segmented tracks |
| `--radius-l` (10px) | everything that floats: dialogs, menus, popovers, the toast, the item pop-up |
| `999px` | chips, tags, labels |
| `50%` | dots, avatars, round icons |
| container minus inset | a fill inside a rounded container: `calc(var(--radius-m) - 2px)` for a segment |

Pixel radii of 3px or less are only for drawn marks (repo dot, check box, stop square).

## Icons and avatars

| Icon size | For |
|---|---|
| 12 | inside tags, chips, marks and lines of `--fs-xs`/`--fs-s` text (row context, activities, notices, × in small buttons) |
| 14 | beside `--fs-m` text: menu items, buttons with a label (header menus included), segments, the description's head |
| 16 | icon-only buttons (`.icon-btn`, `.chip-btn`), the sidebar's and Settings' navigation |
| 20 | beside the detail title, the loading spinner |

Strokes: Lucide's default (2), `1.75` for the thin day and time marks and the navigation icons,
`2.2` for colored status icons (`StatusIcon`). Avatars are 18 (chips), 20 (posts, the sidebar's
footer), 28 (Settings lists) or 34 (inbox rows).

Every building block and its exact values are in the [catalog](#catalog).

## Motion

CSS takes `--dur-fade` (120ms: hover, fades), `--dur-move` (160ms: chevrons, the
switch knob, slides) or `--dur-slow` (400ms: scrollbar, usage meter), always with `var(--ease)`.
Animated elements in components take `MOVE` or `DIALOG_MOTION` from `src/ui/motion.ts`; every
dialog opens the same way.

## Catalog

The exact spec of every building block. Columns: height, padding, gap between its parts, type
(size token / weight), text color, fill, corner. "—" means none is set; a missing state uses the
row above. A change to a block changes its row here: `catalog.test.ts` holds each row's leading
values to the CSS of the selectors it names, so name the selector that carries the value and
write parts and variants after it ("title `m`/600", "(detail 28)"). "a / b" gives the row's
selectors their values in order.

**Containers**

| Block | Height | Padding | Gap | Type | Color | Fill and line | Corner |
|---|---|---|---|---|---|---|---|
| Pane header `.pane-header` | 44 | `0 16px` | 8 | title `m`/600 | `--text` | `--panel`, `--divider` below | — |
| Dialog `.dialog` | — | — | — | title `l`/600 | `--text` | `--panel`, `--border`, `--shadow-pop` | `l` |
| Dialog content `.dialog.help`, `.dialog.snooze-picker`, `.dialog.calendar-day` (the palette and Settings lay out their own parts) | — | `20px 24px` | 12 | | | | |
| Popover `.popover` | — | `12px 16px` | — | `s` | `--text-muted` | as dialog | `l` |
| Menu `.context-menu`, dropdowns | — | 4 | — | — | — | as dialog | `l` |
| Toast `.toast` | 40 | `0 6px 0 16px` | 16 | `m`/500 | `--text` | as dialog | `l` |
| Error bar `.error-bar` | — | `12px 16px` | — | `m` | `--new` | `--panel`, red 50% line, `--shadow-pop` | `l` |
| Card in Settings `.toggle-row` | `--row-h` min | `10px 12px` | 12 | `m`, hint `s` | `--text`, hint `--text-faint` | `--border` | `m` |
| Card group `.toggle-card`, `.delivery-card` | — | — | — | | | `--border`, `--border` lines between its rows | `m` |
| Status map `.status-map` | — | `10px 12px` | 2 | `m`, title 500 | `--text` | `--border` | `m` |
| Attribute row `.attribute-row` | — | `8px 12px 8px 6px` | 12 | `m` | `--text` | `--panel`, `--border` | `m` |
| Sidebar notice `.scope-notice` | — | `10px 12px` | 6 | `s`, title 600 | `--text-muted` | `--surface`, `--border-strong` | `m` |
| Post, description `.post`, `.description` | — | — | — | `m`, name 600 | `--text` | `--panel` / `--surface`, `--border-strong` | `m` |
| Their head `.post-head`, `.description-head` | 40 min / 40 | `6px 16px` / `0 16px` | 8 | | | | |
| Their body `.post-body`, `.description-body` | — | `12px 16px` / `0 16px 12px` | — | | | | |
| Comment box `.comment-box` | tabs 36 | tabs `0 12px`, body 8 | — | `m` | tabs `--text-muted`, active `--text` | `--border-strong`, head `--surface` | `m` |
| Empty state `.inbox-empty`, `.detail-empty` | — | — | 6 | `m` | `--text-faint` | — | — |

**Rows and items** (hover `--hover`, selected `--selected`, no transition)

| Block | Height | Padding | Gap | Type | Color | Corner |
|---|---|---|---|---|---|---|
| Inbox row `.inbox-row` | 60 | `0 12px`, 4px apart | 10 | title `m`/500 (unread 700), context `s`, end `xs` | `--text`, context `--text-muted`, end `--text-faint` | `m` |
| Table row `.table-row` | 40 | `0 12px 0 32px` | 12 | title `m`/500 (unread 700), number `s`, time `xs` | `--text`, number and time `--text-faint` | `m` |
| Bar `.bar` | 40 | `0 12px 0 6px` | 8 | `m`/600, count 500, hint `s`/450 | `--text`, count and hint `--text-faint` | `m`, fill `--surface` |
| List group heading `.list-bar .bar` | 26 | `0 12px 0 6px` | 8 | small caps | `--text-faint`, hover `--text-muted` | `m` |
| Sidebar item `.nav-item` | 30 | `0 8px` | 8 | `m`/500 (unread 700), count `xs` | `--text-muted`, on `--text` | `m`, on `--hover` with a `--border` ring |
| Sidebar heading `.nav-heading` | — | margin `20px 8px 6px` | — | small caps | `--text-faint` | — |
| Menu item `.menu-row`, dropdown and close-menu items | 30 min (dropdown with avatar 36) | `6px 8px` (dropdowns `0 8px` at their fixed height) | 8 | `m`, hint `s` | `--text`, hint `--text-muted` | `m` |
| Palette item `.palette [cmdk-item]` | 36 min | `6px 10px` | 10 | `m`, hint `s` | `--text-muted`, selected `--text` | `m` |
| Activity `.activity` | — | `0 12px` | 10 | `s`, names 600 | `--text-muted`, time `--text-faint` | icon circle 24 |

**Controls** (hover fades `--dur-fade`; disabled `opacity: 0.5`)

| Block | Height | Padding | Gap | Type | Color | Fill and line | Corner |
|---|---|---|---|---|---|---|---|
| Button `.btn` | 28 (dialogs 30) | `0 10px` | 6 | `m`/500 | `--text` | `--panel`, `--border`; hover `--hover`, `--border-strong` | `m` |
| Primary / success `.btn.primary`, `.btn.success` | as `.btn` | | | | `--on-accent` / white | `--accent` / `--green-fill` | `m` |
| Ghost `.btn.ghost` | as `.btn` | | | | `--text-muted`, hover `--text` | none, hover `--hover` | `m` |
| Icon button `.icon-btn` | 26 (small × 22) | 0 | — | icon 16 | `--text-muted`, hover `--text` | none, hover `--hover` | `m` |
| Filled button `.chip-btn`, with a label `.chip-btn.header-select` | 26 | 0 / `0 8px` | — / 4 | — / `s` | `--text-muted`, hover `--text` | `--control-fill`, hover and open `--control-hover` | `m` |
| Segmented `.segmented`, its segment `.segmented button` | — / 26 | 2 / `0 12px` | — | — / `m`/500 (on 600) | — / `--text-muted` (on `--text`) | track `--control-fill`, on `--panel` + `--shadow-raised` | `m` / `m − 2px` |
| Compact segment `.segmented.compact button` | 22 | `0 10px` | — | `s` | as above | | |
| Field (input, select, segment field) `.repo-search`, `.org-add input` | 30 | `0 10px` | — | `m` | `--text` | `--bg`, `--border`; focus `--text-faint` | `m` |
| Text area `.reply-field`, `.private-note textarea` | — | `8px 10px` | — | `m`, comment mono | `--text` | `--bg` (comment: `--panel` in its box) | `m` |
| Organization dropdown `.org-select-button` | 40 | `0 12px` | 8 | `m` | `--text` | as field | `m` |
| Search bar `.search-dock .search-bar` | 36 | `0 8px 0 12px` | 10 | `m` | `--text-muted` (icon), input `--text`, placeholder `--text-muted` | `--control-fill`, no line | `m` |
| Switch `.switch` | 18 × 32 | knob 14 at 2 | — | — | — | off `--border-strong`, on `--green-fill`, knob white + `--shadow-knob` | full |
| Link button `.link-btn` | — | 0 | — | `s`/600 | `--text`, underline `--border-strong` | — | — |
| Day in a month `.month-grid-day` | 30 | — | — | `m` (chosen 600) | `--text`, chosen `--on-accent` | none, hover `--hover`, chosen `--accent`, today a `--text-faint` line | `m` |
| Key `kbd` | 18 | `0 4px` | — | `xs`/500 | `--text-muted` | `--panel`, `--border` | `s` |

**Marks**

| Block | Height | Padding | Type | Color and fill | Corner |
|---|---|---|---|---|---|
| Tag `.bot-tag`, `.draft`, `.review-tag`, `.new-chip`, `.new-mark`, `.table-planned`, `.table-carried` | line 16, so 18 | `1px 8px` (with a line `0 8px`) | `xs`/600 | own fill, line and color only; shared rule in `base.css` | full |
| Chip `.chip` | 24 (detail 28) | `0 12px` | the table's `s`, the detail's `m` | `--text`, `--border-strong` line | full |
| Label `.label` | 20 (table 24, detail 28) | `0 8px` (table and detail `0 12px`) | `xs`/500 (detail `m`) | label color at `--tint` | full |
| Reaction `.reaction` | 24 | `0 8px` | `s` | `--text-muted`, `--border-strong` line; the viewer's own `--text` on `--blue` at `--tint` with a `--blue` line | full |
| Dot | 6 or 8 | — | — | a hue | full |

## Placing pop-ups and menus

| Opened by | Where it opens |
|---|---|
| a control (button, chip, dropdown) | `--pop-gap` (6px) below it, left edges lined up |
| a control at the right end of a bar (after the header's spacer, the info bulbs, the close button) | `--pop-gap` below it, right edges lined up |
| a dropdown field | `--pop-gap` below it, as wide as the field |
| a key on a list row (P, F) | `--pop-gap` below the row, centered on it; the middle of the pane when the row is hidden |
| a key with no row to hang from | centered in the pane |
| a right click | at the pointer |
| a menu entry with a submenu | `--pop-gap` beside the menu, its first row level with the entry |

Where the window ends, a menu takes the other edge of its control, opens above it when only
that fits, and keeps `--window-margin` (8px) to the window's edges; a submenu opens to the left.
Menus place themselves with `menuPosition` (`src/ui/menuPosition.ts`), pop-ups in CSS with
`calc(100% + var(--pop-gap))`; no component adds offsets of its own.

## Surfaces and effects

- **Backgrounds** are tokens only: `--panel` for cards, menus and dialogs, `--surface` for raised
  heads, `--bg` for fields, `--control-fill` for filled controls, `--hover` and `--selected` for
  rows and items, `--track` for small grey tags. No fill is `transparent`, never `none`.
- **Tints:** every `color-mix` takes one of four shares, never a number:
  - `--tint-faint` (8%): the warning notice's wash over `--surface`, the dev build's sidebar
  - `--tint` (14%): a hue behind `--text`, over `transparent` (tags, labels) or `--panel`
    (calendar events; a free event half of it)
  - `--tint-strong` (30%): the search hit
  - `--tint-half` (50%): colored lines (error bar, review verdicts, a key on a filled button) and
    the Markdown table's stripes

  The avatar placeholder's drawing is the one exception.
- **Shadows:** `--shadow-pop` for everything that floats, `--shadow-raised` for a selected segment,
  `--shadow-knob` for a switch's knob. Nothing else casts a shadow.
- **Borders** are `1px solid` in `--border`, `--border-strong` or `--divider` (lines between
  panes); `border: 0` to remove one. Drawn check marks use `1.5px solid var(--text-faint)`.
- **Raw colors** (`#…`, `rgb()`, `hsl()`) live in `tokens.css`; elsewhere only `#fff` and `#000`.

## Other value sets

| Property | Allowed |
|---|---|
| `line-height` | `1` for one-line boxes, `1.3` for tight multi-line text and titles, `1.5` body, `1.6` Markdown, px only where the line sets a box's height: `16px` tags, `18px` labels, `24px` the Settings heading |
| `opacity` | `0`, `0.5` (disabled, dimmed marks), `1` |
| `letter-spacing` | `0.04em` small caps, `-0.012em` the detail title, `normal`/`0` to reset |

**Layers** (`z-index`):

| Layer | What |
|---|---|
| 1 | the calendar's slot over its events |
| 2 | sticky heads over scrolling content |
| 5 | column resizers |
| 25 | a pop-up's backdrop |
| 26 | pop-ups and dropdowns |
| 30 | dialogs and their overlay |
| 35 | the toast |
| 40 | context menus |

## Cascade

`base.css` loads after the other sheets (`main.tsx` imports `App` first), so a rule there beats
a rule of the same specificity elsewhere. A component that changes a building block from
`base.css` names it in the selector: `.icon-btn.time-chip-x`, not `.time-chip-x`.
