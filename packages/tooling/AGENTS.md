# Tooling package navigation

This package owns the `muxui` CLI grammar, capability policy, output renderers,
and generated parser/help/completion/manifest/type projections. Query semantics,
ranking, provenance, and response grammar remain owned by `@muxui/catalog`
and `@muxui/schema`.

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
