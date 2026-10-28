---
name: file-issue
description: File a GitHub issue in julian-wendt/inbox-for-github for deferred work, a bug or a feature idea. Use when work is postponed or the user asks to open an issue.
---

# File an issue

1. **Search first:** `gh issue list -R julian-wendt/inbox-for-github --state all --search "<words>"`.
   Comment on an existing issue instead of filing a duplicate; group related small items.
2. **Title:** English, with a prefix for new issues: `[Bug]`, `[Feature]` or `[Task]`. Existing
   issues keep their titles.
3. **Body, in English:** Goal or Problem, what exists today (with file and function names),
   the proposal, and "To decide" for open questions. Name measured costs or facts with their date.
4. `gh issue create -R julian-wendt/inbox-for-github --title "…" --body-file <file>`, then give the
   user the link.
5. When closing an issue, comment what was done with the commit hashes, and what is left.
