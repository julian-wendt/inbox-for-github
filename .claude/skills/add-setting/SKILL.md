---
name: add-setting
description: Add a new user setting to Inbox for GitHub end to end — type and default in store.ts, texts in both locales, a control in SettingsDialog, wiring in App or useInbox. Use when a feature needs a new option in Settings.
---

# Add a setting

Follow `docs/conventions/settings.md`; the steps in short:

1. **`src/store.ts`:** add the field to `Settings` with a one-line doc comment, and its default to
   `DEFAULT_SETTINGS`. Missing keys take the default on load, so no migration.
2. **Texts:** `settings.<name>` and `settings.<name>Hint` in `src/ui/locales/en.ts` and `de.ts`
   (see the `ui-text` skill).
3. **`src/ui/parts/SettingsDialog.tsx`:** add the control to the fitting section, copying a
   neighbor: a `toggle-row` with `className="switch"` for a boolean, `.segmented` for a few choices.
   Write through `change({ <name>: value })`.
4. **Use it** via `inbox.settings.<name>` in `App.tsx`, or in `useInbox` if it changes fetching. A
   fetch setting must narrow locally and only fetch when widened (`docs/reference/architecture.md`).
5. **Check:** `npm run typecheck && npm run lint && npm test`, then restart the dev window (the
   `restart-dev` skill); the running state lacks the new key.

Never rename or remove an existing key: that is a breaking change, ask first.
