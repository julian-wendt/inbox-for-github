import { GitHubSimulator, type Ref } from "../github/simulate/world";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** The viewer of the demo; every name in it is made up. */
export const DEMO_VIEWER = "juniper";

const ORGS = ["lumen-labs", "harbor-works", DEMO_VIEWER];
const REPO = {
  atlas: "lumen-labs/atlas",
  relay: "lumen-labs/relay",
  docs: "lumen-labs/docs",
  ledger: "harbor-works/ledger",
  tideline: "harbor-works/tideline",
  notes: `${DEMO_VIEWER}/notes-sync`,
};
const BUG = { name: "bug", color: "d73a4a" };
const CHORE = { name: "chore", color: "6e7781" };
const FEATURE = { name: "feature", color: "1f883d" };

/** The demo's items by what they show; the seed (`demoSeed`) files some of them. */
export type DemoRefs = Record<
  | "retries" | "csvExport" | "dateFns" | "installNote" | "tooltip" | "ownKeys" | "rounding"
  | "leak" | "settings" | "savedFilters" | "statement" | "contributing" | "rateCache" | "signature"
  | "virtualRows" | "focusTrap" | "retryDocs" | "syncBackup" | "buildTooling"
  | "sidebarTokens" | "xmlPayloads" | "glossary" | "negativeBalances" | "frameBudget" | "rateHeaders",
  Ref
>;

/**
 * A fictional GitHub for the demo mode and for screenshots: three owners, six repositories and
 * about thirty items that cover what the app shows (mentions, review requests, assignments of
 * every type, boards and sprints, drafts and conflicts, bot comments, merged and closed items,
 * long timelines with reviews). Times are relative to now, so "2 hours ago" stays true whenever
 * the demo starts. Nothing here is a real person, company or repository.
 *
 * @returns The world, with the clock following the wall clock, and the items by name.
 *
 * @example
 *   const { world, refs } = buildDemoWorld();
 *   installSimulator(world);
 */
export function buildDemoWorld(): { world: GitHubSimulator; refs: DemoRefs } {
  const world = new GitHubSimulator({ viewer: DEMO_VIEWER, name: "Juniper Vale", orgs: ORGS, live: true });
  world.teams = ["platform"];
  const me = DEMO_VIEWER;
  const roadmap = (ref: Ref, status: string, sprint: string | null = "Sprint 24", fields: { name: string; value: string }[] = []) => world.setBoard(ref, { project: "Roadmap", status, sprint, fields });

  // Mentions and reviews waiting for an answer
  const retries = world.issue({ repo: REPO.relay, title: "Webhook retries flood the queue after a 503", author: "tobias-k", ago: 3 * DAY, labels: [BUG], type: "Bug", body: "After a 503 from the receiver, every retry fires at once instead of backing off.\n\n- [x] reproduced on staging\n- [ ] add a regression test" });
  roadmap(retries, "In progress");
  world.at(2 * HOUR, () => world.comment(retries, "tobias-k", "@juniper you touched the retry logic last month. Does the backoff cap still apply here?\n\n```ts\nconst delay = Math.min(base * 2 ** attempt, cap);\n```"));

  const csvExport = world.pullRequest({ repo: REPO.atlas, title: "Add CSV export to the reports table", author: "priya-n", ago: 2 * DAY, additions: 184, deletions: 27, body: "Adds an **Export CSV** button to the reports table.\n\n## What changes\n\n- [x] respects the active filters and the sort order\n- [x] column headers use the labels shown on screen, not the field names\n- [ ] large exports stream instead of buffering\n\n## How it works\n\nThe table collects its visible rows, `formatCell` turns each value into text, and the browser saves the result as a file. Dates keep the ISO form so a spreadsheet sorts them correctly.\n\n```ts\nconst csv = rows.map((row) => columns.map((c) => formatCell(row[c.key])).join(\",\")).join(\"\\n\");\n```\n\n## Not in this PR\n\nExcel needs a byte order mark to read umlauts; that follows once we know how many people open the file there.\n\n## Testing\n\nRun the reports table with 10, 1,000 and 50,000 rows and compare the downloaded file with the screen." });
  world.at(47 * HOUR, () => world.commit(csvExport));
  world.at(26 * HOUR, () => world.requestReview(csvExport, "priya-n", me));
  world.at(25 * HOUR, () => world.comment(csvExport, "ci-sentinel[bot]", "✅ All 212 checks passed."));
  world.at(20 * HOUR, () => {
    world.review(csvExport, "marcus-o", "COMMENTED", { body: "Looks good overall, a few small things.", inline: [{ path: "src/reports/export.ts", line: 42, body: "Could this reuse `formatCell` instead of a second formatter?" }, { path: "src/reports/export.ts", line: 77, body: "Nit: name this `rows`, not `data`." }, { path: "src/reports/Table.tsx", line: 18, body: "The button needs a label for screen readers." }] });
    world.resolveThread(csvExport, 1, "priya-n");
  });

  const dateFns = world.pullRequest({ repo: REPO.atlas, title: "Replace moment with date-fns", author: "sam-r", ago: DAY, additions: 96, deletions: 148 });
  world.at(5 * HOUR, () => world.requestReview(dateFns, "sam-r", "team:platform"));
  world.at(4 * HOUR, () => world.forcePush(dateFns, "sam-r"));
  world.at(3 * HOUR, () => world.forcePush(dateFns, "sam-r"));

  const installNote = world.issue({ repo: REPO.docs, title: "Quick start misses the new install flag", author: "ines-d", ago: 6 * DAY });
  world.at(3 * DAY, () => world.comment(installNote, me, "@juniper check the install steps again once 2.0 ships."));

  const tooltip = world.issue({ repo: REPO.atlas, title: "Tooltip flickers on hover in Safari", author: "lena-f", ago: 9 * DAY, labels: [BUG] });
  world.at(8 * DAY + HOUR, () => world.comment(tooltip, "lena-f", "@juniper can you reproduce this in Safari 18?"));
  world.at(8 * DAY, () => world.comment(tooltip, me, "I can reproduce this. Will look after the release."));

  const ownKeys = world.issue({ repo: REPO.relay, title: "Rotate the staging API keys", author: me, ago: 5 * DAY, labels: [CHORE] });

  const rounding = world.issue({ repo: REPO.ledger, title: "Fix rounding in the monthly statement", author: "ines-d", ago: 8 * DAY, type: "Bug", assignees: [me] });
  world.at(8 * DAY - MIN, () => world.assign(rounding, "ines-d", me));
  roadmap(rounding, "In review", "Sprint 24");
  world.at(40 * MIN, () => world.comment(rounding, "ines-d", "Verified the fix on the staging data, the totals match now."));

  // Assigned to me, by type and board status
  const leak = world.issue({ repo: REPO.relay, title: "Memory leak in the worker pool", author: "tobias-k", ago: 4 * DAY, type: "Bug", labels: [BUG] });
  world.at(3 * DAY, () => world.assign(leak, "tobias-k", me));
  roadmap(leak, "Backlog");

  const settings = world.issue({ repo: REPO.atlas, title: "Migrate the settings screen to the new form components", author: me, ago: 6 * DAY, type: "Task", assignees: [me] });
  roadmap(settings, "In progress", "Sprint 24", [{ name: "Component", value: "Settings" }]);

  const savedFilters = world.issue({ repo: REPO.atlas, title: "Saved report filters", author: "priya-n", ago: 7 * DAY, type: "Feature", labels: [FEATURE] });
  world.at(6 * DAY, () => world.assign(savedFilters, "priya-n", me));
  roadmap(savedFilters, "In review");
  const filtersPr = world.pullRequest({ repo: REPO.atlas, title: "Saved report filters", author: me, ago: 2 * DAY, draft: true, additions: 310, deletions: 12 });
  world.at(DAY, () => world.linkPullRequest(savedFilters, filtersPr, me));

  const statement = world.issue({ repo: REPO.ledger, title: "Statement export for audits", author: "ines-d", ago: 12 * DAY, type: "Story", assignees: [me] });
  roadmap(statement, "Blocked", "Sprint 24", [{ name: "Component", value: "Reports" }]);

  const contributing = world.issue({ repo: REPO.atlas, title: "Update the contributing guide", author: "lena-f", ago: 14 * DAY, assignees: [me], labels: [CHORE] });
  roadmap(contributing, "Done", "Sprint 23");

  const rateCache = world.pullRequest({ repo: REPO.tideline, title: "Cache exchange rates for 15 minutes", author: "lena-f", ago: DAY, additions: 64, deletions: 9 });
  world.at(DAY - MIN, () => world.assign(rateCache, "lena-f", me));
  world.at(20 * HOUR, () => world.comment(rateCache, "ci-sentinel[bot]", "⚠️ 1 of 48 checks failed: `lint`."));

  const signature = world.issue({ repo: REPO.relay, title: "Document the webhook signature check", author: me, ago: 10 * DAY, type: "Task", assignees: [me] });

  // Created by me
  const virtualRows = world.pullRequest({ repo: REPO.atlas, title: "WIP: virtualized table rows", author: me, ago: 3 * DAY, draft: true, conflicts: true, additions: 420, deletions: 88 });
  for (const ago of [70, 52, 30]) world.at(ago * HOUR, () => world.commit(virtualRows));

  const focusTrap = world.pullRequest({ repo: REPO.atlas, title: "Fix tooltip focus trap", author: me, ago: 4 * DAY, additions: 41, deletions: 15 });
  world.at(3 * DAY, () => {
    world.requestReview(focusTrap, me, "priya-n");
    world.requestReview(focusTrap, me, "marcus-o");
  });
  world.at(DAY, () => world.review(focusTrap, "marcus-o", "CHANGES_REQUESTED", { inline: [{ path: "src/ui/Tooltip.tsx", line: 31, body: "Restore focus to the trigger when the tooltip closes." }, { path: "src/ui/Tooltip.tsx", line: 58, body: "This needs a test for Escape." }] }));
  world.at(10 * HOUR, () => world.forcePush(focusTrap, me));
  world.at(6 * HOUR, () => world.review(focusTrap, "priya-n", "APPROVED"));
  world.at(5 * HOUR, () => world.dismissReview(focusTrap, "priya-n", "marcus-o"));

  const retryDocs = world.issue({ repo: REPO.docs, title: "Document the retry configuration", author: me, ago: 2 * DAY });
  const syncBackup = world.issue({ repo: REPO.notes, title: "Back up the sync state before upgrading", author: me, ago: 10 * DAY, assignees: [me], labels: [CHORE] });

  const buildTooling = world.pullRequest({ repo: REPO.atlas, title: "Bump the build tooling", author: me, ago: 3 * DAY, additions: 12, deletions: 12 });
  world.at(2 * DAY + HOUR, () => world.enableAutoMerge(buildTooling, me));
  world.at(2 * DAY, () => {
    world.comment(buildTooling, "priya-n", "@juniper thanks for the quick turnaround!");
    world.merge(buildTooling, "priya-n");
  });

  // Done: answered or closed
  const sidebarTokens = world.pullRequest({ repo: REPO.atlas, title: "Use semantic tokens in the sidebar", author: "lena-f", ago: 4 * DAY });
  world.at(4 * DAY - MIN, () => world.requestReview(sidebarTokens, "lena-f", me));
  world.at(DAY, () => world.merge(sidebarTokens, "lena-f"));

  const xmlPayloads = world.issue({ repo: REPO.relay, title: "Support XML payloads", author: "tobias-k", ago: 20 * DAY });
  world.at(5 * DAY, () => world.comment(xmlPayloads, "tobias-k", "@juniper any objections to dropping this?"));
  world.at(5 * DAY - HOUR, () => world.comment(xmlPayloads, me, "None from me."));
  world.at(3 * DAY, () => world.close(xmlPayloads, "tobias-k", "NOT_PLANNED"));

  const glossary = world.issue({ repo: REPO.docs, title: "Add a glossary", author: "ines-d", ago: 6 * DAY });
  world.at(2 * DAY, () => world.comment(glossary, "ines-d", "@juniper could you draft the first ten terms?"));
  world.at(DAY, () => world.comment(glossary, me, "Draft is in the PR, take a look."));

  // Follow-up: waiting for their date (the seed sets it)
  const negativeBalances = world.issue({ repo: REPO.tideline, title: "Rounding of negative balances", author: "ines-d", ago: 5 * DAY });
  world.at(3 * DAY, () => world.comment(negativeBalances, "ines-d", "@juniper heads-up, this touches your module."));
  const frameBudget = world.issue({ repo: REPO.atlas, title: "Track the animation frame budget", author: "sam-r", ago: 7 * DAY });
  world.at(4 * DAY, () => world.comment(frameBudget, "sam-r", "@juniper no rush, but worth a look when you have time."));
  const rateHeaders = world.issue({ repo: REPO.relay, title: "Clarify the rate-limit headers", author: "tobias-k", ago: 6 * DAY });
  world.at(2 * DAY, () => world.comment(rateHeaders, "tobias-k", "@juniper can you confirm the header names before we document them?"));

  return {
    world,
    refs: { retries, csvExport, dateFns, installNote, tooltip, ownKeys, rounding, leak, settings, savedFilters, statement, contributing, rateCache, signature, virtualRows, focusTrap, retryDocs, syncBackup, buildTooling, sidebarTokens, xmlPayloads, glossary, negativeBalances, frameBudget, rateHeaders },
  };
}
