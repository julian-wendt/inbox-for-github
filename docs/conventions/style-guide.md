# Style guide

Binding for every CSS change. Before choosing a value, find the element of the same kind below
and copy its spec; a new value needs asking first, then an entry here. `src/ui/styles/styles.test.ts`
checks font sizes, font weights, corner radii and hex colors against this page; the rest is for
review. Tokens and contrast are in [`ui.md`](ui.md).

## Type

**Weights:** 450 text, 500 medium (row titles, buttons, field labels), 600 semibold (headings,
emphasis, tags, bar titles, the selected segment), 700 only for unread rows and counts.

**Sizes**, each with its role:

| Size | Used for |
|---|---|
| 20px | the detail title, the crash page heading |
| 18px | the glyph in the empty list's mark |
| 17px | section titles in the detail |
| 15px | dialog titles, the palette's input |
| 14px | the search input, rows of a centered menu |
| 13.5px | body text: list and table rows, buttons, palette items, dropdown items |
| 13px | the pane header's title, context menu rows, the help text, comment and note fields |
| 12.5px | context and meta lines: a row's context, the detail's meta line, activities, popovers |
| 12px | secondary text: every `small`, field labels, counts, compact segments |
| 11.5px | times and dates in rows, labels, menu hints, monospace chips |
| 11px | small-caps headings, tags, the sidebar's counts and footer line |
| 0.85em | inline code |

A hint under a label is 1.5px smaller than the label: 13.5 → 12, 13 → 11.5, 14 → 12.5.

**Small-caps heading:** 11px, 600, uppercase, `letter-spacing: 0.04em`, `--text-faint`. The
sidebar's headings, the list's time groups, the palette's groups and the private note use it.

## Text colors

- `--text` for main text, `--text-muted` for secondary text and icons, `--text-faint` for quiet
  text (times, counts, hints in Settings).
- `--text-faint` is text only on `--panel`, `--surface` and selected rows. On `--control-fill`,
  `--track` and in menus, secondary text takes `--text-muted`.

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

## Heights

| Height | For |
|---|---|
| 18px | tags |
| 20 / 24 / 28px | labels and chips in the list / table / detail |
| 22px | compact segments, small × buttons |
| 26px | `.icon-btn`, `.chip-btn`, segments |
| 28px | `.btn` in panes |
| 30px (`--control-h`) | every control in a dialog, sidebar items, menu rows (minimum) |
| 36px | the search bar, palette items, organization dropdown items |
| 40px | bars, table rows, the organization dropdown, post and description heads |
| 44px | the pane header and the sidebar's top |
| 60px | inbox rows |
| 62px (`--row-h`) | rows with a switch in Settings (minimum) |

## Building blocks

**Tags** (bot, draft, review verdict, New, the table's plan, follow-up, carried and new marks):
one size, defined once in `base.css`, 18px tall, 11px semibold, `0 8px`. A tag sets only its
fill, border and color; a new tag joins the selector list there.

**Buttons**

- `.btn`: 28px (30px in dialogs), `--border` on `--panel`, 500; hover `--hover` and
  `--border-strong`. Variants `primary`, `success`, `ghost`.
- `.icon-btn`: 26px, transparent, `--text-muted`; hover `--hover` and `--text`.
- `.chip-btn` and every other filled control: `--control-fill`, `--text-muted`; hover and open
  `--control-hover` and `--text`.
- Every button with a hover fill fades `background` and `color` in `120ms var(--ease)`; rows and
  menu items change at once.
- Disabled: `opacity: 0.5`, for every control.

**Fields:** `--border` on `--bg`, `--radius-m`, `0 10px`, `--control-h` in dialogs; focus turns
the border `--text-faint` (global rule). The comment and note fields sit in a card and focus with
`--border-strong`; the search bar is filled and has no border.

**Segmented control:** track `--control-fill`, 2px padding, `--radius-m`; segments
`calc(var(--radius-m) - 2px)`, `--text-muted`, hover `--hover` and `--text`; the selected one
`--panel`, `--text`, 600 and a small shadow. `.compact` is 22px at 12px, `.multi` adds a 2px gap.

**Menus:** `--panel`, `--border`, `--radius-l`, `--shadow-pop`, 4px padding. Items `--radius-m`,
highlighted with `--selected` (hover, keyboard and the chosen entry alike), hints `--text-muted`.

**Dialogs and popovers:** the menus' container. Dialogs have `20px 22px` of padding (Settings
lays out its own panes) and a 15px semibold title. Pop-ups open 6px from their trigger. The error
bar keeps its red border.

**Cards** in Settings: `--border`, `--radius-m`, `10px 12px`, `--border` lines between parts.
Posts, the description and the comment box in the detail use `--border-strong` with `--surface`
heads, as GitHub does.

**Rows:** hover `--hover`, selected `--selected`, `--radius-m`, no transition.

**Motion:** 120ms for hover fades, 140ms for chevron rotations, 160ms for the switch knob, all
`var(--ease)`.

## Cascade

`base.css` loads after the other sheets (`main.tsx` imports `App` first), so a rule there beats
a rule of the same specificity elsewhere. A component that changes a building block from
`base.css` names it in the selector: `.icon-btn.time-chip-x`, not `.time-chip-x`.
