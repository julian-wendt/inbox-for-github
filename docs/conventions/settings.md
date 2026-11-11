# Settings

Settings are one object, `Settings` in `src/store.ts`, stored as one row per key in the
`settings` table. `DEFAULT_SETTINGS` gives every key its default; keys missing in the database
take it, so a new key needs no migration.

## Adding a setting

1. **Type and default:** add the field to `Settings` with a doc comment saying what it does, and
   its default to `DEFAULT_SETTINGS`.
2. **Texts:** label and hint keys (`settings.<name>`, `settings.<name>Hint`) in `en.ts` and `de.ts`.
3. **UI:** a `Field` in `SettingsDialog.tsx` under the fitting section (`general`, `notify`, `look`,
   `rules`, `boards`, …): label above, control, hint below. A `Toggle` in a `toggle-card` for
   booleans, also a lone one; `Choice` (a segmented control) for a few choices. Switches that belong together share one `toggle-card`; switches that only refine a
   main switch go into a `toggle-card-part` under it, disabled while it is off. Every setting
   gets a hint that says precisely what it does.
4. **Mark it new:** add the key with its section to `NEW_SETTINGS` (`src/ui/newSettings.ts`) and
   pass `isNew` to its `Field` or `Toggle`. Drop entries a release or two later.
5. **Use it:** read it from `inbox.settings` in `App.tsx`, or in `useInbox` when it affects fetching.
6. **Restart** the dev window; the running state has no value for the new key.

## Rules

- Removing or renaming a key is a breaking change: ask first. Once approved, a key nothing reads
  leaves `Settings` and `DEFAULT_SETTINGS` and is deleted from the database by name in
  `dropLeftovers` (`src/store.ts`); a value no longer offered is rewritten there to the value it
  acted as. No key stays stored and unread.
- A setting that affects fetching SHOULD be cheap to change: narrowing it filters the cache,
  only widening it fetches (see coverage in [`architecture.md`](../reference/architecture.md#refreshes)).
- Per-device conveniences that may get lost (collapsed groups, sort direction, sizes) belong in
  `localStorage`, not in settings.
