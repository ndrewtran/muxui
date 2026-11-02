# React package navigation

`src/` owns the standalone React lifecycle, host-language refinements, and
Mux UI-owned CSS implementation. It does not import external design-system
packages at runtime or build time. Each admitted component owns
its Mux UI selectors, metadata, and token/style behavior. `test/` proves
SSR/hydration, effect cleanup, typed host ergonomics, CSS conformance, and
applicable binding behavior. No
component-support claim is permitted before the owning R1 tranche evidence and
release boundary.

Every component change must retain its Mux UI-owned selectors, metadata,
SSR/hydration behavior, accessibility, CSS, lifecycle, and release checks.
Keep unsupported capabilities explicit and covered by the current contract
tests.

Substantial third-party implementation portions must retain the applicable
license/notice disposition in the exact package and release artifacts.

`pnpm check --component <family-or-slug>` runs the React and selected
Storybook family checks; the task runner expands shared date selectors
together. `pnpm check --package @muxui/react` also accepts the `react` package
alias. `pnpm --filter @muxui/react check` is the complete package-local check
when that is the required proof. Common scopes and proof rules are in the root
[`AGENTS.md`](../../AGENTS.md) Verification section.

## Writing tests

CI runs a test file in one group beside others, so a slow file costs every pull
request that plans that group. Write each file to the rules below; each one
removes a habit that made files slow.

- Open a browser page (`test/browser/*.test.mjs`) with
  `page.goto(url, { waitUntil: 'load' })`, wait for the ready element, then
  `await awaitFontsAndFrames(page)` from `test/browser/harness.mjs`; its JSDoc
  says why. `load` already covers the module graph, so `networkidle` only
  added a fixed 500 ms per open, and the planner fails with
  `MUXUI_CI_IMPACT_BROWSER_TEST_NETWORKIDLE` when a `networkidle` string or
  template literal appears in code; comments are ignored (the allowlist is for a
  proof that needs the quiet window, such as a resource-entry check).
- Give each new or renamed `test/browser/*.test.mjs` a measured entry in
  `tooling/audits/repository-policy/browser-test-costs.json`, in whole seconds
  from one engine (recipe: the shards paragraph under Pull request CI routing in
  `tooling/audits/repository-policy/README.md`), and re-measure when a test's
  shape changes a lot. The planner packs browser shards by these costs so no
  shard is the long pole, and fails with `MUXUI_CI_IMPACT_BROWSER_TEST_COST_DRIFT`
  for a file without an entry or an entry for a file that is gone.
- Compile TypeScript proofs (tests that run `tsc`, the slowest unit tests) as
  a batch: put the cases of one project in one compile per compiler, not one
  `tsc` per case. `test/generic-types-mutations.test.mjs` does this, giving each
  mutated declaration copy a directory in one program and compiling it once
  under TypeScript 6 and once under 7. Add a new compiler-proof file to
  `check:types` in `package.json` and to the
  exclusion list in `check:rest`, so it runs beside the other slow files;
  `test/check-scripts.test.mjs` fails when a file runs twice or not at all.
- Build a shared fixture once per file. The package check already runs
  `generate --check` first, so a test does not run `generate` again, and a test
  that packs does so once with `--config.ignore-scripts=true`, as
  `test/catalog-examples-types.test.mjs` does (prepack regenerated `generated/`
  for 17 s).
