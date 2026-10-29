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
| `--border`, `--border-strong` | quiet and visible lines; chips use `--border-strong` |
| `--hover`, `--selected` | row and button backgrounds |
| `--focus-fill` | keyboard focus fill, 3:1 against the panel |
| `--segment-fill` | the active part of a date or time field; softer by choice, below 3:1 |
| `--yellow`, `--green`, `--blue`, `--red`, `--purple` | the only tone of each hue; AA as text in both themes, except light yellow (3:1, icons and dots only) |
| `--st-*`, `--new`, `--mention` | status roles, aliases of a hue above; never a value of their own |
| `--green-fill` | filled green under white text (comment button, switches); the light green in both themes |
| `--orange`, `--pink` | dots and decoration only (GitHub Projects options, the dev stripe) |
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
`src/main.tsx`). No outlines or rings. Text fields show focus by their border; `.btn.success`
darkens instead.

## Shapes

- Chips, pills and labels are fully rounded (`border-radius: 999px`).
- A highlight inside a rounded container matches the container's inner radius
  (`calc(var(--radius-m) - 1px)` inside a 1px border).
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
  asked for the review, pushed or assigned them (`rowContext`). Only when GitHub does not say,
  e.g. a commit without a linked user, does the line go without a name.

## Keyboard

Shortcuts are registered in `App.tsx` with `useHotkeys` (`src/ui/useHotkeys.ts`). Keys are
lowercased; `mod+` is ⌘, `shift+` is added with ⌘ and for letters. Single-key shortcuts do not
fire while typing in a field.

A key is a letter of its entry's English label, in both languages: N for "Next workday", W for
"Next week", K for "Keep plan for …". Weekdays take their number (Monday 1 to Friday 5). Menus
that offer the same choice use the same key for it, as Plan (P) and Follow-up (F) do through
`dayChoices`.

Taken today: ↑/↓ (with ⇧ to mark; J/K are deliberately unused), ←/→, 1–5, T, D, O, F, X, U, R, P, W, ⌃A, ⌃U, ⌃O, ⌃R, C, Space, Enter, Escape, ⌘Z, ⌘Y, ⌘R, ⌘T, ⌘G,
⌘K, ⌘F, ⌘,, ?. A new shortcut MUST also appear in the help (`Help.tsx`, "Shortcuts") and, where it
acts on an item, in the right-click menu and the palette.

## Building blocks

| Component | For |
|---|---|
| `ContextMenu` | right-click menus and key-driven menus (snooze choices); submenus via `items` |
| `Toast` via `useStatusActions` | feedback with undo (`apply`, `announce`, `notify`) |
| `SortButton`, segmented controls (`.segmented`) | header switches |
| `Resizer`, `useStoredSize` | draggable sizes remembered locally |
| `ErrorBoundary` | the crash page around the app |
| `Avatar` | GitHub avatars; identicons become gradient orbs |
