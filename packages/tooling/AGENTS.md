# @muxui/tooling

- Owns the `muxui` CLI grammar, renderers and resolver. Query semantics belong to
  `@muxui/catalog`; response grammar to `@muxui/schema`.
- `src/authoring.mjs` (`@muxui/tooling/authoring`) is workspace only.
  `publishConfig.exports` lists the packed entries; `test/public-packs.test.mjs`
  checks the tarball.
- Edit `command-registry.json`, then regenerate. Never patch
  `generated/command-surface.mjs` or `generated/response-types.d.ts`.
- Goldens in `test/goldens/` hold rendered content with digests and cursors
  replaced. When content changes, refresh with
  `MUXUI_UPDATE_GOLDENS=1 pnpm --filter @muxui/tooling test` and read the diff.

## Writing tests

- Reuse the memoized fixtures: `compileFixtureBundle` in
  `test/pattern-fixture.mjs`, `setup` in `test/authoring.test.mjs`, and the
  `once` runs in `test/packed-cli.test.mjs`. Memoize new expensive fixtures.
- `createRendererProject` (`test/support/renderer-project.mjs`) writes a fresh
  project and runs `pnpm install --offline` per call. Build one per test module
  and swap bindings with its `install(list)`.
