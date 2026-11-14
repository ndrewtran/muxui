# React Storybook

- Private projection and visual and accessibility proof for `@muxui/react`.
  Stories read the canonical component contract; they never define an inventory.
- `pnpm check --component <family-or-slug>` runs that family's React and
  Storybook checks. `pnpm --filter @muxui/react-storybook check` is the full
  audit.
- Style-only component changes need that family's accessibility and browser
  proof in light and dark.
- A proof that visits Storybook pages joins the single fused visit in
  `test/storybook-a11y.test.mjs` through `auditPagePaints`
  (`test/helpers/page-visit.mjs`), so axe and colour collection share one open
  per page and scheme. Never add a second file that opens the same pages.
