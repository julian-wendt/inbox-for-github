# Testing

## Unit tests

Vitest, run with `npm test`. Tests sit next to the code as `*.test.ts` (`*.test.tsx` for the few
that render). There is no browser or DOM environment; tests cover pure logic.

**What earns a test:** every rule that decides where an item goes or what a user sees, written as
a pure function first:

- classification and reopening (`classify.test.ts`), review answers, mentions
- grouping, sorting and time (`timeGroups`, `sortTime`, `snoozeUntil`, `assignments`)
- parsing GitHub's responses into the model (`fetch.test.ts`), deltas and cache coverage
  (`delta.test.ts`)
- formatting helpers (`labels`, `markdownFormat`, `itemLink`), i18n

**What does not:** layout, styling, animations, and thin components that only pass props. Check
those by hand (below).

A test names the behavior in a sentence (`it("comes back once the date has passed, and not
before")`) and builds its input with small local helpers rather than large fixtures.

## Scenario tests against a simulated GitHub

`src/github/simulate/` holds a stand-in for GitHub, the way Azurite stands in for Azure Storage.
`GitHubSimulator` (`world.ts`) keeps users, issues, pull requests and everything that happens on
them in memory; `installSimulator` (`server.ts`) routes the global `fetch` to it, so the real
`graphql`, `fetchItems`, `fetchItem`, the write functions and `classify` run unchanged. Costs and
`x-ratelimit-*` headers follow [`github-api.md`](reference/github-api.md); a query the simulator
does not know fails loudly, so a new query needs a handler there.

`InboxSession` (`session.ts`) is the app without its window: refresh as full or delta, reload one
item, file items with `planStatus`, assign and leave, follow-ups. It calls the same functions the
app does and keeps statuses in maps instead of SQLite.

```ts
const sim = simulation();                                   // vitest.ts: fresh world and session per test
it("files an answered mention under Done", async () => {
  const issue = sim.world.issue();
  sim.world.comment(issue, "alice", "@octocat could you look?");
  await sim.app.refresh();
  await sim.app.comment(issue, "Looking now.");
  expect(sim.app.viewOf(issue)).toBe("done");
});
```

The scenario files mirror the sections of [`TESTING.md`](../TESTING.md): `inbox.test.ts`,
`assigned.test.ts`, `refresh.test.ts`, `reviews.test.ts`. The demo world (`src/demo/`) runs through the same session in `demo.test.ts`, so a change that moves a demo item shows up as a failing test. What stays manual there is what needs
the window: layout, keys, menus, the notification and Dock behavior, the real token and the real
API. Time is the world's clock (`world.advance`), never the wall clock.

The simulator reproduces known gaps on purpose (board moves and withdrawn review requests leave
`updatedAt` alone), so a test can show a delta missing them. When the real API turns out to
differ, fix the simulator and note the verified fact in `reference/github-api.md`.

## Checking against real data

The cached items in the local database are a realistic fixture. To see how the app classifies
them without a request, export `item_cache.items` and `item_status` read-only (see
[`local-development.md`](reference/local-development.md)) and run them through `classify` in a
throwaway test file; delete it afterwards.

## Manual checklist

[`TESTING.md`](../TESTING.md) in the root lists what to try in the running app before a release:
sidebar, API usage, boards, offline, commenting, close/reopen, settings, help. Add a line there
for each user-visible behavior a change introduces.
