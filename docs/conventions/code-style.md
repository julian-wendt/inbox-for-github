# Code style

TypeScript and React as ESLint (`eslint.config.js`) and the TypeScript compiler enforce them; this
page covers what they cannot.

## Comments and documentation

Two different things with opposite budgets.

**The documentation header is generous.** The JSDoc block above an exported function, hook or
component says what it does, what each parameter means, what comes back, what it assumes, and
shows a real call in `@example`. Write it for someone who will never read the body.

**Comments inside the body are rare and short.** One line is the norm, two the ceiling. A comment
earns its place only where the code cannot speak for itself: an invariant, a non-obvious
constraint, a unit or encoding not visible at the call site, the reason behind a workaround.

- Comment the why, not the what. Never restate the line below.
- No narrating the current change, no pointers to callers, issues or PRs, no commented-out code.
- When the reason does not fit in two lines, it belongs in the doc header, or in
  [`docs/reference/`](../reference/) with the comment citing it.
- A long block may carry a three- or four-word signpost (`// Restart loop`).

## Naming and structure

- Pure logic lives in plain modules with a test next to it (`src/classify.ts`,
  `src/ui/timeGroups.ts`); components stay thin.
- One rule, one function: when the list, the row label and the grouping need the same value,
  they call one function (e.g. `sortTime`), so they cannot drift apart.
- Hooks are named `use…` and live in `src/ui/`; components in `src/ui/parts/`.

## TypeScript

- No `any`; `as` only where a value's type is known from outside (parsed JSON, DOM).
- Model types live in `src/model.ts`; GitHub's raw shapes stay in `src/github/`.

## React

- State that must outlive a render but not cause one goes into a ref, updated in an effect, not
  during render (the React Compiler lint rules reject it otherwise).
- `Date.now()` and other impure calls do not run during render; capture them in state or an
  effect.
- A new hook in a mounted component needs a dev restart (see
  [`local-development.md`](../reference/local-development.md)).

## Formatting

There is no formatter in the repo. Match the surrounding code; do not run Prettier or similar
over existing files, it rewrites them wholesale.
