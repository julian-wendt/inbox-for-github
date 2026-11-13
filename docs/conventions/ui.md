# UI conventions

## Design tokens

All colors, radii, fonts and shadows are CSS custom properties in `src/ui/styles/tokens.css`,
defined three times: light in `:root`, dark under `@media (prefers-color-scheme: dark)`, and dark
again under `:root[data-theme="dark"]` for the manual switch. A new color token MUST be added to
all three. Components use tokens, never hex values.

Notable tokens:

| Token | Use |
|---|---|
| `--text`, `--text-muted`, `--text-faint` | text levels; lists and detail use `--text-content` (slightly dimmer, about 12:1 in both themes) |
| `--border`, `--border-strong` | quiet and visible lines; cards, inputs and dropdowns use `--border` (`--border-strong` on hover), chips `--border-strong` |
| `--hover`, `--selected` | row and button backgrounds |
| `--focus-fill` | keyboard focus fill, 3:1 against the panel |
| `--segment-fill` | the active part of a date or time field; softer by choice, below 3:1 |
| `--yellow`, `--green`, `--blue`, `--red`, `--purple`, `--pink` | the only tone of each hue; AA as text in both themes, except light yellow (3:1, icons and dots only) |
| `--st-*`, `--new`, `--mention` | status roles, aliases of a hue above; never a value of their own |
| `--green-fill` | filled green under white text (comment button, switches); the light green in both themes |
| `--orange` | dots and decoration only (GitHub Projects options, the dev stripe) |
| `--radius-s/m/l` | 4, 6, 10 px |

## Contrast

WCAG AA in both themes: 4.5:1 for text (badge text included), 3:1 for icons and the visual cue
of a control's state. Decorative lines and tracks are exempt. Compute the ratio against the
surface the color sits on, compositing transparent fills first; a short Python snippet with the
WCAG luminance formula is enough.

One exception: the initial in an avatar orb is white at 2.4:1 or better, see
[`decisions.md`](../decisions.md).

**Keyboard focus** is a fill (`--focus-fill`) with the text inside switched to `--text`, shown
only after keyboard use (`html[data-input="pointer"]` hides it after clicks, set in
`src/main.tsx`). No outlines or rings. Text fields show focus by their border in `--text-faint`
(5:1 against the panel in both themes, quieter than `--accent`); `.btn.success`
darkens instead.

## Shapes

- Chips, pills and labels are fully rounded (`border-radius: 999px`).
- A highlight inside a rounded container matches the container's inner radius
  (`calc(var(--radius-m) - 1px)` inside a 1px border).
- Items of one kind are equally tall wherever they appear: in the settings every control is
  `--control-h` (30 px) and every row with a switch at least `--row-h`, with or without a hint.
  The organization dropdown is the one larger control (40 px), as it carries an avatar and a count.
- A segmented control picks one option; one where several can be on (weekdays) is
  `.segmented.multi`, whose options stand apart with a gap.
- Controls in a list or table header are greyed out (`disabled`, `--text-faint`) when they have
  nothing to act on, never hidden, so the others keep their place. Counts in a switch show 0.
- A scroll area keeps its left padding; a visible scrollbar takes the place of the right one
  (`useGutter` sets `--gutter`, CSS uses `max(0px, calc(<padding> - var(--gutter, 0px)))`), so
  both sides keep about the same room. Overlay scrollbars measure 0 and change nothing.

## Texts and i18n

- Every text is a key in `src/ui/locales/en.ts` (the source, typed `Messages`) and
  `src/ui/locales/de.ts` (typed `Messages`, so a missing key fails the typecheck).
- `t(key, params)` for plain strings with `{name}` placeholders; `tRich(key, { name: <strong/> })`
  when a placeholder is markup.
- English UI copy in sentence case; German uses "du".
- A row's context line names the person who wants something from the viewer: who mentioned,
  asked for the review, pushed, reopened or assigned them (`rowContext`). In the inbox it names
  the newest ask, the one the row is dated by and the explanation starts with. Only when GitHub
  does not say, e.g. a commit without a linked user, does the line go without a name. It carries
  no repository: the row's tooltip, the detail and the sidebar filter have it.

## Keyboard

Shortcuts are registered in `App.tsx` with `useHotkeys` (`src/ui/useHotkeys.ts`). Keys are
lowercased; `mod+` is ⌘, `shift+` is added with ⌘ and for letters. Single-key shortcuts do not
fire while typing in a field.

Tab in the main window follows the "Tab reaches buttons" setting (`tabToButtons`), off by
default as in most Mac apps: Tab then does nothing there, in its text fields neither, so it never
strands the focus on a button. The web view itself walks buttons whatever the Mac's "Keyboard
navigation" setting says (tried 2026-11-10). Enter and Space mean the selected row or bar, except
on a button or link Tab moved the focus to, which they press (`useHotkeys`, `data-focus` in
`src/main.tsx`); focus from a click, a script or the window coming back does not count. Dialogs and menus keep their own keys.
A control that should be reachable with the setting off gets a shortcut or a palette entry.

A key is a letter of its entry's English label, in both languages: N for "Next workday", W for
"Next week", K for "Keep plan for …". Weekdays take their number (Monday 1 to Friday 5). Menus
that offer the same choice use the same key for it, as Plan (P) and Follow-up (F) do through
`dayChoices`.

Taken today: ↑/↓ (J/K are deliberately unused), ←/→, 1–5, T, D, O, F, X, U, R, P, W, G, ⌃A, ⌃U, ⌃R, C, Space, Enter, Escape, ⌘Z, ⌘Y, ⌘R, ⇧⌘R, ⌘T, ⌘G,
⌘K, ⌘F, ⌘,, ?. A new shortcut MUST also appear in the help (`Help.tsx`, "Shortcuts") and, where it
acts on an item, in the right-click menu and the palette.

## Building blocks

| Component | For |
|---|---|
| `ContextMenu` | right-click menus and key-driven menus (snooze choices); submenus via `items` |
| `Toast` via `useStatusActions` | feedback with undo (`apply`, `announce`, `notify`) |
| `SortButton`, segmented controls (`.segmented`) | header switches |
| `Resizer`, `useColumnWidths` | draggable column widths remembered locally |
| `ErrorBoundary` | the crash page around the app |
| `Avatar` | GitHub avatars; identicons become gradient orbs |
