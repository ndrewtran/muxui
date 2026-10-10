# Figma component export navigation

Decision 0020 amendment 01 owns this package's scope. It owns only anatomy
mappings and transport for the Figma component export; component behavior and
CSS stay in `@muxui/react`, token facts in `catalog/tokens/` and
`@muxui/tokens`, and variant axes in the catalog records.

- `src/anatomy/`: one record per exported family. Add a family when it meets
  the eligibility criteria in Decision 0020 amendment 01, after its dark
  overrides are tokens.
- `src/css.mjs` and `src/measure.mjs`: winning declarations per mode.
- `src/audit.mjs`, `src/spec.mjs`: mode consistency, spec, and coverage.
- `src/applier.mjs`: embedded verbatim in batch scripts; keep it
  self-contained with conservative syntax.

`pnpm check --package @muxui/figma` runs the focused tests; the
Chrome measurement test runs when `MUXUI_CHROME_EXECUTABLE` is set. The CLI
(`figma:components report | plan | batch <n>`) needs generated React output
and Chrome, and never writes to Figma.
