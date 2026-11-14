# @muxui/figma

Private Figma component export. It owns only anatomy mappings and transport;
behaviour and CSS stay in `@muxui/react`, tokens in `catalog/tokens/`, variant
axes in catalog records. Figma content is a projection, never canonical.

- A family is eligible when it has an anatomy the mappings support, finite
  variants, mode-aware tokens (every painted part resolves through one token in
  every mode; move dark overrides into tokens first), and passing audits (mode
  consistency, binding coverage with documented literal exceptions only).
  Collections, composites, overlays, temporal and editor controls wait until the
  mappings support them. Add one record per family in `src/anatomy/`.
- `src/applier.mjs` is embedded verbatim in batch scripts: keep it
  self-contained with conservative syntax. The applier only touches its own
  tagged Components page and never deletes beyond the glyphs it replaces.
- `pnpm check --package @muxui/figma` runs the tests; the Chrome measurement
  test needs `MUXUI_CHROME_EXECUTABLE`. The CLI (`figma:components report | plan
  | batch <n>`) never writes to Figma. Writing any Figma file needs Andrew's yes
  for that file.
