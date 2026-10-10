# Tooling package navigation

This package owns the `muxui` CLI grammar, capability policy, output renderers,
and generated parser/help/completion/manifest/type projections. Query semantics,
ranking, provenance, and response grammar remain owned by `@muxui/catalog`
and `@muxui/schema`.

Change `command-registry.json` before regenerating command projections. Run
`pnpm --filter @muxui/tooling check`, then `pnpm check` and
`pnpm generate:check`. Never patch `generated/command-surface.mjs` or
`generated/response-types.d.ts` directly.

The dense goldens in `test/goldens/` pin the catalog digest, so any catalog edit
changes them. Refresh them with
`MUXUI_UPDATE_GOLDENS=1 pnpm --filter @muxui/tooling test` and review the diff.
An editorial guide edit whose returned data stays the same changes digests only;
any other catalog edit can change the golden content, which the update mode
rewrites and the reviewer should read.
