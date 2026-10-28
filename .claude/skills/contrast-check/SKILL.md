---
name: contrast-check
description: Check WCAG AA contrast of colors in Inbox for GitHub in both themes. Use when adding or changing a color token, a tinted surface, a text color or a focus or selection style.
---

# Check contrast

Rules (`docs/conventions/ui.md`): 4.5:1 for text, 3:1 for icons and the visual cue of a control's
state, in light and dark. Decorative lines and tracks are exempt.

1. Read the hex values from `src/ui/styles/tokens.css` for both themes (light `:root`, dark in the
   `prefers-color-scheme` block).
2. Composite semi-transparent colors over the surface they sit on, then compute:

   ```python
   def L(h):
       c = [int(h[i:i+2], 16) / 255 for i in (1, 3, 5)]
       c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
       return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
   def ratio(a, b):
       hi, lo = sorted((L(a), L(b)), reverse=True)
       return (hi + 0.05) / (lo + 0.05)
   print(round(ratio("#646973", "#f9fafb"), 2))
   ```

3. Report the ratios for both themes in the handover. If a requested look fails, say so with the
   numbers and offer the closest variant that passes.
