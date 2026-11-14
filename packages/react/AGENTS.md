# @muxui/react

- `src/` TypeScript owns each component's props, types, defaults and events. The
  catalog `api` block is extracted from it; never author one.
- Each component owns its Mux UI selectors, `data-muxui-*` state attributes,
  tokens and CSS. No React Aria type, value or attribute reaches the public API or
  a stylesheet.
- Pin shipped dependencies exactly with matching lockfile integrity. Keep the
  licence and notice of every distributed dependency and asset.
- Import a heavy entry (editor, parser, highlighter, motion) only from the module
  that owns it, and import Lucide icons per module, never the barrel.
- `pnpm check --component <family-or-slug>` runs React plus that family's
  Storybook checks. `pnpm --filter @muxui/react check` is the full package check.

## Writing tests

- Browser tests: `page.goto(url, { waitUntil: 'load' })`, wait for the ready
  element, then `await awaitFontsAndFrames(page)` from
  `test/browser/harness.mjs`. Never wait on `networkidle`.
- TypeScript proofs: compile one project's cases in one `tsc` run per compiler,
  as `test/generic-types-mutations.test.mjs` does. Add a new compiler-proof file
  to `check:types` and to the `check:rest` exclusions in `package.json`;
  `test/check-scripts.test.mjs` fails when a file runs twice or never.
- Build a shared fixture once per file. The package check already runs
  `generate --check`, so tests never regenerate. Pack once, with
  `--config.ignore-scripts=true`, as `test/catalog-examples-types.test.mjs` does.
