# Tooling package navigation

This package owns the `muxui` CLI grammar, capability policy, output renderers,
and generated parser/help/completion/manifest/type projections. Query semantics,
ranking, provenance, and response grammar remain owned by `@muxui/catalog`
and `@muxui/schema`.

Maintainer authoring (scaffolds, diagnostics, semantic diff, change intent)
is the workspace-only `@muxui/tooling/authoring` entry (`src/authoring.mjs`).
`publishConfig.exports` lists the only entries a packed manifest exposes
(Decision 0032 item 5); `test/public-packs.test.mjs` checks the tarball.

Change `command-registry.json` before regenerating command projections. Run
`pnpm --filter @muxui/tooling check`, then `pnpm check` and
`pnpm generate:check`. Never patch `generated/command-surface.mjs` or
`generated/response-types.d.ts` directly.

The dense goldens in `test/goldens/` hold rendered content, not digests: the
test replaces each `sha256:` digest and each `nextCursor` value with a
placeholder before comparing or writing, so a catalog edit changes a golden only
when the content it renders changes. When one does, refresh them with
`MUXUI_UPDATE_GOLDENS=1 pnpm --filter @muxui/tooling test` and review the diff;
it is content only.

## Writing tests

Reuse the memoized fixtures instead of compiling the catalog or packing the CLI
again per test: `compileFixtureBundle` in `test/pattern-fixture.mjs`, the shared
baseline in `test/authoring.test.mjs`, the `once` runs in
`test/packed-cli.test.mjs`, and `test/support/renderer-project.mjs` for the
local-resolver and pattern-cli tests. Share a fixture from those helpers, or
memoize your own the same way. Repeated compiles were most of this package's CI
time, and the `checks-tooling` group is the floor of a tooling-only pull
request.
