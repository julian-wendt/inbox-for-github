---
name: query-cost
description: Measure the GraphQL point cost of a new or changed GitHub query in Inbox for GitHub before shipping it. Use whenever a query in src/github/ gains fields or a new request is added.
---

# Measure a query's cost

The app must stay frugal with GitHub's 5000 points per hour (`docs/reference/github-api.md`).

1. Copy the query with real variables into a `gh api graphql` call and add
   `rateLimit(dryRun: true) { cost remaining }` next to the root field. `dryRun` does not run the
   query and costs nothing:

   ```sh
   gh api graphql -f query='query { rateLimit(dryRun: true) { cost remaining } search(query: "involves:@me org:octo-org", type: ISSUE, first: 50) { issueCount } }'
   ```

2. Compare with the table in `docs/reference/github-api.md`. Prefer adding fields to an existing
   request over a new one; for a whole-cache refresh, multiply by the pages it runs.
3. Update that table with the new number and today's date in the same commit, and say the cost in
   the handover.
