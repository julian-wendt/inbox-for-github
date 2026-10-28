---
name: app-icon
description: Regenerate the Inbox for GitHub app icon from src-tauri/icons/icon.svg. Use after the icon SVG changes.
---

# Regenerate the app icon

See `docs/releasing.md`. In short:

1. Render `src-tauri/icons/icon.svg` to a 1024×1024 PNG with a transparent background using
   headless Edge or Chrome on an HTML page with a transparent body. Not `qlmanage`: it adds white.
2. `npx tauri icon <png>` regenerates every size in `src-tauri/icons/`.
3. Delete the generated `src-tauri/icons/android/` and `src-tauri/icons/ios/` folders.
4. Look at the result (read `icon.png`) before committing; rebuild the app to see it in the Dock.
