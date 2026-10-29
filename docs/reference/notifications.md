# GitHub's notifications and what the app covers

What GitHub notifies about, which of it the app finds on its own, and which of GitHub's
notification settings can be turned off once the app runs. Read 2026-10-29 from GitHub's docs:
[notification reasons](https://docs.github.com/en/rest/activity/notifications),
[configuring notifications](https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github/setting-up-notifications/configuring-notifications)
and [search qualifiers](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests).

The app does not read GitHub's notifications. It searches issues and pull requests in the
watched owners (`fetchItems` in `src/github/fetch.ts`) with two qualifiers:

- `involves:@me`, which GitHub defines as `author` OR `assignee` OR `mentions` OR `commenter`
  for one user;
- `is:pr review-requested:@me`, which includes requests to a team the viewer is on (the
  "Direct requests only" setting can hide those per repo).

Open items always; closed ones within "Show closed and merged items"; at most "Items loaded at
most" per search.

## Reasons, mapped

| GitHub `reason` | Meaning | In the app |
|---|---|---|
| `assign` | assigned to the issue or PR | yes (`involves`, reason "assigned") |
| `author` | you opened the thread | yes (`involves`) |
| `comment` | you commented on the thread | yes (`involves`) |
| `mention` | you were @mentioned | yes (`involves`, reason "mentioned"), in issues and PRs only |
| `review_requested` | you or one of your teams were asked to review | yes (`review-requested`) |
| `state_change` | you closed, reopened or merged it | only if you are involved otherwise; your own action needs no notice |
| `team_mention` | a team you are on was @mentioned | **no**: `involves` names users only; GitHub's `team:` qualifier would find them |
| `manual` | you subscribed to the thread by hand | **no** |
| `subscribed` | you watch the repository | **no** |
| `ci_activity` | a workflow run you triggered finished | **no** (a PR's checks show on the item, but nothing notifies) |
| `security_alert` | a Dependabot alert in your repository | **no** |
| `approval_requested` | a deployment waits for your approval | **no** |
| `invitation`, `security_advisory_credit`, `member_feature_requested`, `agent_session_finished` | an invitation accepted, advisory credit, org feature requests, a Copilot agent session done | **no** |

Further gaps, whatever the reason:

- **Outside the watched owners:** a mention in another organization's repository is not
  searched.
- **Not an issue or pull request:** discussions, commit comments, releases and gists; the search
  type is `ISSUE`.
- **Old closed threads:** a new comment on a thread closed before the closed window is not seen.
- **Beyond the item limit:** each search stops at the limit (GitHub at 1000).
- **The app must run:** its notifications come from the running app on this Mac, not from GitHub.

## Which GitHub settings can go

On [github.com/settings/notifications](https://github.com/settings/notifications):

- **Participating, email:** can be turned off. Assignments, mentions, comments on your threads and
  review requests in the watched owners all reach the app. Keep it if you get mentions outside
  them or in discussions.
- **Participating, on GitHub (web inbox):** can stay on as a quiet fallback; nothing pushes it at
  you, and it holds the gaps above (team mentions, other owners, discussions).
- **Watching:** not covered. Leave it as it is if you rely on watched repositories; otherwise
  set repositories to "Participating and @mentions".
- **GitHub Actions workflow runs:** not covered; keep it (e.g. failed runs only).
- **Dependabot alerts:** not covered; keep it.
- **GitHub Mobile push** (direct mentions, assignments, review requests): covered while the app
  runs on the Mac; turn it off only if that is where you work.
- **Team mentions:** GitHub's docs do not say which of these settings delivers them (read
  2026-10-29). Turn Participating off on every channel only if team mentions do not matter.

The app writes nothing to these settings (see the write limits in `CONTRIBUTING.md`).

## Or sort the emails instead

Instead of turning participating email off, a mail rule can file away what the app covers and
leave the gaps in the inbox, with the emails kept as a searchable archive. From GitHub's
[email notification headers](https://docs.github.com/en/subscriptions-and-notifications/reference/email-notification-headers)
(read 2026-10-29):

- **Cc** holds the reason as `<reason>@noreply.github.com`. Every mail client can filter on it.
  The docs name no `X-GitHub-Reason` header; filter on Cc.
- **List-Id** names the repository and owner as `OWNER/REPOSITORY <REPOSITORY.OWNER.github.com>`,
  e.g. `octo-org/portal <portal.octo-org.github.com>`. "List-Id contains `.octo-org.github.com`"
  limits a rule to one of the watched owners.
- **From** is always `notifications@github.com`; `X-GitHub-Severity` carries a Dependabot
  alert's level.

| Cc reason | Meaning (GitHub's words, shortened) | Rule |
|---|---|---|
| `assign` | you were assigned | file away |
| `author` | you created the issue or PR | file away |
| `comment` | you commented on it | file away |
| `mention` | you were mentioned | file away |
| `review_requested` | you or one of your teams were asked to review | file away |
| `your_activity` | you opened, commented on or closed it yourself | file away |
| `state_change` | a thread you are subscribed to was closed or opened | file away unless you watch repositories |
| `push` | someone pushed to a PR you are subscribed to | file away unless you watch repositories |
| `team_mention` | a team you belong to was mentioned | keep |
| `subscribed` | activity in a repository you watch | keep |
| `manual` | a thread you subscribed to by hand | keep |
| `ci_activity` | a workflow run you triggered finished | keep |
| `security_alert` | a vulnerability alert | keep |

`state_change` and `push` also come for threads you only watch or subscribed to by hand, which the
app does not see; with no watched repositories they concern only threads you are involved in.
Combine every "file away" condition with the List-Id of a watched owner, so mentions elsewhere stay.
