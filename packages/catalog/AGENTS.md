# Catalog package navigation

This package owns the deterministic compiler, immutable generated bundle, and
transport-independent query kernel. Canonical product facts remain under
`catalog/`; response grammar remains owned by `@muxui/schema`.

Run `pnpm --filter @muxui/catalog check`, then the root `pnpm check` and
`pnpm generate:check`. Never patch any bundle or strict JSON projection under
`generated/` directly.

`catalog-sources.json` holds the compiler settings and lists every canonical
record under `catalog/`. `pnpm generate` keeps that list in sync with the
files on disk, so add or remove records on disk and regenerate instead of
editing the list.
