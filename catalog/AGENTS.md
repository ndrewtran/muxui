# Catalog records

- Canonical records only. Compiled bundles, indexes and pages live in packages.
- `pnpm generate` keeps `packages/catalog/catalog-sources.json` in sync with the
  files here: add or remove records on disk, never edit that list.
- A component's optional `category` is its docs and Storybook group
  (`"ai-agent"` is AI Agent; none is Components).
- `patterns/categories.json` declares block categories, groups and labels in
  display order. A block's `category` must be listed there; the compiler
  derives its group.
- `patterns/<slug>/` is one Block: `artifact.json` plus, per variant,
  `examples/react/<variant>.example.json` and its `.tsx`. Create one with
  `scaffoldPattern`.
- Variant sources (`packages/catalog/src/pattern-imports.mjs`,
  `pattern-content.mjs`): imports only in the leading header, from `react`,
  `react/jsx-runtime`, `@muxui/react`, `@muxui/react/markdown` or
  `@muxui/react/themes` (static named imports; declare each named component in
  `pattern.participants`). No remote reference, no literal colour. Local asset
  paths point only inside the pattern, with an `<asset>.license.json` beside
  each asset.
- An unsupported binding states a plain reason and claims nothing.
